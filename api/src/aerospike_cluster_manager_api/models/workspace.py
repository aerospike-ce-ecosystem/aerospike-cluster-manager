from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

# Identifier of the built-in workspace that always exists. Created by the
# database migration on first init_db() and used as the fallback when a
# CreateConnectionRequest does not specify a workspace.
DEFAULT_WORKSPACE_ID = "ws-default"

# Synthetic owner id for rows that predate ownership and for the bearer-token
# / unauthenticated single-tenant code paths. The ACL allows any caller to
# read rows owned by ``"system"`` so legacy data and the built-in default
# workspace remain accessible after migration. See
# ``docs/plans/2026-05-07-workspace-ownership-schema.md`` for the contract.
SYSTEM_OWNER_ID = "system"


class Workspace(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=255)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$", default="#6366F1")
    description: str | None = None
    isDefault: bool = False
    # Required. Either an OIDC ``sub`` claim or the synthetic
    # ``SYSTEM_OWNER_ID`` sentinel for legacy / single-tenant rows. No
    # default at the model layer — the DB migration provides
    # ``DEFAULT 'system'`` for backfilled rows; new rows must be populated
    # by the router from the caller's claims.
    ownerId: str = Field(min_length=1)
    createdAt: str
    updatedAt: str


class CreateWorkspaceRequest(BaseModel):
    """Workspace creation payload.

    ``ownerId`` is intentionally absent — the router populates it from the
    caller's authenticated identity (OIDC claim or the bearer/
    unauthenticated ``SYSTEM_OWNER_ID`` fallback). Accepting an owner id
    from the wire would let any client claim ownership of any string,
    defeating the ACL.
    """

    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=255)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$", default="#6366F1")
    description: str | None = None


class UpdateWorkspaceRequest(BaseModel):
    """Workspace update payload.

    ``ownerId`` is intentionally absent. Phase 2 forbids workspace
    transfers — see the ADR's "Workspace creation flow changes" table —
    so the field is stripped from the request schema. Defense-in-depth:
    the service layer also rejects any ``ownerId`` key that sneaks in
    via the underlying dict.
    """

    model_config = ConfigDict(populate_by_name=True)

    name: str | None = Field(default=None, min_length=1, max_length=255)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    description: str | None = None


class WorkspaceResponse(BaseModel):
    """Workspace shape returned by the API.

    Mirrors :class:`Workspace`. Kept as a separate type so future fields that
    should not leak to the client (e.g. internal flags) can be excluded
    without breaking the persistence model.
    """

    id: str
    name: str
    color: str
    description: str | None = None
    isDefault: bool = False
    ownerId: str
    createdAt: str
    updatedAt: str

    @classmethod
    def from_workspace(cls, ws: Workspace) -> WorkspaceResponse:
        return cls(**ws.model_dump())
