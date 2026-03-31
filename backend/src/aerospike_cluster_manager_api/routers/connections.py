from __future__ import annotations

import asyncio
import contextlib
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

import aerospike_py
from aerospike_py.exception import AerospikeError, ClusterError
from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.responses import Response

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.client_manager import client_manager
from aerospike_cluster_manager_api.constants import INFO_BUILD, INFO_EDITION, INFO_NAMESPACES
from aerospike_cluster_manager_api.dependencies import VerifiedConnectionProfile, _get_verified_connection
from aerospike_cluster_manager_api.info_parser import parse_kv_pairs, parse_list, safe_int
from aerospike_cluster_manager_api.models.connection import (
    ConnectionProfile,
    ConnectionProfileResponse,
    ConnectionStatus,
    CreateConnectionRequest,
    TestConnectionRequest,
    UpdateConnectionRequest,
)
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.utils import parse_host_port

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connections", tags=["connections"])


@router.get("", summary="List connections", description="Retrieve all saved Aerospike connection profiles.")
async def list_connections() -> list[ConnectionProfileResponse]:
    """Retrieve all saved Aerospike connection profiles."""
    profiles = await db.get_all_connections()
    return [ConnectionProfileResponse.from_profile(p) for p in profiles]


@router.post("", status_code=201, summary="Create connection", description="Create a new Aerospike connection profile.")
@limiter.limit("10/minute")
async def create_connection(request: Request, body: CreateConnectionRequest) -> ConnectionProfileResponse:
    """Create a new Aerospike connection profile."""
    now = datetime.now(UTC).isoformat()
    conn = ConnectionProfile(
        id=f"conn-{uuid.uuid4().hex[:12]}",
        name=body.name,
        hosts=body.hosts,
        port=body.port,
        clusterName=body.clusterName,
        username=body.username,
        password=body.password,
        color=body.color,
        description=body.description,
        createdAt=now,
        updatedAt=now,
    )
    await db.create_connection(conn)
    return ConnectionProfileResponse.from_profile(conn)


@router.get("/{conn_id}", summary="Get connection", description="Retrieve a single connection profile by its ID.")
async def get_connection(conn: VerifiedConnectionProfile) -> ConnectionProfileResponse:
    """Retrieve a single connection profile by its ID."""
    return ConnectionProfileResponse.from_profile(conn)


@router.put(
    "/{conn_id}", summary="Update connection", description="Update an existing connection profile with new settings."
)
async def update_connection(
    body: UpdateConnectionRequest,
    conn_id: str = Depends(_get_verified_connection),
) -> ConnectionProfileResponse:
    """Update an existing connection profile with new settings."""
    update_data = body.model_dump(exclude_unset=True, by_alias=False)
    conn = await db.update_connection(conn_id, update_data)
    if not conn:
        raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")
    return ConnectionProfileResponse.from_profile(conn)


@router.get(
    "/{conn_id}/health",
    summary="Check connection health",
    description="Check the health status of an Aerospike cluster connection.",
)
async def get_connection_health(conn_id: str = Depends(_get_verified_connection)) -> ConnectionStatus:
    """Check the health status of an Aerospike cluster connection.

    Always returns HTTP 200. Uses ``connected: false`` to signal unreachable clusters
    so that the frontend health indicator never mistakes a transient 503 for a permanent failure.
    """
    try:
        client = await client_manager.get_client(conn_id)

        # Fetch node names, namespace list, build, and edition in parallel
        node_names, ns_raw, build_raw, edition_raw = await asyncio.gather(
            client.get_node_names(),  # type: ignore[misc]  # async in runtime, sync in stubs
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
            # Fetch all namespace info in parallel
            if namespaces:
                ns_infos = await asyncio.gather(
                    *[client.info_random_node(f"namespace/{ns_name}") for ns_name in namespaces]
                )
            else:
                ns_infos = []

            for ns_info in ns_infos:
                kv = parse_kv_pairs(ns_info)
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
                # Multiply per-node values by node count for cluster-wide estimate
                memory_used += ns_data_used * node_count
                memory_total += ns_data_total * node_count
                disk_used += safe_int(kv.get("device_used_bytes")) * node_count
                disk_total += safe_int(kv.get("device-total-bytes")) * node_count
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
            tendHealthy=await client.ping(),  # type: ignore[attr-defined]  # ping() added in aerospike-py 0.0.5
        )
    except (AerospikeError, ClusterError, ConnectionRefusedError, OSError):
        logger.warning("Health check failed for connection '%s'", conn_id, exc_info=True)
        return ConnectionStatus(connected=False, nodeCount=0, namespaceCount=0)


@router.post(
    "/test",
    summary="Test connection",
    description="Test connectivity to an Aerospike cluster without saving the profile.",
)
@limiter.limit("5/minute")
async def test_connection(request: Request, body: TestConnectionRequest) -> dict:
    """Test connectivity to an Aerospike cluster without saving the profile."""
    try:
        hosts = [parse_host_port(h, body.port) for h in body.hosts]

        config: dict[str, Any] = {"hosts": hosts}
        if body.username and body.password:
            config["user"] = body.username
            config["password"] = body.password

        client = aerospike_py.AsyncClient(config)
        await client.connect()
        try:
            if not client.is_connected():
                return {"success": False, "message": "Failed to connect"}
            return {"success": True, "message": "Connected successfully"}
        finally:
            with contextlib.suppress(AerospikeError, OSError):
                await client.close()
    except Exception as e:
        logger.exception("Test connection failed")
        return {"success": False, "message": str(e)}


@router.delete(
    "/{conn_id}",
    status_code=204,
    summary="Delete connection",
    description="Delete a connection profile and close its active client.",
)
@limiter.limit("10/minute")
async def delete_connection(request: Request, conn_id: str = Depends(_get_verified_connection)) -> Response:
    """Delete a connection profile and close its active client."""
    await db.delete_connection(conn_id)
    await client_manager.close_client(conn_id)
    return Response(status_code=204)
