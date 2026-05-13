"""Business logic for workspace management.

Lives alongside :mod:`connections_service` and follows the same pure-Python /
no-FastAPI shape so the service entry points can be reused beyond the HTTP
router. Domain failures are signalled by plain exceptions defined here (or
re-exported from the connections service); the router translates them to
HTTP status codes.

Phase 2 ownership rules:

* ``create_workspace`` populates ``ownerId`` from the caller's identity.
* ``list_workspaces`` filters via the DB-side
  :func:`db.get_workspaces_owned_by` helper, returning only rows the caller
  may see (``ownerId == caller`` OR ``ownerId == 'system'``).
* ``get_workspace`` / ``update_workspace`` / ``delete_workspace`` raise
  :class:`WorkspaceNotFoundError` when the row is invisible to the caller.
  Treating "exists but you don't own it" as 404 prevents id enumeration.
* ``ownerId`` is read-only after creation: any attempt to mutate it via
  the update path is dropped (defense-in-depth — the request model
  already strips the field).
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.models.workspace import (
    DEFAULT_WORKSPACE_ID,
    SYSTEM_OWNER_ID,
    CreateWorkspaceRequest,
    UpdateWorkspaceRequest,
    Workspace,
    WorkspaceResponse,
)
from aerospike_cluster_manager_api.services.connections_service import (
    WorkspaceNotFoundError,
)

logger = logging.getLogger(__name__)


__all__ = [
    "DEFAULT_WORKSPACE_ID",
    "SYSTEM_OWNER_ID",
    "WorkspaceNotFoundError",
    "create_workspace",
    "delete_workspace",
    "get_workspace",
    "list_workspaces",
    "update_workspace",
]


# ---------------------------------------------------------------------------
# Domain exceptions
# ---------------------------------------------------------------------------


class WorkspaceHasConnectionsError(RuntimeError):
    """Raised when delete_workspace would orphan connection profiles."""

    def __init__(self, workspace_id: str, count: int) -> None:
        super().__init__(
            f"Workspace '{workspace_id}' still has {count} connection(s). "
            "Move or delete them before deleting the workspace."
        )
        self.workspace_id = workspace_id
        self.count = count


class WorkspaceIsDefaultError(RuntimeError):
    """Raised when delete_workspace targets the built-in default."""

    def __init__(self, workspace_id: str) -> None:
        super().__init__("The default workspace cannot be deleted")
        self.workspace_id = workspace_id


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _is_visible_to(ws: Workspace, caller_owner_id: str) -> bool:
    """Return True iff ``caller_owner_id`` may read ``ws``.

    Visibility rule = ``ownerId == caller`` OR ``ownerId == 'system'``.
    The ``'system'`` leg keeps the built-in default and any pre-migration
    rows accessible to every authenticated caller.
    """
    return ws.ownerId == caller_owner_id or ws.ownerId == SYSTEM_OWNER_ID


def _is_owned_by(ws: Workspace, caller_owner_id: str) -> bool:
    """Return True iff ``caller_owner_id`` may **mutate** ``ws``.

    Stricter than :func:`_is_visible_to`: SYSTEM-owned workspaces (the
    built-in default, ``ws-default``) can only be mutated by the system
    caller itself. Without this check any authenticated caller could
    rename or recolor ``ws-default`` because the visibility rule lets
    every authenticated caller read SYSTEM rows. The earlier
    pre-fix behaviour gated update/delete on visibility, so any tenant
    could mutate the shared default.

    The system caller (``caller_owner_id == SYSTEM_OWNER_ID``) keeps the
    legacy permissive path -- anonymous deployments and the
    single-tenant fallback both resolve to SYSTEM_OWNER_ID and should
    still be able to manage every workspace.
    """
    return ws.ownerId == caller_owner_id


# ---------------------------------------------------------------------------
# Service entry points
# ---------------------------------------------------------------------------


async def list_workspaces(caller_owner_id: str) -> list[WorkspaceResponse]:
    """Return all workspaces visible to ``caller_owner_id``."""
    rows = await db.get_workspaces_owned_by(caller_owner_id)
    return [WorkspaceResponse.from_workspace(w) for w in rows]


async def get_workspace(workspace_id: str, caller_owner_id: str) -> WorkspaceResponse:
    """Return the workspace with id ``workspace_id`` if visible to caller.

    Raises :class:`WorkspaceNotFoundError` when the row does not exist
    *or* when it exists but belongs to a different owner. The two cases
    return the same error to avoid leaking the existence of other
    callers' workspaces (id enumeration).
    """
    ws = await db.get_workspace(workspace_id)
    if ws is None or not _is_visible_to(ws, caller_owner_id):
        raise WorkspaceNotFoundError(workspace_id)
    return WorkspaceResponse.from_workspace(ws)


async def create_workspace(
    payload: CreateWorkspaceRequest,
    owner_id: str,
) -> WorkspaceResponse:
    """Persist a new workspace owned by ``owner_id``.

    The id is generated server-side. The caller-supplied request model
    intentionally has no ``ownerId`` field — the service is the single
    place ownership is assigned.
    """
    now = datetime.now(UTC).isoformat()
    ws = Workspace(
        id=f"ws-{uuid.uuid4().hex[:12]}",
        name=payload.name,
        color=payload.color,
        description=payload.description,
        isDefault=False,
        ownerId=owner_id,
        createdAt=now,
        updatedAt=now,
    )
    await db.create_workspace(ws)
    return WorkspaceResponse.from_workspace(ws)


async def update_workspace(
    workspace_id: str,
    payload: UpdateWorkspaceRequest,
    caller_owner_id: str,
) -> WorkspaceResponse:
    """Apply a partial update if ``caller_owner_id`` owns the row.

    Raises :class:`WorkspaceNotFoundError` when the workspace does not
    exist or is invisible to the caller — same wire shape so id
    enumeration is impossible. Mutations require strict ownership
    (:func:`_is_owned_by`); visibility alone is not enough or any tenant
    could rename / recolor SYSTEM-owned rows like ``ws-default``.
    """
    ws = await db.get_workspace(workspace_id)
    if ws is None or not _is_visible_to(ws, caller_owner_id):
        raise WorkspaceNotFoundError(workspace_id)
    if not _is_owned_by(ws, caller_owner_id):
        # Visible to the caller (e.g. SYSTEM-shared default) but not
        # owned -- refuse the mutation. Use the same identity-404 wire
        # shape as the visibility miss to avoid leaking ownership info.
        raise WorkspaceNotFoundError(workspace_id)

    update_data = payload.model_dump(exclude_unset=True, by_alias=False)
    # Defense-in-depth: ``UpdateWorkspaceRequest`` does not declare
    # ``ownerId``, but if a future caller bypasses the model we still
    # refuse to mutate ownership here. ``build_merged_workspace`` makes
    # the same guarantee at the persistence layer.
    update_data.pop("ownerId", None)

    updated = await db.update_workspace(workspace_id, update_data)
    if updated is None:
        # Race: another writer deleted the workspace between our read
        # and the update. Treat as 404 to keep the wire contract simple.
        raise WorkspaceNotFoundError(workspace_id)
    return WorkspaceResponse.from_workspace(updated)


async def delete_workspace(workspace_id: str, caller_owner_id: str) -> None:
    """Delete a workspace if ``caller_owner_id`` owns it.

    Raises :class:`WorkspaceIsDefaultError` for the built-in default
    (rejected with 400 by the router), :class:`WorkspaceHasConnectionsError`
    when connection profiles still reference the workspace (rejected with
    409), and :class:`WorkspaceNotFoundError` for missing or invisible
    rows.
    """
    ws = await db.get_workspace(workspace_id)
    if ws is None or not _is_visible_to(ws, caller_owner_id):
        raise WorkspaceNotFoundError(workspace_id)
    if not _is_owned_by(ws, caller_owner_id):
        # Same default-deny rule update_workspace uses: visible (e.g.
        # SYSTEM-shared) but not owned by the caller is treated as a
        # 404 to avoid leaking the existence of the SYSTEM bucket.
        raise WorkspaceNotFoundError(workspace_id)
    if ws.isDefault or ws.id == DEFAULT_WORKSPACE_ID:
        raise WorkspaceIsDefaultError(workspace_id)
    remaining = await db.count_connections_in_workspace(workspace_id)
    if remaining > 0:
        raise WorkspaceHasConnectionsError(workspace_id, remaining)
    await db.delete_workspace(workspace_id)
