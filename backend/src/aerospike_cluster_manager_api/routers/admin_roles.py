from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query
from starlette.responses import Response

from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.models.admin import AerospikeRole, CreateRoleRequest, Privilege
from aerospike_cluster_manager_api.routers._admin_utils import admin_endpoint

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin-roles"])


@router.get(
    "/{conn_id}/roles",
    summary="List roles",
    description="Retrieve all Aerospike roles and their privileges. Requires security to be enabled in aerospike.conf.",
)
@admin_endpoint
async def get_roles(client: AerospikeClient) -> list[AerospikeRole]:
    """Retrieve all Aerospike roles and their privileges. Requires security to be enabled in aerospike.conf."""
    raw_roles = await client.admin_query_roles()
    roles: list[AerospikeRole] = []
    for info in raw_roles:
        privs_raw = info.get("privileges", [])
        privileges: list[Privilege] = []
        for p in privs_raw:
            if isinstance(p, dict):
                privileges.append(
                    Privilege(
                        code=p.get("code", ""),
                        namespace=p.get("ns") or p.get("namespace"),
                        set=p.get("set"),
                    )
                )
            else:
                privileges.append(Privilege(code=str(p)))

        roles.append(
            AerospikeRole(
                name=info.get("role", ""),
                privileges=privileges,
                whitelist=info.get("whitelist", []),
                readQuota=info.get("read_quota", 0),
                writeQuota=info.get("write_quota", 0),
            )
        )
    return roles


@router.post(
    "/{conn_id}/roles",
    status_code=201,
    summary="Create role",
    description="Create a new Aerospike role with specified privileges. Requires security to be enabled in aerospike.conf.",
)
@admin_endpoint
async def create_role(body: CreateRoleRequest, client: AerospikeClient) -> AerospikeRole:
    """Create a new Aerospike role with specified privileges. Requires security to be enabled in aerospike.conf."""
    if not body.name or not body.privileges:
        raise HTTPException(status_code=400, detail="Missing required fields: name, privileges")

    privileges = [{"code": p.code, "ns": p.namespace or "", "set": p.set or ""} for p in body.privileges]
    await client.admin_create_role(
        body.name,
        privileges,
        whitelist=body.whitelist or [],
        read_quota=body.readQuota or 0,
        write_quota=body.writeQuota or 0,
    )

    return AerospikeRole(
        name=body.name,
        privileges=body.privileges,
        whitelist=body.whitelist or [],
        readQuota=body.readQuota or 0,
        writeQuota=body.writeQuota or 0,
    )


@router.delete(
    "/{conn_id}/roles",
    status_code=204,
    summary="Delete role",
    description="Delete an Aerospike role by name. Requires security to be enabled in aerospike.conf.",
)
@admin_endpoint
async def delete_role(
    client: AerospikeClient,
    name: str = Query(..., min_length=1),
) -> Response:
    """Delete an Aerospike role by name. Requires security to be enabled in aerospike.conf."""
    await client.admin_drop_role(name)

    return Response(status_code=204)
