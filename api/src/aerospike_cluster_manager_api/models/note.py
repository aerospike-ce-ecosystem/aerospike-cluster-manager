"""Pydantic models for set/record annotations (notes).

Notes are operator-authored free-text memos attached to Aerospike sets and
records. They live in cluster-manager's metaDB (SQLite/PostgreSQL), not in
Aerospike itself, and are scoped to a single connection profile (cascade
deleted with the connection).

See ``plan.md`` for the broader design and ``db/_base.py`` for the persistence
contract.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Aerospike pk wire-format kinds. ``auto`` is a request-time hint that
# resolves to one of the concrete types via :mod:`pk.resolve_pk`. The DB
# never stores ``auto`` — only the resolved value.
PkType = Literal["auto", "string", "int", "bytes"]
StoredPkType = Literal["string", "int", "bytes"]

# Free-text limit: 8 KB covers ~2700 Korean / ~8000 ASCII characters. Big
# enough for a runbook paragraph, small enough to keep the data browser
# responsive when notes are returned inline alongside 50 records.
MAX_NOTE_LENGTH = 8192


class SetNote(BaseModel):
    """Persisted set-level note.

    Identity is ``(connection_id, namespace, set_name)``. ``updated_by``
    carries the OIDC ``sub`` claim of the most recent writer when the API
    runs behind OIDC; bearer-token and anonymous deployments leave it null.
    """

    connectionId: str
    namespace: str
    setName: str
    note: str
    createdAt: str
    updatedAt: str
    updatedBy: str | None = None


class RecordNote(BaseModel):
    """Persisted record-level note.

    Identity is ``(connection_id, namespace, set_name, pk_text, pk_type)``.
    ``pk_type`` is in the PK because Aerospike treats ``42:string`` and
    ``42:int`` as different records (different digests), so both must be
    independently noteable. ``digest_hex`` is verification-only — it is
    derived from ``(set, pk)`` and stored to detect rare drift, never used
    as a join key.
    """

    connectionId: str
    namespace: str
    setName: str
    pkText: str
    pkType: StoredPkType
    digestHex: str | None = None
    note: str
    createdAt: str
    updatedAt: str
    updatedBy: str | None = None


class UpsertSetNoteRequest(BaseModel):
    """Request body for ``PUT /api/notes/sets/...``.

    ``note`` is required and non-empty. To remove a note use the dedicated
    ``DELETE`` endpoint — the previous "PUT empty string ⇒ delete" shortcut
    silently turned trim-to-empty UX (autosave + whitespace-only input)
    into data loss, so it has been removed.
    """

    note: str = Field(min_length=1, max_length=MAX_NOTE_LENGTH)


class UpsertRecordNoteRequest(BaseModel):
    """Request body for ``PUT /api/notes/records/...``.

    ``pkType`` defaults to ``auto`` so the resolution heuristic in
    :mod:`pk` decides between STRING and INTEGER for digit-only keys.
    Pass an explicit value when the heuristic would mis-classify (e.g. a
    customer id that looks numeric but lives as STRING in Aerospike).

    ``note`` is required and non-empty — same rationale as
    :class:`UpsertSetNoteRequest`.
    """

    model_config = ConfigDict(populate_by_name=True)

    note: str = Field(min_length=1, max_length=MAX_NOTE_LENGTH)
    pkType: PkType = Field(default="auto", alias="pk_type")
