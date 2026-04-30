"""SQLite persistence layer for connection profiles.

Uses aiosqlite with WAL mode for async database access.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3

import aiosqlite

from aerospike_cluster_manager_api import config
from aerospike_cluster_manager_api.db._base import build_merged_profile, row_to_profile
from aerospike_cluster_manager_api.models.connection import ConnectionProfile

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
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
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


# ---------------------------------------------------------------------------
# Async public API
# ---------------------------------------------------------------------------


async def get_all_connections() -> list[ConnectionProfile]:
    conn = _get_conn()
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
            """INSERT INTO connections (id, name, hosts, port, cluster_name, username, password, color, description, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
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
                       description = ?,
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
