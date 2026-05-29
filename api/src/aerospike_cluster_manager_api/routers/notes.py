"""REST endpoints for set and record notes.

The read path lives in the existing cluster/record endpoints (notes are
inlined into ``GET /clusters/{conn_id}`` and ``GET /records/{conn_id}``).
This module covers the dedicated CRUD surface — write/delete/list — that
also happens to be the recovery path for "I made a note but the random-50
scan didn't surface it" (``GET /notes/records/{conn_id}?ns=&set=`` returns
every annotated record key for the slice).

Workspace ACL: every endpoint depends on :func:`_assert_caller_owns_connection`
which 404s when the caller's OIDC ``sub`` does not own the workspace the
connection belongs to. Identity 404 (instead of 403) prevents id enumeration,
matching the rule used by ``connections_service._assert_workspace_visible``.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from pydantic import BaseModel
from starlette.responses import Response

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.dependencies import CallerOwnerId, VerifiedConnId
from aerospike_cluster_manager_api.models.note import (
    PkType,
    RecordNote,
    SetNote,
    StoredPkType,
    UpsertRecordNoteRequest,
    UpsertSetNoteRequest,
)
from aerospike_cluster_manager_api.models.workspace import SYSTEM_OWNER_ID
from aerospike_cluster_manager_api.pk import resolve_pk
from aerospike_cluster_manager_api.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["notes"])


async def _assert_caller_owns_connection(
    conn_id: VerifiedConnId,
    caller_owner_id: CallerOwnerId,
) -> str:
    """ACL gate for note endpoints.

    Returns the connection id when the caller can see the connection's
    workspace. Raises 404 otherwise so the connection's existence is not
    leaked across tenants. ``SYSTEM_OWNER_ID`` (``"system"``) is the
    sentinel for the built-in default workspace and any pre-migration
    rows — visible to every authenticated caller, matching the rule in
    :func:`connections_service._assert_workspace_visible`.
    """
    profile = await db.get_connection(conn_id)
    if profile is None:  # pragma: no cover — VerifiedConnId already checked
        raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")
    if profile.workspaceId is None:
        # Legacy / personal connection with no workspace association. Mirror
        # the behaviour in ``dependencies._get_verified_connection`` and treat
        # as system-shared (caller owns by default). Without this guard, a
        # ``workspaceId=None`` row produces a spurious 404 for any caller.
        return conn_id
    workspace = await db.get_workspace(profile.workspaceId)
    if workspace is None:
        # Workspace was deleted between the VerifiedConnId lookup and now —
        # surface as a connection 404 so the wire shape matches the no-ACL
        # case and ID enumeration is impossible.
        raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")
    if workspace.ownerId != caller_owner_id and workspace.ownerId != SYSTEM_OWNER_ID:
        raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")
    return conn_id


def _resolve_pk_type(pk: str, pk_type: PkType) -> StoredPkType:
    """Collapse ``auto`` into a concrete persistence pk_type.

    The DB never stores ``auto`` — only the resolved value. Reuses
    :func:`pk.resolve_pk` so the heuristic matches what the read path uses
    (digit-only → INTEGER, leading-zero-safe).
    """
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


class SetNotesListResponse(BaseModel):
    notes: list[SetNote]


@router.put(
    "/sets/{conn_id}/{namespace}/{set_name}",
    response_model=SetNote,
    summary="Upsert set note",
    description="Create or update an operator note attached to a set.",
)
@limiter.limit("20/minute")
async def upsert_set_note(
    request: Request,
    body: UpsertSetNoteRequest,
    caller_owner_id: CallerOwnerId,
    conn_id: str = Depends(_assert_caller_owns_connection),
    namespace: str = Path(..., min_length=1, max_length=31),
    set_name: str = Path(..., min_length=1, max_length=63),
) -> SetNote:
    """Upsert a set note.

    Empty / whitespace-only ``note`` is rejected at the request-validation
    layer (``min_length=1``) — the previous "PUT empty ⇒ delete" shortcut
    was a footgun that turned trim-to-empty UX into silent data loss. Use
    ``DELETE /api/notes/sets/...`` to remove a note explicitly.
    """
    return await db.upsert_set_note(conn_id, namespace, set_name, body.note, caller_owner_id)


@router.delete(
    "/sets/{conn_id}/{namespace}/{set_name}",
    status_code=204,
    summary="Delete set note",
    description="Remove the operator note attached to a set. No-op when no note exists.",
)
@limiter.limit("20/minute")
async def delete_set_note(
    request: Request,
    conn_id: str = Depends(_assert_caller_owns_connection),
    namespace: str = Path(..., min_length=1, max_length=31),
    set_name: str = Path(..., min_length=1, max_length=63),
) -> Response:
    await db.delete_set_note(conn_id, namespace, set_name)
    return Response(status_code=204)


@router.get(
    "/sets/{conn_id}",
    response_model=SetNotesListResponse,
    summary="List set notes",
    description="List set-level operator notes for a connection, optionally filtered by namespace.",
)
async def list_set_notes(
    conn_id: str = Depends(_assert_caller_owns_connection),
    namespace: str | None = Query(default=None, min_length=1, max_length=31),
) -> SetNotesListResponse:
    notes = await db.list_set_notes(conn_id, namespace)
    return SetNotesListResponse(notes=notes)


# ---------------------------------------------------------------------------
# Record notes
# ---------------------------------------------------------------------------


class RecordNotesListResponse(BaseModel):
    notes: list[RecordNote]


@router.put(
    "/records/{conn_id}/{namespace}/{set_name}/{pk}",
    response_model=RecordNote,
    summary="Upsert record note",
    description="Create or update an operator note on a single record.",
)
@limiter.limit("20/minute")
async def upsert_record_note(
    request: Request,
    body: UpsertRecordNoteRequest,
    caller_owner_id: CallerOwnerId,
    conn_id: str = Depends(_assert_caller_owns_connection),
    namespace: str = Path(..., min_length=1, max_length=31),
    set_name: str = Path(..., min_length=1, max_length=63),
    pk: str = Path(..., min_length=1, max_length=1024),
) -> RecordNote:
    """Upsert a record note.

    ``pk_type=auto`` (default) resolves via the same heuristic as the read
    path; pass an explicit value for digit-only string keys to avoid the
    INTEGER mis-classification.

    Empty / whitespace-only ``note`` is rejected (``min_length=1``); use the
    DELETE endpoint to remove a note.
    """
    stored_pk_type = _resolve_pk_type(pk, body.pkType)
    return await db.upsert_record_note(
        conn_id, namespace, set_name, pk, stored_pk_type, body.note, None, caller_owner_id
    )


@router.delete(
    "/records/{conn_id}/{namespace}/{set_name}/{pk}",
    status_code=204,
    summary="Delete record note",
    description="Remove the operator note on a single record. No-op when none exists.",
)
@limiter.limit("20/minute")
async def delete_record_note(
    request: Request,
    conn_id: str = Depends(_assert_caller_owns_connection),
    namespace: str = Path(..., min_length=1, max_length=31),
    set_name: str = Path(..., min_length=1, max_length=63),
    pk: str = Path(..., min_length=1, max_length=1024),
    pk_type: Literal["auto", "string", "int", "bytes"] = Query("auto"),
) -> Response:
    stored_pk_type = _resolve_pk_type(pk, pk_type)
    await db.delete_record_note(conn_id, namespace, set_name, pk, stored_pk_type)
    return Response(status_code=204)


@router.get(
    "/records/{conn_id}",
    response_model=RecordNotesListResponse,
    summary="List record notes",
    description=(
        "List record-level notes for a (connection, namespace, set). This is the "
        "recovery path for notes that the random-50 data browser scan does not surface."
    ),
)
async def list_record_notes(
    conn_id: str = Depends(_assert_caller_owns_connection),
    ns: str = Query(..., min_length=1, max_length=31),
    set: str = Query(..., min_length=1, max_length=63),
) -> RecordNotesListResponse:
    notes = await db.list_record_notes(conn_id, ns, set)
    return RecordNotesListResponse(notes=notes)
