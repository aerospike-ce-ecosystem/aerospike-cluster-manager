from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, Request
from starlette.responses import Response

from aerospike_cluster_manager_api.dependencies import AerospikeClient, VerifiedConnId
from aerospike_cluster_manager_api.models.admin import AerospikeUser, ChangePasswordRequest, CreateUserRequest
from aerospike_cluster_manager_api.models.common import MessageResponse
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.routers._admin_utils import admin_endpoint

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin-users"])


@router.get(
    "/{conn_id}/users",
    summary="List users",
    description="Retrieve all Aerospike users and their roles. Requires security to be enabled in aerospike.conf.",
)
@admin_endpoint
async def get_users(client: AerospikeClient, conn_id: VerifiedConnId) -> list[AerospikeUser]:
    """Retrieve all Aerospike users and their roles. Requires security to be enabled in aerospike.conf."""
    # ``conn_id`` is unused inside the body — its only job is to trigger
    # the workspace ACL via :data:`VerifiedConnId` before the admin call
    # reaches the Aerospike cluster. Without this gate a caller could
    # manipulate ``conn_id`` in the path to read users from a connection
    # owned by a different workspace (cross-tenant data leak).
    _ = conn_id
    raw_users = await client.admin_query_users_info()
    users: list[AerospikeUser] = []
    for info in raw_users:
        users.append(
            AerospikeUser(
                username=info.get("user", ""),
                roles=info.get("roles", []),
                readQuota=info.get("read_quota", 0),
                writeQuota=info.get("write_quota", 0),
                connections=info.get("connections", 0),
            )
        )
    return users


@router.post(
    "/{conn_id}/users",
    status_code=201,
    summary="Create user",
    description="Create a new Aerospike user with specified roles. Requires security to be enabled in aerospike.conf.",
)
@limiter.limit("20/minute")
@admin_endpoint
async def create_user(
    request: Request,
    body: CreateUserRequest,
    client: AerospikeClient,
    conn_id: VerifiedConnId,
) -> AerospikeUser:
    """Create a new Aerospike user with specified roles. Requires security to be enabled in aerospike.conf."""
    # ``conn_id`` gates the destructive call behind the workspace ACL —
    # see ``get_users`` above for the full rationale.
    _ = conn_id
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Missing required fields: username, password")

    await client.admin_create_user(body.username, body.password, body.roles or [])

    return AerospikeUser(
        username=body.username,
        roles=body.roles or [],
        readQuota=0,
        writeQuota=0,
        connections=0,
    )


@router.patch(
    "/{conn_id}/users",
    response_model=MessageResponse,
    summary="Change user password",
    description="Change the password for an existing Aerospike user. Requires security to be enabled in aerospike.conf.",
)
@limiter.limit("20/minute")
@admin_endpoint
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    client: AerospikeClient,
    conn_id: VerifiedConnId,
) -> MessageResponse:
    """Change the password for an existing Aerospike user. Requires security to be enabled in aerospike.conf."""
    _ = conn_id
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Missing required fields: username, password")

    await client.admin_change_password(body.username, body.password)

    return MessageResponse(message="Password updated")


@router.delete(
    "/{conn_id}/users",
    status_code=204,
    summary="Delete user",
    description="Delete an Aerospike user by username. Requires security to be enabled in aerospike.conf.",
)
@limiter.limit("20/minute")
@admin_endpoint
async def delete_user(
    request: Request,
    client: AerospikeClient,
    conn_id: VerifiedConnId,
    username: str = Query(..., min_length=1),
) -> Response:
    """Delete an Aerospike user by username. Requires security to be enabled in aerospike.conf."""
    _ = conn_id
    await client.admin_drop_user(username)

    return Response(status_code=204)
