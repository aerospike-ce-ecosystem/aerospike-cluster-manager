"""MCP tools for set / record notes.

Mirrors ``routers/notes.py`` so an LLM can attach the same operator memos
the UI exposes. Existing ``get_record`` / ``list_records`` / ``get_cluster_info``
tools already inline notes in their responses — these tools cover the write
and search surface.

Workspace ACL is enforced by :func:`mcp.registry._assert_workspace_owns_arg`,
which inspects ``conn_id`` against the caller's workspace. No additional ACL
plumbing needed here.
"""

from __future__ import annotations

import logging
from typing import Any

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.mcp.registry import tool
from aerospike_cluster_manager_api.mcp.user_context import current_caller_claims
from aerospike_cluster_manager_api.models.note import PkType, StoredPkType
from aerospike_cluster_manager_api.pk import resolve_pk

logger = logging.getLogger(__name__)


def _caller_owner_id() -> str | None:
    """Pull the OIDC ``sub`` claim from the MCP request context for audit.

    Returns ``None`` outside an MCP request (REST routes have their own
    ``CallerOwnerId`` dependency) or when the claim is absent (bearer-token
    deployments leave it unset).
    """
    claims = current_caller_claims()
    if not claims:
        return None
    sub = claims.get("sub")
    return sub if isinstance(sub, str) else None


def _resolve_pk_type(pk: str, pk_type: PkType) -> StoredPkType:
    """Same heuristic as ``routers/notes.py``: ``auto`` → resolved storage type."""
    if pk_type != "auto":
        return pk_type
    resolved = resolve_pk(pk, "auto")
    if isinstance(resolved, int):
        return "int"
    if isinstance(resolved, bytes | bytearray):
        return "bytes"
    return "string"


# ---------------------------------------------------------------------------
# Set notes
# ---------------------------------------------------------------------------


@tool(category="note", mutation=True)
async def update_set_note(
    conn_id: str,
    namespace: str,
    set_name: str,
    note: str,
) -> dict[str, Any]:
    """Upsert an operator note attached to a set.

    Empty ``note`` (``""``) deletes the note (idempotent — no error when
    none existed). Non-empty ``note`` creates or replaces.

    Mutation: requires ``ACM_MCP_ACCESS_PROFILE=full``.
    """
    if not note:
        deleted = await db.delete_set_note(conn_id, namespace, set_name)
        return {"deleted": deleted, "conn_id": conn_id, "namespace": namespace, "set_name": set_name}
    updated_by = _caller_owner_id()
    saved = await db.upsert_set_note(conn_id, namespace, set_name, note, updated_by)
    return saved.model_dump()


@tool(category="note", mutation=True)
async def delete_set_note(conn_id: str, namespace: str, set_name: str) -> dict[str, Any]:
    """Delete the operator note on a set. No-op when no note exists."""
    deleted = await db.delete_set_note(conn_id, namespace, set_name)
    return {"deleted": deleted, "conn_id": conn_id, "namespace": namespace, "set_name": set_name}


@tool(category="note", mutation=False)
async def list_set_notes(conn_id: str, namespace: str | None = None) -> list[dict[str, Any]]:
    """List set-level notes for a connection (optionally filtered by namespace)."""
    items = await db.list_set_notes(conn_id, namespace)
    return [item.model_dump() for item in items]


# ---------------------------------------------------------------------------
# Record notes
# ---------------------------------------------------------------------------


@tool(category="note", mutation=True)
async def update_record_note(
    conn_id: str,
    namespace: str,
    set_name: str,
    pk: str,
    note: str,
    pk_type: PkType = "auto",
) -> dict[str, Any]:
    """Upsert an operator note on a single record.

    ``pk_type`` defaults to ``auto`` and is resolved server-side via the same
    heuristic as the read path. Pass an explicit value when the heuristic
    would mis-classify a digit-only string key. Empty ``note`` deletes.

    Mutation: requires ``ACM_MCP_ACCESS_PROFILE=full``.
    """
    stored_pk_type = _resolve_pk_type(pk, pk_type)
    if not note:
        deleted = await db.delete_record_note(conn_id, namespace, set_name, pk, stored_pk_type)
        return {
            "deleted": deleted,
            "conn_id": conn_id,
            "namespace": namespace,
            "set_name": set_name,
            "pk": pk,
            "pk_type": stored_pk_type,
        }
    updated_by = _caller_owner_id()
    saved = await db.upsert_record_note(conn_id, namespace, set_name, pk, stored_pk_type, note, None, updated_by)
    return saved.model_dump()


@tool(category="note", mutation=True)
async def delete_record_note(
    conn_id: str,
    namespace: str,
    set_name: str,
    pk: str,
    pk_type: PkType = "auto",
) -> dict[str, Any]:
    """Delete the operator note on a single record. No-op when none exists."""
    stored_pk_type = _resolve_pk_type(pk, pk_type)
    deleted = await db.delete_record_note(conn_id, namespace, set_name, pk, stored_pk_type)
    return {
        "deleted": deleted,
        "conn_id": conn_id,
        "namespace": namespace,
        "set_name": set_name,
        "pk": pk,
        "pk_type": stored_pk_type,
    }


@tool(category="note", mutation=False)
async def list_record_notes(
    conn_id: str,
    namespace: str,
    set_name: str,
) -> list[dict[str, Any]]:
    """List every record-level note for a (connection, namespace, set).

    This is the recovery path when the random-50 data browser scan misses a
    record that has a note attached — call this to surface every annotated
    pk in the slice without re-running the scan.
    """
    items = await db.list_record_notes(conn_id, namespace, set_name)
    return [item.model_dump() for item in items]
