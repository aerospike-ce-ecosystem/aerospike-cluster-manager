from __future__ import annotations

import logging
from typing import cast

from aerospike_py.types import Privilege as AerospikePrivilege
from fastapi import APIRouter, HTTPException, Query, Request
from starlette.responses import Response

from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.models.admin import AerospikeRole, CreateRoleRequest, Privilege
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.routers._admin_utils import (
    PRIVILEGE_CODE_TO_NAME,
    PRIVILEGE_NAME_TO_CODE,
    admin_endpoint,
)

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
                raw_code = p.get("code", "")
                # aerospike-py returns ``code`` as an int (PRIV_READ=10, ...).
                # Translate to the canonical string for API consumers; fall back
                # to ``str()`` if an unknown int slips through (defensive).
                if isinstance(raw_code, int):
                    code_str = PRIVILEGE_CODE_TO_NAME.get(raw_code, str(raw_code))
                else:
                    code_str = str(raw_code)
                privileges.append(
                    Privilege(
                        code=code_str,
                        namespace=p.get("ns") or p.get("namespace"),
                        set=p.get("set"),
                    )
                )
            else:
                # Bare scalar — assume it's an int code or already a string.
                if isinstance(p, int):
                    privileges.append(Privilege(code=PRIVILEGE_CODE_TO_NAME.get(p, str(p))))
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
@limiter.limit("20/minute")
@admin_endpoint
async def create_role(request: Request, body: CreateRoleRequest, client: AerospikeClient) -> AerospikeRole:
    """Create a new Aerospike role with specified privileges. Requires security to be enabled in aerospike.conf."""
    if not body.name or not body.privileges:
        raise HTTPException(status_code=400, detail="Missing required fields: name, privileges")

    # aerospike-py's ``Privilege`` TypedDict requires ``code`` to be an int
    # (e.g. PRIV_READ=10). Translate the human-readable string codes that
    # the REST API accepts into the int constants before passing to the
    # client. Reject unknown names with 422 rather than letting aerospike-py
    # raise ``TypeError: 'str' object cannot be interpreted as an integer``.
    privileges: list[AerospikePrivilege] = []
    for p in body.privileges:
        code_int = PRIVILEGE_NAME_TO_CODE.get(p.code)
        if code_int is None:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown privilege: {p.code!r}",
            )
        privileges.append(
            cast(
                AerospikePrivilege,
                {"code": code_int, "ns": p.namespace or "", "set": p.set or ""},
            )
        )
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
@limiter.limit("20/minute")
@admin_endpoint
async def delete_role(
    request: Request,
    client: AerospikeClient,
    name: str = Query(..., min_length=1),
) -> Response:
    """Delete an Aerospike role by name. Requires security to be enabled in aerospike.conf."""
    await client.admin_drop_role(name)

    return Response(status_code=204)
