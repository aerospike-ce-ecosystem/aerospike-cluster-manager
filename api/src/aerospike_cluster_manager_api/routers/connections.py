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
    ConnectionProfileResponse,
    ConnectionStatus,
    CreateConnectionRequest,
    TestConnectionRequest,
    UpdateConnectionRequest,
)
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.services import connections_service
from aerospike_cluster_manager_api.services.connections_service import (
    ConnectionNotFoundError,
    WorkspaceNotFoundError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connections", tags=["connections"])


@router.get("", summary="List connections", description="Retrieve all saved Aerospike connection profiles.")
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


@router.post("", status_code=201, summary="Create connection", description="Create a new Aerospike connection profile.")
@limiter.limit("10/minute")
async def create_connection(
    request: Request,
    body: CreateConnectionRequest,
    caller_owner_id: CallerOwnerId,
) -> ConnectionProfileResponse:
    """Create a new Aerospike connection profile.

    Phase 2: the supplied ``workspaceId`` (or the default fallback) must be
    visible to the caller; otherwise 404.
    """
    try:
        return await connections_service.create_connection(body, caller_owner_id)
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{conn_id}", summary="Get connection", description="Retrieve a single connection profile by its ID.")
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
    "/{conn_id}", summary="Update connection", description="Update an existing connection profile with new settings."
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
            if namespaces:
                ns_infos = await asyncio.gather(*[client.info_all(f"namespace/{ns_name}") for ns_name in namespaces])
            else:
                ns_infos = []

            for ns_info in ns_infos:
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
            tendHealthy=await client.ping() if hasattr(client, "ping") else None,  # type: ignore[attr-defined]  # ping() added in aerospike-py 0.0.5
        )
    except AerospikeTimeoutError as exc:
        logger.warning("Health check timed out for connection '%s'", conn_id, exc_info=True)
        return _disconnected_health(str(exc), "timeout")
    except ConnectionRefusedError as exc:
        logger.warning("Connection refused for '%s'", conn_id, exc_info=True)
        return _disconnected_health(str(exc), "connection_refused")
    except ClusterError as exc:
        logger.warning("Cluster error for connection '%s'", conn_id, exc_info=True)
        return _disconnected_health(str(exc), "cluster_error")
    except (AerospikeError, OSError) as exc:
        logger.warning("Health check failed for connection '%s'", conn_id, exc_info=True)
        error_type = "auth_error" if isinstance(exc, AerospikeError) and "security" in str(exc).lower() else "unknown"
        return _disconnected_health(str(exc), error_type)


def _disconnected_health(error: str, error_type: str) -> Response:
    """Build a JSON Response for the ``connected=false`` health-check shape."""
    return Response(
        content=ConnectionStatus(
            connected=False, nodeCount=0, namespaceCount=0, error=error, errorType=error_type
        ).model_dump_json(),
        media_type="application/json",
        headers={"Retry-After": "30"},
    )


@router.post(
    "/test",
    summary="Test connection",
    description="Test connectivity to an Aerospike cluster without saving the profile.",
)
@limiter.limit("5/minute")
async def test_connection(
    request: Request,
    body: TestConnectionRequest,
    caller_owner_id: CallerOwnerId,
) -> dict[str, bool | str]:
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
        return {"success": False, "message": "connection failed"}
    return {"success": True, "message": result.message}


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
