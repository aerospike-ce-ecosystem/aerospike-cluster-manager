from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from aerospike_cluster_manager_api.dependencies import AerospikeClient, VerifiedConnId
from aerospike_cluster_manager_api.info_verbs import (
    InfoCommandNotSingle,
    InfoVerbNotAllowed,
    assert_read_only,
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


@router.post(
    "/{conn_id}/info",
    response_model=ExecuteInfoResponse,
    summary="Execute asinfo commands",
    description=(
        "Run one or more asinfo commands against a cluster. "
        "Mirrors the MCP execute_info / execute_info_on_node / "
        "execute_info_read_only contracts so ackoctl can drive raw asinfo "
        "diagnostics over the REST surface. "
        "When readOnly=true (default), each command is validated BEFORE any "
        "wire round-trip: it must hold exactly one asinfo command (the wire "
        "format is multi-command) and its leading verb must be on the "
        "read-only whitelist. A single rejected command fails the entire "
        "call with 400, and only the validated string is transmitted."
    ),
)
async def execute_info(
    body: ExecuteInfoRequest,
    client: AerospikeClient,
    conn_id: VerifiedConnId,
) -> ExecuteInfoResponse:
    """Run asinfo commands per the ExecuteInfoRequest semantics."""
    # When readOnly is on, fail-fast on the FIRST rejected command so it
    # never reaches the wire. Pydantic already enforces commands non-empty.
    #
    # Keep the VALIDATED strings and run those: forwarding body.commands
    # after validating it is the bug that let a frame carrying an
    # allowlisted verb plus a trailing second command through, since only
    # the leading verb was ever inspected.
    validated: list[str] = []
    if body.readOnly:
        for cmd in body.commands:
            try:
                validated.append(assert_read_only(cmd).command)
            except InfoVerbNotAllowed as exc:
                raise HTTPException(
                    status_code=400,
                    detail=(f"command '{exc.verb}' not in read-only whitelist; pass readOnly=false to allow"),
                ) from exc
            except InfoCommandNotSingle as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

    results: list[InfoCommandResult] = []
    target_node = body.node or None

    for cmd in validated if body.readOnly else body.commands:
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
            # Single-node, no whitelist gate.
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
            # when readOnly is on, so this branch transmits only what the gate
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
