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
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
"""


def _get_conn() -> aiosqlite.Connection:
    if _conn is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _conn


async def init_db() -> None:
    global _conn
    db_path = config.SQLITE_PATH
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    logger.info("Connecting to SQLite at %s …", db_path)
    conn = await aiosqlite.connect(db_path)
    conn.row_factory = sqlite3.Row
    await conn.execute("PRAGMA journal_mode=WAL")
    await conn.execute("PRAGMA foreign_keys=ON")
    await conn.execute(CREATE_TABLE_SQL)
    await conn.commit()
    _conn = conn
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
# Row -> Model helper
# ---------------------------------------------------------------------------


def _row_to_profile(row: sqlite3.Row) -> ConnectionProfile:
    hosts = row["hosts"]
    if isinstance(hosts, str):
        try:
            hosts = json.loads(hosts)
        except json.JSONDecodeError:
            hosts = [hosts]
    return ConnectionProfile(
        id=row["id"],
        name=row["name"],
        hosts=hosts,
        port=row["port"],
        clusterName=row["cluster_name"],
        username=row["username"],
        password=row["password"],
        color=row["color"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


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
    await db_conn.execute(
        """INSERT INTO connections (id, name, hosts, port, cluster_name, username, password, color, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            conn.id,
            conn.name,
            json.dumps(conn.hosts),
            conn.port,
            conn.clusterName,
            conn.username,
            conn.password,
            conn.color,
            conn.createdAt,
            conn.updatedAt,
        ),
    )
    await db_conn.commit()


async def update_connection(conn_id: str, data: dict) -> ConnectionProfile | None:
    db_conn = _get_conn()
    async with db_conn.execute("SELECT * FROM connections WHERE id = ?", (conn_id,)) as cursor:
        row = await cursor.fetchone()
    if not row:
        return None

    existing = _row_to_profile(row)
    merged = existing.model_dump()
    merged.update(data)
    merged["updatedAt"] = datetime.now(UTC).isoformat()

    try:
        await db_conn.execute(
            """UPDATE connections
                   SET name = ?, hosts = ?, port = ?, cluster_name = ?,
                       username = ?, password = ?, color = ?, updated_at = ?
                   WHERE id = ?""",
            (
                merged["name"],
                json.dumps(merged["hosts"]),
                merged["port"],
                merged.get("clusterName"),
                merged.get("username"),
                merged.get("password"),
                merged["color"],
                merged["updatedAt"],
                conn_id,
            ),
        )
        await db_conn.commit()
    except Exception:
        await db_conn.rollback()
        raise

    return ConnectionProfile(
        id=conn_id,
        name=merged["name"],
        hosts=merged["hosts"],
        port=merged["port"],
        clusterName=merged.get("clusterName"),
        username=merged.get("username"),
        password=merged.get("password"),
        color=merged["color"],
        createdAt=existing.createdAt,
        updatedAt=merged["updatedAt"],
    )


async def delete_connection(conn_id: str) -> bool:
    db_conn = _get_conn()
    cursor = await db_conn.execute("DELETE FROM connections WHERE id = ?", (conn_id,))
    await db_conn.commit()
    return cursor.rowcount == 1
