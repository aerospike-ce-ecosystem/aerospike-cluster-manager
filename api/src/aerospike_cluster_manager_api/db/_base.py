"""Shared helpers for database persistence layers.

Functions in this module are used by both the SQLite and PostgreSQL backends.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, Protocol, runtime_checkable

from aerospike_cluster_manager_api.models.connection import ConnectionProfile
from aerospike_cluster_manager_api.models.note import RecordNote, SetNote, StoredPkType
from aerospike_cluster_manager_api.models.workspace import (
    DEFAULT_WORKSPACE_ID,
    SYSTEM_OWNER_ID,
    Workspace,
)


@runtime_checkable
class DatabaseBackend(Protocol):
    """Contract that every database backend (SQLite, PostgreSQL) must satisfy."""

    async def init_db(self) -> None: ...

    async def close_db(self) -> None: ...

    async def check_health(self) -> bool: ...

    async def migrate_passwords_to_encrypted(self) -> int:
        """Rewrite plaintext ``connections.password`` rows under the active KEK.

        Idempotent — already-encrypted rows (carrying the ``enc:v1:`` prefix)
        are skipped. Returns the number of rows rewritten so the caller
        can log a single audit line rather than spamming per-row INFO.
        """
        ...

    async def get_all_connections(self, workspace_id: str | None = None) -> list[ConnectionProfile]: ...

    async def get_connection(self, conn_id: str) -> ConnectionProfile | None: ...

    async def create_connection(self, conn: ConnectionProfile) -> None: ...

    async def update_connection(self, conn_id: str, data: dict) -> ConnectionProfile | None: ...

    async def delete_connection(self, conn_id: str) -> bool: ...

    async def get_all_workspaces(self) -> list[Workspace]: ...

    async def get_workspace(self, workspace_id: str) -> Workspace | None: ...

    async def get_workspaces_owned_by(self, owner_id: str) -> list[Workspace]: ...

    async def create_workspace(self, ws: Workspace) -> None: ...

    async def update_workspace(self, workspace_id: str, data: dict) -> Workspace | None: ...

    async def delete_workspace(self, workspace_id: str) -> bool: ...

    async def count_connections_in_workspace(self, workspace_id: str) -> int: ...

    # ----- Set notes -----
    async def upsert_set_note(
        self,
        connection_id: str,
        namespace: str,
        set_name: str,
        note: str,
        updated_by: str | None,
    ) -> SetNote: ...

    async def delete_set_note(self, connection_id: str, namespace: str, set_name: str) -> bool: ...

    async def get_set_note(self, connection_id: str, namespace: str, set_name: str) -> SetNote | None: ...

    async def list_set_notes(self, connection_id: str, namespace: str | None = None) -> list[SetNote]: ...

    async def batch_get_set_notes(
        self,
        connection_id: str,
        namespace: str,
        set_names: list[str],
    ) -> dict[str, str]:
        """Return ``{set_name: note}`` for the requested set names (within a single namespace)."""
        ...

    # ----- Record notes -----
    async def upsert_record_note(
        self,
        connection_id: str,
        namespace: str,
        set_name: str,
        pk_text: str,
        pk_type: StoredPkType,
        note: str,
        digest_hex: str | None,
        updated_by: str | None,
    ) -> RecordNote: ...

    async def delete_record_note(
        self,
        connection_id: str,
        namespace: str,
        set_name: str,
        pk_text: str,
        pk_type: StoredPkType,
    ) -> bool: ...

    async def get_record_note(
        self,
        connection_id: str,
        namespace: str,
        set_name: str,
        pk_text: str,
        pk_type: StoredPkType,
    ) -> RecordNote | None: ...

    async def list_record_notes(
        self,
        connection_id: str,
        namespace: str,
        set_name: str,
    ) -> list[RecordNote]: ...

    async def batch_get_record_notes(
        self,
        connection_id: str,
        namespace: str,
        set_name: str,
        pks: list[tuple[str, StoredPkType]],
    ) -> dict[tuple[str, StoredPkType], str]:
        """Return ``{(pk_text, pk_type): note}`` for the requested record keys.

        Optimized for the data browser: callers pass the 50-row batch from a
        single Aerospike scan and get back a single SQL ``IN`` lookup. Empty
        ``pks`` returns an empty dict without hitting the DB.
        """
        ...


def _decode_json_dict(value: object) -> dict[str, Any]:
    """Decode a JSON-encoded text column to ``dict[str, Any]``.

    Returns ``{}`` for missing / empty / malformed input or a non-dict JSON
    payload. Accepts already-parsed ``dict`` (asyncpg with a JSONB type codec)
    and passes it through. Designed for the labels column; do not reuse for
    array-shaped JSON without revisiting the type narrowing.
    """
    if value is None or value == "":
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def row_to_profile(row: Any) -> ConnectionProfile:
    """Convert a database row (dict-like) to a ConnectionProfile model.

    Works with both ``sqlite3.Row`` and ``asyncpg.Record`` since both
    support ``row["column_name"]`` access.
    """
    hosts_raw = row["hosts"]
    if isinstance(hosts_raw, str):
        try:
            hosts = json.loads(hosts_raw)
        except json.JSONDecodeError:
            hosts = [hosts_raw]
    else:
        hosts = hosts_raw
    # sqlite3.Row / asyncpg.Record use `key in row` for value membership, not column lookup;
    # explicit keys() is the documented way to check column presence.
    labels_raw = row["labels"] if "labels" in row.keys() else None  # noqa: SIM118
    # ConnectionProfile.labels validator normalizes {} -> {"env": "default"}.
    labels = _decode_json_dict(labels_raw)
    workspace_id = row["workspace_id"] if "workspace_id" in row.keys() else None  # noqa: SIM118
    return ConnectionProfile(
        id=row["id"],
        name=row["name"],
        hosts=hosts,
        port=row["port"],
        clusterName=row["cluster_name"],
        username=row["username"],
        password=row["password"],
        color=row["color"],
        note=row["note"],
        labels=labels,
        workspaceId=workspace_id or DEFAULT_WORKSPACE_ID,
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def row_to_workspace(row: Any) -> Workspace:
    """Convert a database row (dict-like) to a Workspace model.

    ``owner_id`` falls back to :data:`SYSTEM_OWNER_ID` when the column is
    absent (defensive — both backends migrate the column on init_db, but
    tests that build legacy rows by hand exercise this path).
    """
    # sqlite3.Row / asyncpg.Record use `key in row` for value membership,
    # not column lookup; explicit keys() is the documented way.
    owner_id = row["owner_id"] if "owner_id" in row.keys() else None  # noqa: SIM118
    return Workspace(
        id=row["id"],
        name=row["name"],
        color=row["color"],
        description=row["description"] if "description" in row.keys() else None,  # noqa: SIM118
        isDefault=bool(row["is_default"]),
        ownerId=owner_id or SYSTEM_OWNER_ID,
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def build_merged_workspace(
    existing: Workspace,
    data: dict[str, Any],
) -> Workspace:
    """Merge update data into an existing workspace, refreshing ``updatedAt``.

    ``isDefault`` and ``ownerId`` are explicitly held constant: neither
    field is mutable through the update path. ``isDefault`` only flips at
    migration time, and ``ownerId`` transfers are out of scope per the
    workspace ownership ADR. Defense-in-depth: even if a future caller
    smuggles the keys into ``data``, we never honour them.
    """
    merged = existing.model_dump()
    merged.update(data)
    merged["updatedAt"] = datetime.now(UTC).isoformat()
    return Workspace(
        id=existing.id,
        name=merged["name"],
        color=merged["color"],
        description=merged.get("description"),
        # is_default is intentionally never overwritten through update — only
        # the migration sets it. Preserves the built-in default flag.
        isDefault=existing.isDefault,
        # ownerId is read-only after creation. No transfers in Phase 2.
        ownerId=existing.ownerId,
        createdAt=existing.createdAt,
        updatedAt=merged["updatedAt"],
    )


def build_merged_profile(
    existing: ConnectionProfile,
    data: dict[str, Any],
    conn_id: str,
) -> ConnectionProfile:
    """Merge update data into an existing profile and return a new model.

    Sets ``updatedAt`` to the current UTC timestamp.
    """
    merged = existing.model_dump()
    merged.update(data)
    merged["updatedAt"] = datetime.now(UTC).isoformat()
    return ConnectionProfile(
        id=conn_id,
        name=merged["name"],
        hosts=merged["hosts"],
        port=merged["port"],
        clusterName=merged.get("clusterName"),
        username=merged.get("username"),
        password=merged.get("password"),
        color=merged["color"],
        note=merged.get("note"),
        labels=merged.get("labels") or {},
        workspaceId=merged.get("workspaceId") or DEFAULT_WORKSPACE_ID,
        createdAt=existing.createdAt,
        updatedAt=merged["updatedAt"],
    )
