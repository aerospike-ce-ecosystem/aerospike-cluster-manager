from __future__ import annotations

import asyncio
import logging

from aerospike_py.exception import AerospikeError, AerospikeTimeoutError, ClusterError
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.responses import Response

from aerospike_cluster_manager_api.client_manager import client_manager
from aerospike_cluster_manager_api.constants import INFO_BUILD, INFO_EDITION, INFO_NAMESPACES, NS_SUM_KEYS
from aerospike_cluster_manager_api.dependencies import CallerOwnerId, _get_verified_connection
from aerospike_cluster_manager_api.info_parser import aggregate_node_kv, parse_list, safe_int
from aerospike_cluster_manager_api.models.connection import (
    ConnectionErrorType,
    ConnectionProfileResponse,
    ConnectionStatus,
    CreateConnectionRequest,
    TestConnectionRequest,
    TestConnectionResponse,
    UpdateConnectionRequest,
)
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.services import connections_service
from aerospike_cluster_manager_api.services.connections_service import (
    ConnectionNotFoundError,
    WorkspaceNotFoundError,
)
from aerospike_cluster_manager_api.target_policy import (
    ALLOW_PRIVATE_TARGETS_ENV,
    BlockedConnectionTargetError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connections", tags=["connections"])


def _blocked_target_detail(exc: BlockedConnectionTargetError) -> str:
    """HTTP detail for a target the SSRF denylist rejected.

    Echoes the host because the caller is the one who just supplied it —
    there is nothing to disclose — and names the escape hatch so a dev
    deployment running Aerospike on the loopback knows what to set.
    """
    return (
        f"Connection target '{exc.host}' is not allowed: loopback and link-local addresses "
        f"are denied to prevent the API being used as an SSRF probe. "
        f"Set {ALLOW_PRIVATE_TARGETS_ENV}=true on the API for local development."
    )


@router.get(
    "",
    response_model=list[ConnectionProfileResponse],
    summary="List connections",
    description="Retrieve all saved Aerospike connection profiles.",
)
async def list_connections(
    caller_owner_id: CallerOwnerId,
    workspace_id: str | None = Query(default=None, description="Filter by workspace id."),
) -> list[ConnectionProfileResponse]:
    """Retrieve all saved Aerospike connection profiles, optionally filtered by workspace.

    Phase 2: when ``workspace_id`` is supplied, the workspace must be visible
    to the caller (owned by them or by the synthetic ``system`` user). Cross-
    owner filters return 404 to avoid leaking workspace existence.
    """
    try:
        return await connections_service.list_connections(workspace_id, caller_owner_id)
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "",
    status_code=201,
    response_model=ConnectionProfileResponse,
    summary="Create connection",
    description="Create a new Aerospike connection profile.",
)
@limiter.limit("10/minute")
async def create_connection(
    request: Request,
    body: CreateConnectionRequest,
    caller_owner_id: CallerOwnerId,
) -> ConnectionProfileResponse:
    """Create a new Aerospike connection profile.

    Phase 2: the supplied ``workspaceId`` (or the default fallback) must be
    visible to the caller; otherwise 404. A host on the SSRF denylist
    (loopback / link-local, see :mod:`target_policy`) is a 400 — the caller
    supplied the address, so naming it back is not a disclosure.
    """
    try:
        return await connections_service.create_connection(body, caller_owner_id)
    except BlockedConnectionTargetError as exc:
        raise HTTPException(status_code=400, detail=_blocked_target_detail(exc)) from exc
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/{conn_id}",
    response_model=ConnectionProfileResponse,
    summary="Get connection",
    description="Retrieve a single connection profile by its ID.",
)
async def get_connection(
    caller_owner_id: CallerOwnerId,
    conn_id: str = Depends(_get_verified_connection),
) -> ConnectionProfileResponse:
    """Retrieve a single connection profile by its ID.

    The dependency enforces the workspace ACL: the caller must own the
    connection's workspace (or the row must live in the shared
    ``SYSTEM_OWNER_ID`` workspace). Cross-tenant probes 404 to keep the
    wire shape identical to the missing-row case.

    ``caller_owner_id`` is also threaded into the service-layer call as
    defense-in-depth (P1-2) so a future refactor that bypasses
    ``_get_verified_connection`` still hits the ACL.
    """
    try:
        return await connections_service.get_connection(conn_id, caller_owner_id)
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put(
    "/{conn_id}",
    response_model=ConnectionProfileResponse,
    summary="Update connection",
    description="Update an existing connection profile with new settings.",
)
@limiter.limit("10/minute")
async def update_connection(
    request: Request,
    body: UpdateConnectionRequest,
    caller_owner_id: CallerOwnerId,
    conn_id: str = Depends(_get_verified_connection),
) -> ConnectionProfileResponse:
    """Update an existing connection profile with new settings.

    The dependency rejects callers who do not own the connection's
    workspace (404, identity wire shape with missing-row). Moving the
    connection to a workspace the caller cannot see is also a 404 — the
    service-layer ``WorkspaceNotFoundError`` is mapped here.
    """
    try:
        return await connections_service.update_connection(conn_id, body, caller_owner_id)
    except BlockedConnectionTargetError as exc:
        raise HTTPException(status_code=400, detail=_blocked_target_detail(exc)) from exc
    except ConnectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/{conn_id}/health",
    summary="Check connection health",
    description="Check the health status of an Aerospike cluster connection.",
    response_model=None,
)
async def get_connection_health(conn_id: str = Depends(_get_verified_connection)) -> ConnectionStatus | Response:
    """Check the health status of an Aerospike cluster connection.

    Always returns HTTP 200. Uses ``connected: false`` to signal unreachable clusters
    so that the frontend health indicator never mistakes a transient 503 for a permanent failure.

    The failure shape is deliberately coarse (#470). This route is reachable
    unauthenticated in the default configuration and carries no rate limit,
    so a response that distinguished a closed port from a filtered one from a
    live non-Aerospike listener — and echoed the driver's exception text —
    turned any stored profile into a port-scan oracle. Every connection-level
    failure now reports ``errorType: "unreachable"`` with a fixed message; the
    specific exception goes to the operator log only.

    ``not_found`` (the profile vanished mid-check) and ``auth_error`` survive
    as distinct values: neither is a reachability signal, and both are
    directly actionable for the operator.
    """
    try:
        client = await client_manager.get_client(conn_id)

        # get_node_names() is synchronous — call it before the async gather
        node_names = client.get_node_names()

        # Fetch namespace list, build, and edition in parallel
        ns_raw, build_raw, edition_raw = await asyncio.gather(
            client.info_random_node(INFO_NAMESPACES),
            client.info_random_node(INFO_BUILD),
            client.info_random_node(INFO_EDITION),
        )
        namespaces = parse_list(ns_raw)
        build = build_raw.strip()
        edition = edition_raw.strip()
        node_count = len(node_names)

        # Collect namespace-level summary metrics
        memory_used = 0
        memory_total = 0
        disk_used = 0
        disk_total = 0

        try:
            # Fetch all namespace info from every node in parallel. info_all
            # returns per-node responses; aggregate_node_kv sums the size keys
            # across nodes for an accurate cluster-wide total. Sampling a single
            # random node and multiplying by node_count is wrong on an
            # unbalanced cluster.
            #
            # ``return_exceptions=True`` so a transient ``info_all`` failure on a
            # single namespace does not abandon the whole aggregation loop. Without
            # it, gather() re-raises the first failure, the broad ``except`` below
            # swallows it at debug level, and the health card reports
            # memory/disk = 0 for the ENTIRE cluster even though every node and the
            # other namespaces are healthy. We skip the failed namespace and sum the
            # ones that did respond — same per-namespace partial-failure convention
            # as GET /metrics/{conn_id} (#431) and GET /clusters/{conn_id} (#430).
            if namespaces:
                ns_infos = await asyncio.gather(
                    *[client.info_all(f"namespace/{ns_name}") for ns_name in namespaces],
                    return_exceptions=True,
                )
            else:
                ns_infos = []

            for ns_name, ns_info in zip(namespaces, ns_infos, strict=True):
                # Skip a namespace whose namespace/<ns> info call raised.
                # Aggregating against the BaseException placeholder gather()
                # inserted would itself crash, so drop it and carry on with the
                # healthy namespaces instead of zeroing the whole summary.
                if isinstance(ns_info, BaseException):
                    logger.warning(
                        "Failed to fetch namespace info for namespace %s on connection '%s'; "
                        "omitting from health summary",
                        ns_name,
                        conn_id,
                        exc_info=ns_info,
                    )
                    continue
                kv = aggregate_node_kv(ns_info, keys_to_sum=NS_SUM_KEYS)
                # CE 8 uses unified data_used_bytes/data_total_bytes for both memory and device.
                # Fall back to legacy memory_used_bytes/memory-size for older versions.
                ns_data_used = (
                    safe_int(kv.get("data_used_bytes"))
                    if "data_used_bytes" in kv
                    else safe_int(kv.get("memory_used_bytes"))
                )
                ns_data_total = (
                    safe_int(kv.get("data_total_bytes"))
                    if "data_total_bytes" in kv
                    else safe_int(kv.get("memory-size"))
                )
                memory_used += ns_data_used
                memory_total += ns_data_total
                disk_used += safe_int(kv.get("device_used_bytes"))
                disk_total += safe_int(kv.get("device-total-bytes"))
        except Exception:
            logger.debug("Failed to collect namespace stats for connection '%s'", conn_id, exc_info=True)

        # Compute tend health defensively BEFORE the success-path constructor.
        # namespaces/build/edition were already fetched successfully, so the
        # cluster is reachable. A transient AerospikeError/OSError from ping()
        # must NOT bubble into the outer `except (AerospikeError, OSError)` and
        # flip the response to connected=false for an otherwise-healthy cluster
        # — degrade tendHealthy to None instead.
        tend_healthy: bool | None = None
        if hasattr(client, "ping"):  # ping() added in aerospike-py 0.0.5
            try:
                tend_healthy = await client.ping()  # type: ignore[attr-defined]
            except (AerospikeError, OSError):
                logger.debug("ping() failed for connection '%s'; reporting tendHealthy=None", conn_id, exc_info=True)
                tend_healthy = None

        return ConnectionStatus(
            connected=True,
            nodeCount=node_count,
            namespaceCount=len(namespaces),
            build=build,
            edition=edition,
            memoryUsed=memory_used,
            memoryTotal=memory_total,
            diskUsed=disk_used,
            diskTotal=disk_total,
            tendHealthy=tend_healthy,
        )
    except BlockedConnectionTargetError:
        # A stored profile that predates the create/update gate, or one written
        # by a path that bypassed them. Must come before the ValueError branch
        # below — BlockedConnectionTargetError subclasses ValueError.
        logger.warning("Health check for connection '%s' targets a denied address", conn_id, exc_info=True)
        return _disconnected_health("blocked_target")
    except ValueError:
        # Profile vanished between the route dependency check and the client
        # fetch (TOCTOU) — get_client() raises a plain ValueError. Surface as
        # the disconnected shape, not an opaque 500.
        logger.warning("Connection '%s' disappeared during health check", conn_id, exc_info=True)
        return _disconnected_health("not_found")
    except (AerospikeTimeoutError, ConnectionRefusedError, ClusterError):
        # One bucket on purpose: a timeout, a refusal, and a cluster-protocol
        # error are exactly the three answers that let a caller tell a filtered
        # port from a closed one from a live non-Aerospike listener.
        logger.warning("Health check failed for connection '%s'", conn_id, exc_info=True)
        return _disconnected_health("unreachable")
    except (AerospikeError, OSError) as exc:
        logger.warning("Health check failed for connection '%s'", conn_id, exc_info=True)
        # An auth rejection already implies a real Aerospike answered, so
        # keeping it distinct discloses nothing further and tells the operator
        # to go fix the credentials rather than the network.
        is_auth = isinstance(exc, AerospikeError) and "security" in str(exc).lower()
        return _disconnected_health("auth_error" if is_auth else "unreachable")


# Fixed operator-facing text per errorType. The driver's own exception string
# is never returned: it carries host, port, and node identity, which is the
# other half of what made the health route a scanner (#470). It is logged.
_HEALTH_ERROR_MESSAGES: dict[ConnectionErrorType, str] = {
    "not_found": "Connection profile no longer exists",
    "unreachable": "Unable to reach the Aerospike cluster",
    "auth_error": "Aerospike rejected the stored credentials",
    "blocked_target": (
        "Connection target is not allowed: loopback and link-local addresses are denied. "
        f"Set {ALLOW_PRIVATE_TARGETS_ENV}=true on the API for local development."
    ),
}


def _disconnected_health(error_type: ConnectionErrorType) -> Response:
    """Build a JSON Response for the ``connected=false`` health-check shape.

    Takes only the ``error_type``; the message is looked up from
    :data:`_HEALTH_ERROR_MESSAGES` so no call site can accidentally pass an
    exception string through to the wire.
    """
    return Response(
        content=ConnectionStatus(
            connected=False,
            nodeCount=0,
            namespaceCount=0,
            error=_HEALTH_ERROR_MESSAGES[error_type],
            errorType=error_type,
        ).model_dump_json(),
        media_type="application/json",
        headers={"Retry-After": "30"},
    )


@router.post(
    "/test",
    response_model=TestConnectionResponse,
    summary="Test connection",
    description="Test connectivity to an Aerospike cluster without saving the profile.",
)
@limiter.limit("5/minute")
async def test_connection(
    request: Request,
    body: TestConnectionRequest,
    caller_owner_id: CallerOwnerId,
) -> TestConnectionResponse:
    """Test connectivity to an Aerospike cluster without saving the profile.

    Failure messages are normalised to a generic ``"connection failed"``
    string so the REST surface does not leak host/port or driver
    internals to the caller. The original exception text is preserved in
    the structured operator log alongside the caller identity so an SRE
    debugging a flapping cluster still has the underlying error.
    """
    result = await connections_service.test_connection(body)
    if not result.success:
        # Generic wire response, structured operator log with detail.
        logger.warning(
            "REST test_connection failure: caller_owner_id=%s hosts=%s port=%s detail=%s",
            caller_owner_id,
            body.hosts,
            body.port,
            result.message,
        )
        return TestConnectionResponse(success=False, message="connection failed")
    return TestConnectionResponse(success=True, message=result.message)


@router.delete(
    "/{conn_id}",
    status_code=204,
    summary="Delete connection",
    description="Delete a connection profile and close its active client.",
)
@limiter.limit("10/minute")
async def delete_connection(
    request: Request,
    caller_owner_id: CallerOwnerId,
    conn_id: str = Depends(_get_verified_connection),
) -> Response:
    """Delete a connection profile and close its active client.

    The dependency already enforces the workspace ACL (returning 404 on
    cross-tenant attempts). ``caller_owner_id`` is threaded into the
    service call as defense-in-depth — mirrors :func:`update_connection`
    so a future refactor that bypasses ``_get_verified_connection`` still
    hits the gate at the service boundary.
    """
    try:
        await connections_service.delete_connection(conn_id, caller_owner_id)
    except ConnectionNotFoundError as exc:
        # Service-layer ACL rejected after the dependency cleared. Map to
        # 404 with the same wire shape the dependency uses — id
        # enumeration cannot distinguish "missing" from "not yours".
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(status_code=204)
