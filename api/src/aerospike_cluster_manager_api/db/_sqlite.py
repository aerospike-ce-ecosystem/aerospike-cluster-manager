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
from aerospike_cluster_manager_api.models.workspace import DEFAULT_WORKSPACE_ID, Workspace

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
    description  TEXT,
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
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
"""


def _get_conn() -> aiosqlite.Connection:
    if _conn is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _conn


async def _apply_migrations(conn: aiosqlite.Connection) -> None:
    """Add columns introduced after the initial schema."""
    async with conn.execute("PRAGMA table_info(connections)") as cursor:
        columns = {row[1] for row in await cursor.fetchall()}

    if "description" not in columns:
        logger.info("Migrating SQLite: adding description column")
        await conn.execute("ALTER TABLE connections ADD COLUMN description TEXT")
        await conn.commit()

    if "labels" not in columns:
        logger.info("Migrating SQLite: adding labels column")
        await conn.execute("ALTER TABLE connections ADD COLUMN labels TEXT")
        await conn.commit()

    if "workspace_id" not in columns:
        logger.info("Migrating SQLite: adding workspace_id column")
        await conn.execute("ALTER TABLE connections ADD COLUMN workspace_id TEXT")
        await conn.commit()

    # Seed the built-in default workspace and back-fill any pre-existing
    # connections. Idempotent: INSERT OR IGNORE / UPDATE WHERE NULL.
    now = datetime.now(UTC).isoformat()
    await conn.execute(
        """INSERT OR IGNORE INTO workspaces
               (id, name, color, description, is_default, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)""",
        (
            DEFAULT_WORKSPACE_ID,
            "Default",
            "#6366F1",
            "Default workspace",
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
                                        color, description, labels, workspace_id, created_at, updated_at)
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
                conn.description,
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
                       description = ?, labels = ?, workspace_id = ?,
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
                updated.description,
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


async def create_workspace(ws: Workspace) -> None:
    db_conn = _get_conn()
    try:
        await db_conn.execute(
            """INSERT INTO workspaces (id, name, color, description, is_default, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                ws.id,
                ws.name,
                ws.color,
                ws.description,
                1 if ws.isDefault else 0,
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
