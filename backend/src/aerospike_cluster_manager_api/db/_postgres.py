"""PostgreSQL persistence layer for connection profiles.

Uses asyncpg with a connection pool for fully async database access.
"""

from __future__ import annotations

import json
import logging

import asyncpg

from aerospike_cluster_manager_api import config
from aerospike_cluster_manager_api.db._base import build_merged_profile, row_to_profile
from aerospike_cluster_manager_api.models.connection import ConnectionProfile

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS connections (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    hosts        JSONB NOT NULL,
    port         INTEGER NOT NULL DEFAULT 3000,
    cluster_name TEXT,
    username     TEXT,
    password     TEXT,
    color        TEXT NOT NULL DEFAULT '#0097D3',
    label        TEXT,
    label_color  TEXT,
    description  TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
"""


def _get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _pool


async def _apply_migrations(conn: asyncpg.Connection) -> None:
    """Add columns introduced after the initial schema."""
    row = await conn.fetchrow(
        """SELECT column_name FROM information_schema.columns
           WHERE table_name = 'connections' AND column_name = 'label'"""
    )
    if row is None:
        logger.info("Migrating PostgreSQL: adding label, label_color, description columns")
        await conn.execute("ALTER TABLE connections ADD COLUMN label TEXT")
        await conn.execute("ALTER TABLE connections ADD COLUMN label_color TEXT")
        await conn.execute("ALTER TABLE connections ADD COLUMN description TEXT")


async def init_db() -> None:
    global _pool
    logger.info("Connecting to PostgreSQL …")
    old_pool = _pool
    pool = await asyncpg.create_pool(
        config.DATABASE_URL,
        min_size=config.DB_POOL_MIN_SIZE,
        max_size=config.DB_POOL_MAX_SIZE,
        command_timeout=config.DB_COMMAND_TIMEOUT,
    )
    try:
        async with pool.acquire() as conn:
            await conn.execute(CREATE_TABLE_SQL)
            await _apply_migrations(conn)
        _pool = pool
    except Exception:
        _pool = old_pool
        await pool.close()
        raise
    logger.info("Database initialized")


async def check_health() -> bool:
    """Check database connectivity. Returns True if healthy."""
    try:
        pool = _get_pool()
        await pool.fetchval("SELECT 1")
        return True
    except Exception:
        return False


async def close_db() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


# ---------------------------------------------------------------------------
# Row -> Model helper (delegated to _base.py)
# ---------------------------------------------------------------------------

_row_to_profile = row_to_profile


# ---------------------------------------------------------------------------
# Async public API
# ---------------------------------------------------------------------------


async def get_all_connections() -> list[ConnectionProfile]:
    pool = _get_pool()
    rows = await pool.fetch("SELECT * FROM connections ORDER BY created_at")
    return [_row_to_profile(row) for row in rows]


async def get_connection(conn_id: str) -> ConnectionProfile | None:
    pool = _get_pool()
    row = await pool.fetchrow("SELECT * FROM connections WHERE id = $1", conn_id)
    return _row_to_profile(row) if row else None


async def create_connection(conn: ConnectionProfile) -> None:
    pool = _get_pool()
    await pool.execute(
        """INSERT INTO connections (id, name, hosts, port, cluster_name, username, password, color, label, label_color, description, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)""",
        conn.id,
        conn.name,
        json.dumps(conn.hosts),
        conn.port,
        conn.clusterName,
        conn.username,
        conn.password,
        conn.color,
        conn.label,
        conn.label_color,
        conn.description,
        conn.createdAt,
        conn.updatedAt,
    )


async def update_connection(conn_id: str, data: dict) -> ConnectionProfile | None:
    pool = _get_pool()
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow("SELECT * FROM connections WHERE id = $1 FOR UPDATE", conn_id)
        if not row:
            return None

        existing = _row_to_profile(row)
        updated = build_merged_profile(existing, data, conn_id)

        await conn.execute(
            """UPDATE connections
                   SET name = $1, hosts = $2::jsonb, port = $3, cluster_name = $4,
                       username = $5, password = $6, color = $7,
                       label = $8, label_color = $9, description = $10,
                       updated_at = $11
                   WHERE id = $12""",
            updated.name,
            json.dumps(updated.hosts),
            updated.port,
            updated.clusterName,
            updated.username,
            updated.password,
            updated.color,
            updated.label,
            updated.label_color,
            updated.description,
            updated.updatedAt,
            conn_id,
        )
        return updated


async def delete_connection(conn_id: str) -> bool:
    pool = _get_pool()
    result = await pool.execute("DELETE FROM connections WHERE id = $1", conn_id)
    return result == "DELETE 1"
