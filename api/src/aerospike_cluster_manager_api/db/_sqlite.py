"""SQLite persistence layer for connection profiles.

Uses aiosqlite with WAL mode for async database access.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from datetime import UTC, datetime

import aiosqlite

from aerospike_cluster_manager_api import config
from aerospike_cluster_manager_api.db._base import (
    build_merged_profile,
    build_merged_workspace,
    row_to_profile,
    row_to_workspace,
)
from aerospike_cluster_manager_api.models.connection import ConnectionProfile
from aerospike_cluster_manager_api.models.note import RecordNote, SetNote, StoredPkType
from aerospike_cluster_manager_api.models.workspace import (
    DEFAULT_WORKSPACE_ID,
    SYSTEM_OWNER_ID,
    Workspace,
)

logger = logging.getLogger(__name__)

_conn: aiosqlite.Connection | None = None

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS connections (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    hosts        TEXT NOT NULL,
    port         INTEGER NOT NULL DEFAULT 3000,
    cluster_name TEXT,
    username     TEXT,
    password     TEXT,
    color        TEXT NOT NULL DEFAULT '#0097D3',
    note         TEXT,
    labels       TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
"""

CREATE_WORKSPACES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS workspaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#6366F1',
    description TEXT,
    is_default  INTEGER NOT NULL DEFAULT 0,
    owner_id    TEXT NOT NULL DEFAULT 'system',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
"""

# Set-level operator notes (free text). Identity is
# (connection_id, namespace, set_name); FK CASCADE keeps the table tidy when
# a connection is deleted. PRAGMA foreign_keys=ON is set in init_db().
CREATE_SET_NOTES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS set_notes (
    connection_id TEXT NOT NULL,
    namespace     TEXT NOT NULL,
    set_name      TEXT NOT NULL,
    note          TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    updated_by    TEXT,
    PRIMARY KEY (connection_id, namespace, set_name),
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
);
"""

CREATE_SET_NOTES_INDEX_SQL = "CREATE INDEX IF NOT EXISTS idx_set_notes_conn_ns ON set_notes(connection_id, namespace);"

# Record-level operator notes. ``pk_type`` participates in the PK because
# Aerospike treats ``42:string`` and ``42:int`` as distinct records (different
# digests). ``digest_hex`` is verification-only — derived from (set, pk) so
# it doesn't need to be in the PK or even non-null in 1차 release.
CREATE_RECORD_NOTES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS record_notes (
    connection_id TEXT NOT NULL,
    namespace     TEXT NOT NULL,
    set_name      TEXT NOT NULL,
    pk_text       TEXT NOT NULL,
    pk_type       TEXT NOT NULL DEFAULT 'string',
    digest_hex    TEXT,
    note          TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    updated_by    TEXT,
    PRIMARY KEY (connection_id, namespace, set_name, pk_text, pk_type),
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
);
"""

CREATE_RECORD_NOTES_INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS idx_record_notes_conn_ns_set ON record_notes(connection_id, namespace, set_name);"
)


def _get_conn() -> aiosqlite.Connection:
    if _conn is None:
        # Imported inside the function to avoid a circular import at module
        # load time (``db/__init__.py`` imports from ``db/_sqlite.py``).
        from aerospike_cluster_manager_api.db import DBNotInitialized

        raise DBNotInitialized("Database not initialized. Call init_db() first.")
    return _conn


async def _apply_migrations(conn: aiosqlite.Connection) -> None:
    """Add columns introduced after the initial schema."""
    async with conn.execute("PRAGMA table_info(connections)") as cursor:
        columns = {row[1] for row in await cursor.fetchall()}

    # description -> note rename. Idempotent across all DB ages:
    #   * fresh DB (CREATE TABLE has note already): both branches skip
    #   * legacy DB with description: RENAME description -> note
    #   * legacy DB without either: ADD COLUMN note (very old layout)
    if "note" not in columns:
        if "description" in columns:
            logger.info("Renaming SQLite column: connections.description -> connections.note")
            await conn.execute("ALTER TABLE connections RENAME COLUMN description TO note")
        else:
            logger.info("Migrating SQLite: adding connections.note column")
            await conn.execute("ALTER TABLE connections ADD COLUMN note TEXT")
        await conn.commit()
        # refresh column set for downstream checks
        async with conn.execute("PRAGMA table_info(connections)") as cursor:
            columns = {row[1] for row in await cursor.fetchall()}

    if "labels" not in columns:
        logger.info("Migrating SQLite: adding labels column")
        await conn.execute("ALTER TABLE connections ADD COLUMN labels TEXT")
        await conn.commit()

    if "workspace_id" not in columns:
        logger.info("Migrating SQLite: adding workspace_id column")
        await conn.execute("ALTER TABLE connections ADD COLUMN workspace_id TEXT")
        await conn.commit()

    # workspaces.owner_id (issue #307 — Phase 0b). Idempotent: only ALTER
    # when the column is missing. SQLite does not support
    # ``ADD COLUMN IF NOT EXISTS`` until 3.35; inspect ``PRAGMA table_info``
    # explicitly so the migration is safe to re-run on every startup.
    # Existing rows backfill to ``'system'`` via the column default — the
    # workspace ACL treats that as accessible to any authenticated caller
    # (legacy single-tenant semantics).
    async with conn.execute("PRAGMA table_info(workspaces)") as cursor:
        ws_columns = {row[1] for row in await cursor.fetchall()}
    if "owner_id" not in ws_columns:
        logger.info("Migrating SQLite: adding workspaces.owner_id column")
        await conn.execute("ALTER TABLE workspaces ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'system'")
        await conn.commit()

    # Seed the built-in default workspace and back-fill any pre-existing
    # connections. Idempotent: INSERT OR IGNORE / UPDATE WHERE NULL.
    now = datetime.now(UTC).isoformat()
    await conn.execute(
        """INSERT OR IGNORE INTO workspaces
               (id, name, color, description, is_default, owner_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?)""",
        (
            DEFAULT_WORKSPACE_ID,
            "Default",
            "#6366F1",
            "Default workspace",
            SYSTEM_OWNER_ID,
            now,
            now,
        ),
    )
    await conn.execute(
        "UPDATE connections SET workspace_id = ? WHERE workspace_id IS NULL",
        (DEFAULT_WORKSPACE_ID,),
    )
    await conn.commit()


async def init_db() -> None:
    global _conn
    db_path = config.SQLITE_PATH
    if db_path != ":memory:":
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    logger.info("Connecting to SQLite at %s …", db_path)
    old_conn = _conn
    conn = await aiosqlite.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        await conn.execute("PRAGMA journal_mode=WAL")
        await conn.execute("PRAGMA foreign_keys=ON")
        await conn.execute(CREATE_TABLE_SQL)
        await conn.execute(CREATE_WORKSPACES_TABLE_SQL)
        await conn.execute(CREATE_SET_NOTES_TABLE_SQL)
        await conn.execute(CREATE_SET_NOTES_INDEX_SQL)
        await conn.execute(CREATE_RECORD_NOTES_TABLE_SQL)
        await conn.execute(CREATE_RECORD_NOTES_INDEX_SQL)
        await conn.commit()
        await _apply_migrations(conn)
        _conn = conn
    except Exception:
        await conn.close()
        _conn = old_conn
        raise
    if old_conn is not None:
        await old_conn.close()
    logger.info("Database initialized (SQLite)")


async def check_health() -> bool:
    """Check database connectivity. Returns True if healthy."""
    try:
        conn = _get_conn()
        async with conn.execute("SELECT 1") as cursor:
            await cursor.fetchone()
        return True
    except Exception:
        return False


async def close_db() -> None:
    global _conn
    if _conn:
        await _conn.close()
        _conn = None


# ---------------------------------------------------------------------------
# Row -> Model helper (delegated to _base.py)
# ---------------------------------------------------------------------------

_row_to_profile = row_to_profile
_row_to_workspace = row_to_workspace


# ---------------------------------------------------------------------------
# Async public API — connections
# ---------------------------------------------------------------------------


async def get_all_connections(workspace_id: str | None = None) -> list[ConnectionProfile]:
    conn = _get_conn()
    if workspace_id is not None:
        async with conn.execute(
            "SELECT * FROM connections WHERE workspace_id = ? ORDER BY created_at",
            (workspace_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    else:
        async with conn.execute("SELECT * FROM connections ORDER BY created_at") as cursor:
            rows = await cursor.fetchall()
    return [_row_to_profile(row) for row in rows]


async def get_connection(conn_id: str) -> ConnectionProfile | None:
    conn = _get_conn()
    async with conn.execute("SELECT * FROM connections WHERE id = ?", (conn_id,)) as cursor:
        row = await cursor.fetchone()
    return _row_to_profile(row) if row else None


async def create_connection(conn: ConnectionProfile) -> None:
    db_conn = _get_conn()
    try:
        await db_conn.execute(
            """INSERT INTO connections (id, name, hosts, port, cluster_name, username, password,
                                        color, note, labels, workspace_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                conn.id,
                conn.name,
                json.dumps(conn.hosts),
                conn.port,
                conn.clusterName,
                conn.username,
                conn.password,
                conn.color,
                conn.note,
                json.dumps(conn.labels),
                conn.workspaceId,
                conn.createdAt,
                conn.updatedAt,
            ),
        )
        await db_conn.commit()
    except Exception:
        await db_conn.rollback()
        raise


async def update_connection(conn_id: str, data: dict) -> ConnectionProfile | None:
    db_conn = _get_conn()
    async with db_conn.execute("SELECT * FROM connections WHERE id = ?", (conn_id,)) as cursor:
        row = await cursor.fetchone()
    if not row:
        return None

    existing = _row_to_profile(row)
    updated = build_merged_profile(existing, data, conn_id)

    try:
        await db_conn.execute(
            """UPDATE connections
                   SET name = ?, hosts = ?, port = ?, cluster_name = ?,
                       username = ?, password = ?, color = ?,
                       note = ?, labels = ?, workspace_id = ?,
                       updated_at = ?
                   WHERE id = ?""",
            (
                updated.name,
                json.dumps(updated.hosts),
                updated.port,
                updated.clusterName,
                updated.username,
                updated.password,
                updated.color,
                updated.note,
                json.dumps(updated.labels),
                updated.workspaceId,
                updated.updatedAt,
                conn_id,
            ),
        )
        await db_conn.commit()
    except Exception:
        await db_conn.rollback()
        raise

    return updated


async def delete_connection(conn_id: str) -> bool:
    db_conn = _get_conn()
    try:
        cursor = await db_conn.execute("DELETE FROM connections WHERE id = ?", (conn_id,))
        await db_conn.commit()
    except Exception:
        await db_conn.rollback()
        raise
    return cursor.rowcount == 1


# ---------------------------------------------------------------------------
# Async public API — workspaces
# ---------------------------------------------------------------------------


async def get_all_workspaces() -> list[Workspace]:
    conn = _get_conn()
    # Built-in default workspace must always sort first so the UI can pick a
    # stable initial selection without an extra query.
    async with conn.execute("SELECT * FROM workspaces ORDER BY is_default DESC, created_at") as cursor:
        rows = await cursor.fetchall()
    return [_row_to_workspace(row) for row in rows]


async def get_workspace(workspace_id: str) -> Workspace | None:
    conn = _get_conn()
    async with conn.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,)) as cursor:
        row = await cursor.fetchone()
    return _row_to_workspace(row) if row else None


async def get_workspaces_owned_by(owner_id: str) -> list[Workspace]:
    """Return workspaces visible to ``owner_id``.

    Visibility = ``ownerId == owner_id`` OR ``ownerId == 'system'``. The
    second leg keeps the built-in default and any pre-migration rows
    accessible to every authenticated caller, matching the ACL contract
    in the ownership ADR. Default workspace sorts first so the UI can
    pick a stable initial selection without an extra query.
    """
    conn = _get_conn()
    async with conn.execute(
        """SELECT * FROM workspaces
               WHERE owner_id = ? OR owner_id = ?
               ORDER BY is_default DESC, created_at""",
        (owner_id, SYSTEM_OWNER_ID),
    ) as cursor:
        rows = await cursor.fetchall()
    return [_row_to_workspace(row) for row in rows]


async def create_workspace(ws: Workspace) -> None:
    db_conn = _get_conn()
    try:
        await db_conn.execute(
            """INSERT INTO workspaces
                   (id, name, color, description, is_default, owner_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                ws.id,
                ws.name,
                ws.color,
                ws.description,
                1 if ws.isDefault else 0,
                ws.ownerId,
                ws.createdAt,
                ws.updatedAt,
            ),
        )
        await db_conn.commit()
    except Exception:
        await db_conn.rollback()
        raise


async def update_workspace(workspace_id: str, data: dict) -> Workspace | None:
    """Atomic read-modify-write under a BEGIN IMMEDIATE write lock.

    Mirrors the Postgres ``SELECT ... FOR UPDATE`` invariant: the SELECT
    and UPDATE must run inside the same transaction so a concurrent
    writer cannot overwrite our merged result with stale data.
    """
    db_conn = _get_conn()
    await db_conn.execute("BEGIN IMMEDIATE")
    try:
        async with db_conn.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,)) as cursor:
            row = await cursor.fetchone()
        if not row:
            await db_conn.rollback()
            return None

        existing = _row_to_workspace(row)
        updated = build_merged_workspace(existing, data)

        await db_conn.execute(
            """UPDATE workspaces
                   SET name = ?, color = ?, description = ?, updated_at = ?
                   WHERE id = ?""",
            (
                updated.name,
                updated.color,
                updated.description,
                updated.updatedAt,
                workspace_id,
            ),
        )
        await db_conn.commit()
    except Exception:
        await db_conn.rollback()
        raise

    return updated


async def delete_workspace(workspace_id: str) -> bool:
    """Delete a workspace by id, refusing to delete the built-in default.

    The ``is_default = 0`` clause is defense-in-depth: the router already
    rejects deletes of the default workspace with HTTP 400, but enforcing
    it at the DB layer guarantees the invariant holds even if a future
    caller bypasses the router (refactor, internal task, direct tests).
    """
    db_conn = _get_conn()
    try:
        cursor = await db_conn.execute(
            "DELETE FROM workspaces WHERE id = ? AND is_default = 0",
            (workspace_id,),
        )
        await db_conn.commit()
    except Exception:
        await db_conn.rollback()
        raise
    return cursor.rowcount == 1


async def count_connections_in_workspace(workspace_id: str) -> int:
    conn = _get_conn()
    async with conn.execute("SELECT COUNT(*) FROM connections WHERE workspace_id = ?", (workspace_id,)) as cursor:
        row = await cursor.fetchone()
    return int(row[0]) if row else 0


# ---------------------------------------------------------------------------
# Async public API — set notes
# ---------------------------------------------------------------------------


def _row_to_set_note(row: aiosqlite.Row) -> SetNote:
    return SetNote(
        connectionId=row["connection_id"],
        namespace=row["namespace"],
        setName=row["set_name"],
        note=row["note"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        updatedBy=row["updated_by"],
    )


async def upsert_set_note(
    connection_id: str,
    namespace: str,
    set_name: str,
    note: str,
    updated_by: str | None,
) -> SetNote:
    """Insert or update a set note. Caller has already validated note is non-empty."""
    db_conn = _get_conn()
    now = datetime.now(UTC).isoformat()
    # Single statement INSERT … RETURNING * (SQLite 3.35+) so the row we
    # return is the row we just wrote — no race window between commit and a
    # follow-up SELECT, which mattered when two concurrent upserts shared
    # the module-level aiosqlite connection.
    try:
        async with db_conn.execute(
            """INSERT INTO set_notes (connection_id, namespace, set_name, note,
                                      created_at, updated_at, updated_by)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(connection_id, namespace, set_name) DO UPDATE SET
                   note = excluded.note,
                   updated_at = excluded.updated_at,
                   updated_by = excluded.updated_by
               RETURNING *""",
            (connection_id, namespace, set_name, note, now, now, updated_by),
        ) as cursor:
            row = await cursor.fetchone()
        await db_conn.commit()
    except Exception:
        await db_conn.rollback()
        raise
    if row is None:  # pragma: no cover — RETURNING * always emits on upsert
        raise RuntimeError("set note vanished immediately after upsert")
    return _row_to_set_note(row)


async def delete_set_note(connection_id: str, namespace: str, set_name: str) -> bool:
    db_conn = _get_conn()
    try:
        cursor = await db_conn.execute(
            "DELETE FROM set_notes WHERE connection_id = ? AND namespace = ? AND set_name = ?",
            (connection_id, namespace, set_name),
        )
        await db_conn.commit()
    except Exception:
        await db_conn.rollback()
        raise
    return cursor.rowcount == 1


async def get_set_note(connection_id: str, namespace: str, set_name: str) -> SetNote | None:
    conn = _get_conn()
    async with conn.execute(
        """SELECT * FROM set_notes
               WHERE connection_id = ? AND namespace = ? AND set_name = ?""",
        (connection_id, namespace, set_name),
    ) as cursor:
        row = await cursor.fetchone()
    return _row_to_set_note(row) if row else None


async def list_set_notes(connection_id: str, namespace: str | None = None) -> list[SetNote]:
    conn = _get_conn()
    if namespace is None:
        async with conn.execute(
            "SELECT * FROM set_notes WHERE connection_id = ? ORDER BY namespace, set_name",
            (connection_id,),
        ) as cursor:
            rows = await cursor.fetchall()
    else:
        async with conn.execute(
            """SELECT * FROM set_notes
                   WHERE connection_id = ? AND namespace = ?
                   ORDER BY set_name""",
            (connection_id, namespace),
        ) as cursor:
            rows = await cursor.fetchall()
    return [_row_to_set_note(r) for r in rows]


async def batch_get_set_notes(
    connection_id: str,
    namespace: str,
    set_names: list[str],
) -> dict[str, str]:
    if not set_names:
        return {}
    conn = _get_conn()
    placeholders = ",".join("?" * len(set_names))
    sql = (
        f"SELECT set_name, note FROM set_notes "
        f"WHERE connection_id = ? AND namespace = ? AND set_name IN ({placeholders})"
    )
    async with conn.execute(sql, (connection_id, namespace, *set_names)) as cursor:
        rows = await cursor.fetchall()
    return {row["set_name"]: row["note"] for row in rows}


# ---------------------------------------------------------------------------
# Async public API — record notes
# ---------------------------------------------------------------------------


def _row_to_record_note(row: aiosqlite.Row) -> RecordNote:
    return RecordNote(
        connectionId=row["connection_id"],
        namespace=row["namespace"],
        setName=row["set_name"],
        pkText=row["pk_text"],
        pkType=row["pk_type"],
        digestHex=row["digest_hex"],
        note=row["note"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        updatedBy=row["updated_by"],
    )


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
    db_conn = _get_conn()
    now = datetime.now(UTC).isoformat()
    # See upsert_set_note — single-statement RETURNING * eliminates the
    # commit-then-SELECT race when two coroutines share the module-level
    # aiosqlite connection.
    try:
        async with db_conn.execute(
            """INSERT INTO record_notes (connection_id, namespace, set_name, pk_text, pk_type,
                                         digest_hex, note, created_at, updated_at, updated_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(connection_id, namespace, set_name, pk_text, pk_type) DO UPDATE SET
                   digest_hex = excluded.digest_hex,
                   note = excluded.note,
                   updated_at = excluded.updated_at,
                   updated_by = excluded.updated_by
               RETURNING *""",
            (connection_id, namespace, set_name, pk_text, pk_type, digest_hex, note, now, now, updated_by),
        ) as cursor:
            row = await cursor.fetchone()
        await db_conn.commit()
    except Exception:
        await db_conn.rollback()
        raise
    if row is None:  # pragma: no cover — RETURNING * always emits on upsert
        raise RuntimeError("record note vanished immediately after upsert")
    return _row_to_record_note(row)


async def delete_record_note(
    connection_id: str,
    namespace: str,
    set_name: str,
    pk_text: str,
    pk_type: StoredPkType,
) -> bool:
    db_conn = _get_conn()
    try:
        cursor = await db_conn.execute(
            """DELETE FROM record_notes
                   WHERE connection_id = ? AND namespace = ? AND set_name = ?
                     AND pk_text = ? AND pk_type = ?""",
            (connection_id, namespace, set_name, pk_text, pk_type),
        )
        await db_conn.commit()
    except Exception:
        await db_conn.rollback()
        raise
    return cursor.rowcount == 1


async def get_record_note(
    connection_id: str,
    namespace: str,
    set_name: str,
    pk_text: str,
    pk_type: StoredPkType,
) -> RecordNote | None:
    conn = _get_conn()
    async with conn.execute(
        """SELECT * FROM record_notes
               WHERE connection_id = ? AND namespace = ? AND set_name = ?
                 AND pk_text = ? AND pk_type = ?""",
        (connection_id, namespace, set_name, pk_text, pk_type),
    ) as cursor:
        row = await cursor.fetchone()
    return _row_to_record_note(row) if row else None


async def list_record_notes(
    connection_id: str,
    namespace: str,
    set_name: str,
) -> list[RecordNote]:
    conn = _get_conn()
    async with conn.execute(
        """SELECT * FROM record_notes
               WHERE connection_id = ? AND namespace = ? AND set_name = ?
               ORDER BY pk_text""",
        (connection_id, namespace, set_name),
    ) as cursor:
        rows = await cursor.fetchall()
    return [_row_to_record_note(r) for r in rows]


async def batch_get_record_notes(
    connection_id: str,
    namespace: str,
    set_name: str,
    pks: list[tuple[str, StoredPkType]],
) -> dict[tuple[str, StoredPkType], str]:
    if not pks:
        return {}
    conn = _get_conn()
    # SQLite has no native row-value IN; we scope by (conn, ns, set) so the
    # OR-chain runs over the small index slice for one set, not the whole
    # table. 50-row data browser ⇒ trivial cost.
    or_clauses = " OR ".join("(pk_text = ? AND pk_type = ?)" for _ in pks)
    sql = (
        f"SELECT pk_text, pk_type, note FROM record_notes "
        f"WHERE connection_id = ? AND namespace = ? AND set_name = ? AND ({or_clauses})"
    )
    flat: list[str] = [connection_id, namespace, set_name]
    for pk_text, pk_type in pks:
        flat.append(pk_text)
        flat.append(pk_type)
    async with conn.execute(sql, tuple(flat)) as cursor:
        rows = await cursor.fetchall()
    return {(row["pk_text"], row["pk_type"]): row["note"] for row in rows}
