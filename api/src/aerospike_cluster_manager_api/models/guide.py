"""Pydantic models for operational guides.

Guides are Markdown-format operational policy documents authored by acko
administrators. Each workspace (the org/team boundary) owns at most one guide
per kind:

* a **data-plane** guide — policy for dynamic Aerospike data CRUD (TTL
  ceilings for throwaway data, the ``note`` template to leave behind, ...);
* a **control-plane** guide — policy for Aerospike cluster lifecycle (test
  clusters in-memory only, prod clusters require approval, ...).

They live in cluster-manager's metaDB (SQLite/PostgreSQL), not in Aerospike
itself, and are scoped to a single workspace (cascade deleted with the
workspace). ackoctl reads them via ``ackoctl guide get`` so the same org/team
policy is applied whether an operator drives Aerospike from the web UI, the
CLI, or an AI agent.

See ``db/_base.py`` for the persistence contract.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# Guide kinds. ``data-plane`` governs Aerospike record/set CRUD policy;
# ``control-plane`` governs Aerospike cluster lifecycle policy. The hyphen
# form is the natural key in the URL, the ackoctl subcommand argument, and
# the user-facing label — keep all three identical.
GuideType = Literal["data-plane", "control-plane"]

# 64 KB of Markdown — comfortably fits a multi-section runbook with policy
# tables and templates, while staying small enough to return inline and
# render in the browser without pagination.
MAX_GUIDE_CONTENT_LENGTH = 65536
MAX_GUIDE_TITLE_LENGTH = 200


class Guide(BaseModel):
    """Persisted operational guide.

    Identity is ``(workspace_id, guide_type)`` — a workspace holds at most one
    guide of each kind, so the kind doubles as the natural key. ``updatedBy``
    carries the OIDC ``sub`` claim of the most recent writer when the API runs
    behind OIDC; bearer-token and anonymous deployments record the synthetic
    ``system`` owner id instead.
    """

    workspaceId: str
    guideType: GuideType
    title: str
    content: str
    createdAt: str
    updatedAt: str
    updatedBy: str | None = None


class UpsertGuideRequest(BaseModel):
    """Request body for ``PUT /api/guides/{workspace_id}/{guide_type}``.

    ``content`` is the full Markdown body; both fields are required and
    non-empty. To remove a guide use the dedicated ``DELETE`` endpoint — the
    PUT path never deletes, mirroring the notes API which dropped its
    "PUT empty ⇒ delete" footgun.
    """

    title: str = Field(min_length=1, max_length=MAX_GUIDE_TITLE_LENGTH)
    content: str = Field(min_length=1, max_length=MAX_GUIDE_CONTENT_LENGTH)


class GuideResponse(BaseModel):
    """Guide shape returned by the API.

    Mirrors :class:`Guide`. Kept separate so a future field that should not
    leak to clients can be excluded without touching the persistence model.
    """

    workspaceId: str
    guideType: GuideType
    title: str
    content: str
    createdAt: str
    updatedAt: str
    updatedBy: str | None = None

    @classmethod
    def from_guide(cls, guide: Guide) -> GuideResponse:
        return cls(**guide.model_dump())
