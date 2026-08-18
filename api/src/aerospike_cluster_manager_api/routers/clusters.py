from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from aerospike_cluster_manager_api import config, rate_limit
from aerospike_cluster_manager_api.dependencies import AerospikeClient, VerifiedConnId
from aerospike_cluster_manager_api.info_verbs import (
    InfoCommandNotSingle,
    InfoVerbNotAllowed,
    InfoWriteVerbNotAllowed,
    assert_read_only,
    assert_write_allowed,
)
from aerospike_cluster_manager_api.models.cluster import (
    ClusterInfo,
    CreateNamespaceRequest,
    ExecuteInfoRequest,
    ExecuteInfoResponse,
    InfoCommandResult,
)
from aerospike_cluster_manager_api.models.common import MessageResponse
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.services import clusters_service
from aerospike_cluster_manager_api.services.clusters_service import (
    NamespaceConfigEmptyError,
    NamespaceConfigError,
    NamespaceNotFoundError,
    NodeNotFoundError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.get(
    "/{conn_id}",
    response_model=ClusterInfo,
    summary="Get cluster info",
    description="Retrieve full cluster information including nodes, namespaces, and sets.",
)
async def get_cluster(client: AerospikeClient, conn_id: VerifiedConnId) -> ClusterInfo:
    """Retrieve full cluster information including nodes, namespaces, and sets."""
    return await clusters_service.get_cluster_info(client, conn_id)


@router.post(
    "/{conn_id}/namespaces",
    status_code=200,
    response_model=MessageResponse,
    summary="Configure namespace",
    description=(
        "Update runtime-tunable parameters of an existing Aerospike namespace. "
        "Partial update: only the parameters present in the body are applied, "
        "an omitted parameter keeps its running value, and a body naming no "
        "parameter at all is rejected with 400. Unknown fields are rejected "
        "with 422 so a misspelled parameter cannot look like a success."
    ),
)
@limiter.limit("10/minute")
async def configure_namespace(
    request: Request, body: CreateNamespaceRequest, client: AerospikeClient
) -> MessageResponse:
    """Update runtime-tunable parameters of an existing Aerospike namespace."""
    try:
        message = await clusters_service.configure_namespace(client, body)
    except NamespaceConfigEmptyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except NamespaceNotFoundError as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Namespace '{exc.namespace}' does not exist. "
                "Aerospike does not support dynamic namespace creation. "
                "Namespaces must be defined in aerospike.conf and require a server restart."
            ),
        ) from exc
    except NamespaceConfigError as exc:
        # The raw Aerospike server response can leak internal details
        # (node names, build identifiers, error code paths). Surface a
        # sanitized message to the API consumer and keep the raw response
        # in the server log for operator-side debugging.
        logger.warning(
            "set-config rejected for namespace=%s: %s",
            exc.namespace,
            exc.response,
        )
        raise HTTPException(
            status_code=400,
            detail=f"Namespace '{exc.namespace}' configuration was rejected by the cluster",
        ) from exc
    return MessageResponse(message=message)


async def _assert_info_write_allowed(request: Request, body: ExecuteInfoRequest) -> None:
    """Gate the ``readOnly=false`` path BEFORE anything dials the cluster.

    This has to be a dependency, not a check in the handler body. FastAPI
    resolves the whole dependency tree before the endpoint function runs, and
    ``client: AerospikeClient`` is a dependency — so the original in-body check
    (#480) fired only *after* ``client_manager.get_client`` had already built a
    real connection. A deployment with the write path disabled therefore still
    dialled the cluster on every probe, and still answered 404 / 503 / 403
    depending on whether the connection id existed and whether its cluster was
    reachable. That is an inventory-and-reachability oracle, and it is
    unauthenticated under the ``OIDC_ENABLED=false`` default. The budget check
    was in the body too, so probes were metered by the 60/minute global rather
    than the 5/minute write budget they were supposed to consume.

    Declared via the route's ``dependencies=[...]`` list rather than as a
    handler parameter: FastAPI inserts those at position 0 of the dependency
    tree (``routing.APIRoute.__init__``), so this runs ahead of ``client`` and
    ``conn_id`` regardless of parameter order. ``tests/…::TestWriteGateRunsBefore
    TheConnection`` pins that empirically rather than trusting the reading —
    an unverified ordering claim is what produced the original gap.

    Declaring ``body`` here does not re-read the request: FastAPI parses the
    body once per request and hands the same parsed value to every dependant.

    ``readOnly=true`` is untouched — the diagnostics path ackoctl polls must
    keep reaching the cluster.
    """
    if body.readOnly:
        return

    if not config.ACM_ALLOW_INFO_WRITE:
        # 403 before the ACL, so this also cannot be used to probe which
        # connection ids exist. It discloses only the server's own config
        # flag, which is not per-tenant information.
        raise HTTPException(
            status_code=403,
            detail=(
                "asinfo write passthrough is disabled; set ACM_ALLOW_INFO_WRITE=true "
                "on the API to enable readOnly=false, or use readOnly=true for diagnostics."
            ),
        )

    # Charged before validation, so a caller cannot enumerate the allowlist for
    # free by sending commands that 400.
    if not rate_limit.consume_budget(request, rate_limit.INFO_WRITE_LIMIT, "clusters:info:write"):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded: 5 per 1 minute (asinfo write passthrough)",
        )


@router.post(
    "/{conn_id}/info",
    response_model=ExecuteInfoResponse,
    summary="Execute asinfo commands",
    description=(
        "Run one or more asinfo commands against a cluster. "
        "Mirrors the MCP execute_info / execute_info_on_node / "
        "execute_info_read_only contracts so ackoctl can drive raw asinfo "
        "diagnostics over the REST surface. "
        "Every command is validated BEFORE any wire round-trip: it must hold "
        "exactly one asinfo command (the wire format is multi-command) and its "
        "leading verb must be on a whitelist. A single rejected command fails "
        "the entire call with 400, and only the validated string is transmitted. "
        "When readOnly=true (default) the whitelist is the read-only verb set. "
        "readOnly=false selects the write passthrough, which additionally "
        "requires ACM_ALLOW_INFO_WRITE=true on the API (403 otherwise), accepts "
        "only info_verbs.WRITE_INFO_VERBS plus the read-only verbs — never "
        "destructive verbs such as truncate-namespace — and is charged against "
        "a dedicated 5/minute per-client budget (429 when exhausted)."
    ),
    dependencies=[Depends(_assert_info_write_allowed)],
)
async def execute_info(
    request: Request,
    body: ExecuteInfoRequest,
    client: AerospikeClient,
    conn_id: VerifiedConnId,
) -> ExecuteInfoResponse:
    """Run asinfo commands per the ExecuteInfoRequest semantics.

    The opt-in flag and the write rate limit are enforced by
    :func:`_assert_info_write_allowed`, which runs before the ``client``
    dependency builds a connection.
    """
    # Fail-fast on the FIRST rejected command so it never reaches the wire.
    # Pydantic already enforces commands non-empty.
    #
    # Keep the VALIDATED strings and run those: forwarding body.commands
    # after validating it is the bug that let a frame carrying an
    # allowlisted verb plus a trailing second command through, since only
    # the leading verb was ever inspected.
    validated: list[str] = []
    for cmd in body.commands:
        try:
            gate = assert_read_only if body.readOnly else assert_write_allowed
            validated.append(gate(cmd).command)
        except InfoVerbNotAllowed as exc:
            raise HTTPException(
                status_code=400,
                detail=(f"command '{exc.verb}' not in read-only whitelist; pass readOnly=false to allow"),
            ) from exc
        except InfoWriteVerbNotAllowed as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except InfoCommandNotSingle as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    results: list[InfoCommandResult] = []
    target_node = body.node or None

    for cmd in validated:
        if target_node is not None and body.readOnly:
            # Single-node read-only: whitelist already enforced above;
            # service still re-validates as a defense-in-depth.
            try:
                node, response = await clusters_service.execute_info_read_only(client, cmd, target_node)
            except NodeNotFoundError as exc:
                results.append(
                    InfoCommandResult(
                        command=cmd,
                        node=target_node,
                        output="",
                        error=str(exc),
                    )
                )
                continue
            results.append(InfoCommandResult(command=cmd, node=node, output=response))

        elif target_node is not None and not body.readOnly:
            # Single-node write passthrough. `cmd` came out of
            # assert_write_allowed above, so the verb is on the write
            # allowlist and the frame holds exactly one command; the service
            # primitive itself stays unrestricted by design.
            try:
                response = await clusters_service.execute_info_on_node(client, cmd, target_node)
            except NodeNotFoundError as exc:
                results.append(
                    InfoCommandResult(
                        command=cmd,
                        node=target_node,
                        output="",
                        error=str(exc),
                    )
                )
                continue
            results.append(InfoCommandResult(command=cmd, node=target_node, output=response))

        else:
            # Fan-out across every node. `cmd` comes from the validated list
            # on BOTH paths now, so this branch transmits only what a gate
            # returned. It previously read body.commands directly, which left
            # the allowlist advisory here — and this is the DEFAULT branch,
            # taken whenever the caller names no node. Per-node responses are
            # still returned verbatim.
            node_results = await clusters_service.execute_info(client, cmd)
            if not node_results:
                # No node responded at all — emit a single attribution-less
                # row so the caller still sees a result for this command.
                results.append(
                    InfoCommandResult(
                        command=cmd,
                        node="",
                        output="",
                        error="no nodes responded",
                    )
                )
                continue
            for r in node_results:
                # aerospike_py.InfoNodeResult is a NamedTuple
                # (node_name, error_code, response). Unpack positionally to
                # tolerate both the real NamedTuple and the plain-tuple
                # shape used by unit-test mocks.
                node_name, error_code, response_str = r[0], r[1], r[2]
                err_msg: str | None = None
                # Non-zero / truthy error_code indicates a per-node failure.
                if error_code:
                    err_msg = f"asinfo error_code={error_code}"
                results.append(
                    InfoCommandResult(
                        command=cmd,
                        node=node_name,
                        output=response_str,
                        error=err_msg,
                    )
                )

    return ExecuteInfoResponse(results=results)
