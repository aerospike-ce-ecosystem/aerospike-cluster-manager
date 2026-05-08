"""Database persistence layer.

Dispatches to SQLite (default) or PostgreSQL (when ENABLE_POSTGRES=true).
Backend selection happens at init_db() call time, allowing tests to patch
config before initialization.
"""

from __future__ import annotations

import types
from typing import TYPE_CHECKING, cast

from aerospike_cluster_manager_api import config
from aerospike_cluster_manager_api.db._base import DatabaseBackend

if TYPE_CHECKING:
    from aerospike_cluster_manager_api.models.connection import ConnectionProfile
    from aerospike_cluster_manager_api.models.note import RecordNote, SetNote, StoredPkType
    from aerospike_cluster_manager_api.models.workspace import Workspace

_backend: types.ModuleType | None = None


class DBNotInitialized(RuntimeError):
    """Raised when the metaDB layer is accessed before ``init_db()`` ran.

    Exists as a dedicated sentinel so production code paths that opt to
    treat an uninitialised DB as "no annotations available" (e.g. the note
    injection helpers) can match this exception class exactly. Earlier
    revisions matched the message string (``"Database not initialized"``);
    that was fragile across i18n / log audits and risked silently
    swallowing unrelated ``RuntimeError``s.
    """


def _get_backend() -> DatabaseBackend:
    """Return the active database backend, typed as *DatabaseBackend*."""
    if _backend is None:
        raise DBNotInitialized("Database not initialized. Call init_db() first.")
    return cast(DatabaseBackend, _backend)


async def init_db() -> None:
    global _backend
    if config.ENABLE_POSTGRES:
        from aerospike_cluster_manager_api.db import _postgres as backend
    else:
        from aerospike_cluster_manager_api.db import _sqlite as backend
    await backend.init_db()
    _backend = backend


async def close_db() -> None:
    global _backend
    if _backend is not None:
        await _backend.close_db()
        _backend = None


async def check_health() -> bool:
    return await _get_backend().check_health()


# ---------------------------------------------------------------------------
# Connections
# ---------------------------------------------------------------------------


async def get_all_connections(workspace_id: str | None = None) -> list[ConnectionProfile]:
    return await _get_backend().get_all_connections(workspace_id)


async def get_connection(conn_id: str) -> ConnectionProfile | None:
    return await _get_backend().get_connection(conn_id)


async def create_connection(conn: ConnectionProfile) -> None:
    await _get_backend().create_connection(conn)


async def update_connection(conn_id: str, data: dict) -> ConnectionProfile | None:
    return await _get_backend().update_connection(conn_id, data)


async def delete_connection(conn_id: str) -> bool:
    return await _get_backend().delete_connection(conn_id)


# ---------------------------------------------------------------------------
# Workspaces
# ---------------------------------------------------------------------------


async def get_all_workspaces() -> list[Workspace]:
    return await _get_backend().get_all_workspaces()


async def get_workspace(workspace_id: str) -> Workspace | None:
    return await _get_backend().get_workspace(workspace_id)


async def get_workspaces_owned_by(owner_id: str) -> list[Workspace]:
    return await _get_backend().get_workspaces_owned_by(owner_id)


async def create_workspace(ws: Workspace) -> None:
    await _get_backend().create_workspace(ws)


async def update_workspace(workspace_id: str, data: dict) -> Workspace | None:
    return await _get_backend().update_workspace(workspace_id, data)


async def delete_workspace(workspace_id: str) -> bool:
    return await _get_backend().delete_workspace(workspace_id)


async def count_connections_in_workspace(workspace_id: str) -> int:
    return await _get_backend().count_connections_in_workspace(workspace_id)


# ---------------------------------------------------------------------------
# Set notes
# ---------------------------------------------------------------------------


async def upsert_set_note(
    connection_id: str,
    namespace: str,
    set_name: str,
    note: str,
    updated_by: str | None,
) -> SetNote:
    return await _get_backend().upsert_set_note(connection_id, namespace, set_name, note, updated_by)


async def delete_set_note(connection_id: str, namespace: str, set_name: str) -> bool:
    return await _get_backend().delete_set_note(connection_id, namespace, set_name)


async def get_set_note(connection_id: str, namespace: str, set_name: str) -> SetNote | None:
    return await _get_backend().get_set_note(connection_id, namespace, set_name)


async def list_set_notes(connection_id: str, namespace: str | None = None) -> list[SetNote]:
    return await _get_backend().list_set_notes(connection_id, namespace)


async def batch_get_set_notes(
    connection_id: str,
    namespace: str,
    set_names: list[str],
) -> dict[str, str]:
    return await _get_backend().batch_get_set_notes(connection_id, namespace, set_names)


# ---------------------------------------------------------------------------
# Record notes
# ---------------------------------------------------------------------------


async def upsert_record_note(
    connection_id: str,
    namespace: str,
    set_name: str,
    pk_text: str,
    pk_type: StoredPkType,
    note: str,
    digest_hex: str | None,
    updated_by: str | None,
) -> RecordNote:
    return await _get_backend().upsert_record_note(
        connection_id, namespace, set_name, pk_text, pk_type, note, digest_hex, updated_by
    )


async def delete_record_note(
    connection_id: str,
    namespace: str,
    set_name: str,
    pk_text: str,
    pk_type: StoredPkType,
) -> bool:
    return await _get_backend().delete_record_note(connection_id, namespace, set_name, pk_text, pk_type)


async def get_record_note(
    connection_id: str,
    namespace: str,
    set_name: str,
    pk_text: str,
    pk_type: StoredPkType,
) -> RecordNote | None:
    return await _get_backend().get_record_note(connection_id, namespace, set_name, pk_text, pk_type)


async def list_record_notes(
    connection_id: str,
    namespace: str,
    set_name: str,
) -> list[RecordNote]:
    return await _get_backend().list_record_notes(connection_id, namespace, set_name)


async def batch_get_record_notes(
    connection_id: str,
    namespace: str,
    set_name: str,
    pks: list[tuple[str, StoredPkType]],
) -> dict[tuple[str, StoredPkType], str]:
    return await _get_backend().batch_get_record_notes(connection_id, namespace, set_name, pks)
