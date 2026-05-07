from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Path, Request
from starlette.responses import Response

from aerospike_cluster_manager_api.dependencies import CallerOwnerId
from aerospike_cluster_manager_api.models.workspace import (
    CreateWorkspaceRequest,
    UpdateWorkspaceRequest,
    WorkspaceResponse,
)
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.services import workspaces_service
from aerospike_cluster_manager_api.services.connections_service import (
    WorkspaceNotFoundError,
)
from aerospike_cluster_manager_api.services.workspaces_service import (
    WorkspaceHasConnectionsError,
    WorkspaceIsDefaultError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get(
    "",
    summary="List workspaces",
    description=(
        "Retrieve workspaces visible to the caller. The built-in default sorts first. "
        "Phase 2 (issue #307): rows owned by other OIDC subjects are filtered out; "
        "rows owned by the synthetic ``system`` user (the default workspace and any "
        "pre-migration rows) remain visible to every authenticated caller."
    ),
)
async def list_workspaces(caller_owner_id: CallerOwnerId) -> list[WorkspaceResponse]:
    return await workspaces_service.list_workspaces(caller_owner_id)


@router.post(
    "",
    status_code=201,
    summary="Create workspace",
    description="Create a new workspace. The id and ownerId are populated server-side.",
)
@limiter.limit("10/minute")
async def create_workspace(
    request: Request,
    body: CreateWorkspaceRequest,
    caller_owner_id: CallerOwnerId,
) -> WorkspaceResponse:
    return await workspaces_service.create_workspace(body, caller_owner_id)


@router.get(
    "/{workspace_id}",
    summary="Get workspace",
    description="Retrieve a single workspace by id. Returns 404 when the row is invisible to the caller.",
)
async def get_workspace(
    caller_owner_id: CallerOwnerId,
    workspace_id: str = Path(),
) -> WorkspaceResponse:
    try:
        return await workspaces_service.get_workspace(workspace_id, caller_owner_id)
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put(
    "/{workspace_id}",
    summary="Update workspace",
    description=(
        "Update a workspace's name, color, or description. The default workspace can be renamed. "
        "``ownerId`` is read-only and silently ignored — Phase 2 forbids workspace transfers."
    ),
)
async def update_workspace(
    body: UpdateWorkspaceRequest,
    caller_owner_id: CallerOwnerId,
    workspace_id: str = Path(),
) -> WorkspaceResponse:
    try:
        return await workspaces_service.update_workspace(workspace_id, body, caller_owner_id)
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
async def delete_workspace(
    request: Request,
    caller_owner_id: CallerOwnerId,
    workspace_id: str = Path(),
) -> Response:
    try:
        await workspaces_service.delete_workspace(workspace_id, caller_owner_id)
    except WorkspaceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except WorkspaceIsDefaultError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WorkspaceHasConnectionsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return Response(status_code=204)
