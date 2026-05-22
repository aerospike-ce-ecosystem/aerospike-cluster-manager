"""REST endpoints for operational guides.

Guides are workspace-scoped Markdown policy documents — one **data-plane**
guide and one **control-plane** guide per workspace. acko administrators
author them through the cluster-manager UI; ackoctl and AI agents read them
via ``ackoctl guide get`` *before* running data/cluster operations so the
org/team policy is applied consistently from every entry point.

Workspace ACL: every endpoint depends on :data:`VerifiedWorkspaceId`, which
404s when the caller's OIDC ``sub`` cannot see the workspace — identity-404
(not 403) so workspace ids cannot be enumerated, matching the rule used by
``dependencies._get_verified_workspace``.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Request
from pydantic import BaseModel
from starlette.responses import Response

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.dependencies import CallerOwnerId, VerifiedWorkspaceId
from aerospike_cluster_manager_api.models.guide import (
    GuideResponse,
    GuideType,
    UpsertGuideRequest,
)
from aerospike_cluster_manager_api.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/guides", tags=["guides"])

# Path parameter selecting the guide kind. ``GuideType`` is a Literal, so an
# unknown value is rejected with 422 before the handler runs.
GuideTypePath = Annotated[
    GuideType,
    Path(description="Guide kind: 'data-plane' or 'control-plane'"),
]


class GuidesListResponse(BaseModel):
    guides: list[GuideResponse]


@router.get(
    "/{workspace_id}",
    summary="List operational guides",
    description=(
        "List the operational guides registered for a workspace. A workspace "
        "holds at most one data-plane and one control-plane guide; either may "
        "be absent until an administrator registers it."
    ),
)
async def list_guides(workspace_id: VerifiedWorkspaceId) -> GuidesListResponse:
    guides = await db.list_guides(workspace_id)
    return GuidesListResponse(guides=[GuideResponse.from_guide(g) for g in guides])


@router.get(
    "/{workspace_id}/{guide_type}",
    summary="Get an operational guide",
    description=(
        "Fetch the Markdown body of one operational guide. Returns 404 when "
        "the guide has not been registered for the workspace yet."
    ),
)
async def get_guide(
    workspace_id: VerifiedWorkspaceId,
    guide_type: GuideTypePath,
) -> GuideResponse:
    guide = await db.get_guide(workspace_id, guide_type)
    if guide is None:
        raise HTTPException(
            status_code=404,
            detail=f"No '{guide_type}' guide is registered for this workspace",
        )
    return GuideResponse.from_guide(guide)


@router.put(
    "/{workspace_id}/{guide_type}",
    summary="Register or update an operational guide",
    description=(
        "Create or replace the Markdown body of an operational guide. The "
        "first write registers the guide; subsequent writes edit it in place "
        "(``createdAt`` is preserved). Use DELETE to remove a guide — an "
        "empty PUT body is rejected with 422."
    ),
)
@limiter.limit("20/minute")
async def upsert_guide(
    request: Request,
    body: UpsertGuideRequest,
    caller_owner_id: CallerOwnerId,
    workspace_id: VerifiedWorkspaceId,
    guide_type: GuideTypePath,
) -> GuideResponse:
    guide = await db.upsert_guide(workspace_id, guide_type, body.title, body.content, caller_owner_id)
    return GuideResponse.from_guide(guide)


@router.delete(
    "/{workspace_id}/{guide_type}",
    status_code=204,
    summary="Delete an operational guide",
    description="Remove an operational guide. No-op (still 204) when the guide does not exist.",
)
@limiter.limit("20/minute")
async def delete_guide(
    request: Request,
    workspace_id: VerifiedWorkspaceId,
    guide_type: GuideTypePath,
) -> Response:
    await db.delete_guide(workspace_id, guide_type)
    return Response(status_code=204)
