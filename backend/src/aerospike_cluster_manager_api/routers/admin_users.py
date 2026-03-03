from __future__ import annotations

import logging

from aerospike_py.exception import AdminError, AerospikeError
from fastapi import APIRouter, HTTPException, Query
from starlette.responses import Response

from aerospike_cluster_manager_api.constants import EE_MSG
from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.models.admin import AerospikeUser, ChangePasswordRequest, CreateUserRequest
from aerospike_cluster_manager_api.models.common import MessageResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin-users"])


@router.get(
    "/{conn_id}/users",
    summary="List users",
    description="Retrieve all Aerospike users and their roles. Requires security to be enabled in aerospike.conf.",
)
async def get_users(client: AerospikeClient) -> list[AerospikeUser]:
    """Retrieve all Aerospike users and their roles. Requires security to be enabled in aerospike.conf."""
    try:
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
    except AdminError:
        raise HTTPException(status_code=403, detail=EE_MSG) from None
    except AerospikeError as e:
        if "security" in str(e).lower() or "not enabled" in str(e).lower() or "not supported" in str(e).lower():
            raise HTTPException(status_code=403, detail=EE_MSG) from None
        raise


@router.post(
    "/{conn_id}/users",
    status_code=201,
    summary="Create user",
    description="Create a new Aerospike user with specified roles. Requires security to be enabled in aerospike.conf.",
)
async def create_user(body: CreateUserRequest, client: AerospikeClient) -> AerospikeUser:
    """Create a new Aerospike user with specified roles. Requires security to be enabled in aerospike.conf."""
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Missing required fields: username, password")

    try:
        await client.admin_create_user(body.username, body.password, body.roles or [])
    except AdminError:
        raise HTTPException(status_code=403, detail=EE_MSG) from None

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
async def change_password(body: ChangePasswordRequest, client: AerospikeClient) -> MessageResponse:
    """Change the password for an existing Aerospike user. Requires security to be enabled in aerospike.conf."""
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Missing required fields: username, password")

    try:
        await client.admin_change_password(body.username, body.password)
    except AdminError:
        raise HTTPException(status_code=403, detail=EE_MSG) from None

    return MessageResponse(message="Password updated")


@router.delete(
    "/{conn_id}/users",
    status_code=204,
    summary="Delete user",
    description="Delete an Aerospike user by username. Requires security to be enabled in aerospike.conf.",
)
async def delete_user(
    client: AerospikeClient,
    username: str = Query(..., min_length=1),
) -> Response:
    """Delete an Aerospike user by username. Requires security to be enabled in aerospike.conf."""
    try:
        await client.admin_drop_user(username)
    except AdminError:
        raise HTTPException(status_code=403, detail=EE_MSG) from None

    return Response(status_code=204)
