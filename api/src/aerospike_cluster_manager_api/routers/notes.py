"""REST endpoints for set and record notes.

The read path lives in the existing cluster/record endpoints (notes are
inlined into ``GET /clusters/{conn_id}`` and ``GET /records/{conn_id}``).
This module covers the dedicated CRUD surface — write/delete/list — that
also happens to be the recovery path for "I made a note but the random-50
scan didn't surface it" (``GET /notes/records/{conn_id}?ns=&set=`` returns
every annotated record key for the slice).

Workspace ACL is transitively enforced through ``_get_verified_connection``,
which 404s on a connection the caller can't see; we then thread the caller's
OIDC ``sub`` into ``updated_by`` for audit.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Path, Query
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
from aerospike_cluster_manager_api.pk import resolve_pk

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["notes"])


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
    summary="Upsert set note",
    description="Create or update an operator note attached to a set. Empty body deletes the note.",
)
async def upsert_set_note(
    body: UpsertSetNoteRequest,
    conn_id: VerifiedConnId,
    caller_owner_id: CallerOwnerId,
    namespace: str = Path(..., min_length=1, max_length=31),
    set_name: str = Path(..., min_length=1, max_length=63),
) -> Response:
    """Upsert a set note. Empty ``note`` is a delete (idempotent — 204 either way)."""
    if not body.note:
        await db.delete_set_note(conn_id, namespace, set_name)
        return Response(status_code=204)
    saved = await db.upsert_set_note(conn_id, namespace, set_name, body.note, caller_owner_id)
    return Response(
        content=saved.model_dump_json(),
        media_type="application/json",
        status_code=200,
    )


@router.delete(
    "/sets/{conn_id}/{namespace}/{set_name}",
    status_code=204,
    summary="Delete set note",
    description="Remove the operator note attached to a set. No-op when no note exists.",
)
async def delete_set_note(
    conn_id: VerifiedConnId,
    namespace: str = Path(..., min_length=1, max_length=31),
    set_name: str = Path(..., min_length=1, max_length=63),
) -> Response:
    await db.delete_set_note(conn_id, namespace, set_name)
    return Response(status_code=204)


@router.get(
    "/sets/{conn_id}",
    summary="List set notes",
    description="List set-level operator notes for a connection, optionally filtered by namespace.",
)
async def list_set_notes(
    conn_id: VerifiedConnId,
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
    summary="Upsert record note",
    description="Create or update an operator note on a single record. Empty body deletes.",
)
async def upsert_record_note(
    body: UpsertRecordNoteRequest,
    conn_id: VerifiedConnId,
    caller_owner_id: CallerOwnerId,
    namespace: str = Path(..., min_length=1, max_length=31),
    set_name: str = Path(..., min_length=1, max_length=63),
    pk: str = Path(..., min_length=1, max_length=1024),
) -> Response:
    """Upsert a record note. ``pk_type=auto`` (default) resolves via the same
    heuristic as the read path; pass an explicit value for digit-only string
    keys to avoid the INTEGER mis-classification.
    """
    stored_pk_type = _resolve_pk_type(pk, body.pkType)
    if not body.note:
        await db.delete_record_note(conn_id, namespace, set_name, pk, stored_pk_type)
        return Response(status_code=204)
    saved = await db.upsert_record_note(
        conn_id, namespace, set_name, pk, stored_pk_type, body.note, None, caller_owner_id
    )
    return Response(
        content=saved.model_dump_json(),
        media_type="application/json",
        status_code=200,
    )


@router.delete(
    "/records/{conn_id}/{namespace}/{set_name}/{pk}",
    status_code=204,
    summary="Delete record note",
    description="Remove the operator note on a single record. No-op when none exists.",
)
async def delete_record_note(
    conn_id: VerifiedConnId,
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
    summary="List record notes",
    description=(
        "List record-level notes for a (connection, namespace, set). This is the "
        "recovery path for notes that the random-50 data browser scan does not surface."
    ),
)
async def list_record_notes(
    conn_id: VerifiedConnId,
    ns: str = Query(..., min_length=1, max_length=31),
    set: str = Query(..., min_length=1, max_length=63),
) -> RecordNotesListResponse:
    notes = await db.list_record_notes(conn_id, ns, set)
    return RecordNotesListResponse(notes=notes)
