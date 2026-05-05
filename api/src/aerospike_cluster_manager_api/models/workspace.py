from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

# Identifier of the built-in workspace that always exists. Created by the
# database migration on first init_db() and used as the fallback when a
# CreateConnectionRequest does not specify a workspace.
DEFAULT_WORKSPACE_ID = "ws-default"


class Workspace(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=255)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$", default="#6366F1")
    description: str | None = None
    isDefault: bool = False
    createdAt: str
    updatedAt: str


class CreateWorkspaceRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=255)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$", default="#6366F1")
    description: str | None = None


class UpdateWorkspaceRequest(BaseModel):
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
    createdAt: str
    updatedAt: str

    @classmethod
    def from_workspace(cls, ws: Workspace) -> WorkspaceResponse:
        return cls(**ws.model_dump())
