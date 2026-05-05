from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request
from starlette.responses import Response

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.dependencies import VerifiedWorkspace
from aerospike_cluster_manager_api.models.workspace import (
    DEFAULT_WORKSPACE_ID,
    CreateWorkspaceRequest,
    UpdateWorkspaceRequest,
    Workspace,
    WorkspaceResponse,
)
from aerospike_cluster_manager_api.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", summary="List workspaces", description="Retrieve all workspaces. The built-in default sorts first.")
async def list_workspaces() -> list[WorkspaceResponse]:
    workspaces = await db.get_all_workspaces()
    return [WorkspaceResponse.from_workspace(w) for w in workspaces]


@router.post(
    "",
    status_code=201,
    summary="Create workspace",
    description="Create a new workspace. The id is generated server-side.",
)
@limiter.limit("10/minute")
async def create_workspace(request: Request, body: CreateWorkspaceRequest) -> WorkspaceResponse:
    now = datetime.now(UTC).isoformat()
    ws = Workspace(
        id=f"ws-{uuid.uuid4().hex[:12]}",
        name=body.name,
        color=body.color,
        description=body.description,
        isDefault=False,
        createdAt=now,
        updatedAt=now,
    )
    await db.create_workspace(ws)
    return WorkspaceResponse.from_workspace(ws)


@router.get("/{workspace_id}", summary="Get workspace", description="Retrieve a single workspace by id.")
async def get_workspace(ws: VerifiedWorkspace) -> WorkspaceResponse:
    return WorkspaceResponse.from_workspace(ws)


@router.put(
    "/{workspace_id}",
    summary="Update workspace",
    description="Update a workspace's name, color, or description. The default workspace can be renamed.",
)
async def update_workspace(body: UpdateWorkspaceRequest, ws: VerifiedWorkspace) -> WorkspaceResponse:
    update_data = body.model_dump(exclude_unset=True, by_alias=False)
    updated = await db.update_workspace(ws.id, update_data)
    if not updated:
        # Race: workspace deleted between dependency resolution and update.
        raise HTTPException(status_code=404, detail=f"Workspace '{ws.id}' not found")
    return WorkspaceResponse.from_workspace(updated)


@router.delete(
    "/{workspace_id}",
    status_code=204,
    summary="Delete workspace",
    description=(
        "Delete a workspace. The built-in default cannot be deleted. "
        "Workspaces with connections still attached are rejected with 409 — "
        "move or delete those connections first."
    ),
)
@limiter.limit("10/minute")
async def delete_workspace(request: Request, ws: VerifiedWorkspace) -> Response:
    if ws.isDefault or ws.id == DEFAULT_WORKSPACE_ID:
        raise HTTPException(status_code=400, detail="The default workspace cannot be deleted")
    remaining = await db.count_connections_in_workspace(ws.id)
    if remaining > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Workspace '{ws.id}' still has {remaining} connection(s). "
                "Move or delete them before deleting the workspace."
            ),
        )
    await db.delete_workspace(ws.id)
    return Response(status_code=204)
