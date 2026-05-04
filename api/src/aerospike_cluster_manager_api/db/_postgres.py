"""PostgreSQL persistence layer for connection profiles.

Uses asyncpg with a connection pool for fully async database access.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

import asyncpg

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
    description  TEXT,
    labels       JSONB,
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
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
"""


def _get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _pool


async def _apply_migrations(conn: asyncpg.Connection | asyncpg.pool.PoolConnectionProxy) -> None:
    """Add columns introduced after the initial schema.

    Uses ``ADD COLUMN IF NOT EXISTS`` so concurrent startups (e.g. rolling
    deploys with multiple replicas) do not race each other.
    """
    await conn.execute("ALTER TABLE connections ADD COLUMN IF NOT EXISTS description TEXT")
    await conn.execute("ALTER TABLE connections ADD COLUMN IF NOT EXISTS labels JSONB")
    await conn.execute("ALTER TABLE connections ADD COLUMN IF NOT EXISTS workspace_id TEXT")

    # Seed the built-in default workspace and back-fill any pre-existing
    # connections. Idempotent: ON CONFLICT DO NOTHING / WHERE workspace_id IS NULL.
    now = datetime.now(UTC).isoformat()
    await conn.execute(
        """INSERT INTO workspaces
               (id, name, color, description, is_default, created_at, updated_at)
           VALUES ($1, $2, $3, $4, TRUE, $5, $6)
           ON CONFLICT (id) DO NOTHING""",
        DEFAULT_WORKSPACE_ID,
        "Default",
        "#6366F1",
        "Default workspace",
        now,
        now,
    )
    await conn.execute(
        "UPDATE connections SET workspace_id = $1 WHERE workspace_id IS NULL",
        DEFAULT_WORKSPACE_ID,
    )


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
            await conn.execute(CREATE_WORKSPACES_TABLE_SQL)
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
_row_to_workspace = row_to_workspace


# ---------------------------------------------------------------------------
# Async public API — connections
# ---------------------------------------------------------------------------


async def get_all_connections(workspace_id: str | None = None) -> list[ConnectionProfile]:
    pool = _get_pool()
    if workspace_id is not None:
        rows = await pool.fetch(
            "SELECT * FROM connections WHERE workspace_id = $1 ORDER BY created_at",
            workspace_id,
        )
    else:
        rows = await pool.fetch("SELECT * FROM connections ORDER BY created_at")
    return [_row_to_profile(row) for row in rows]


async def get_connection(conn_id: str) -> ConnectionProfile | None:
    pool = _get_pool()
    row = await pool.fetchrow("SELECT * FROM connections WHERE id = $1", conn_id)
    return _row_to_profile(row) if row else None


async def create_connection(conn: ConnectionProfile) -> None:
    pool = _get_pool()
    await pool.execute(
        """INSERT INTO connections (id, name, hosts, port, cluster_name, username, password,
                                    color, description, labels, workspace_id, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)""",
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
                       description = $8, labels = $9::jsonb, workspace_id = $10,
                       updated_at = $11
                   WHERE id = $12""",
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
        )
        return updated


async def delete_connection(conn_id: str) -> bool:
    pool = _get_pool()
    result = await pool.execute("DELETE FROM connections WHERE id = $1", conn_id)
    return result == "DELETE 1"


# ---------------------------------------------------------------------------
# Async public API — workspaces
# ---------------------------------------------------------------------------


async def get_all_workspaces() -> list[Workspace]:
    pool = _get_pool()
    rows = await pool.fetch("SELECT * FROM workspaces ORDER BY is_default DESC, created_at")
    return [_row_to_workspace(row) for row in rows]


async def get_workspace(workspace_id: str) -> Workspace | None:
    pool = _get_pool()
    row = await pool.fetchrow("SELECT * FROM workspaces WHERE id = $1", workspace_id)
    return _row_to_workspace(row) if row else None


async def create_workspace(ws: Workspace) -> None:
    pool = _get_pool()
    await pool.execute(
        """INSERT INTO workspaces (id, name, color, description, is_default, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)""",
        ws.id,
        ws.name,
        ws.color,
        ws.description,
        ws.isDefault,
        ws.createdAt,
        ws.updatedAt,
    )


async def update_workspace(workspace_id: str, data: dict) -> Workspace | None:
    pool = _get_pool()
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow("SELECT * FROM workspaces WHERE id = $1 FOR UPDATE", workspace_id)
        if not row:
            return None

        existing = _row_to_workspace(row)
        updated = build_merged_workspace(existing, data)

        await conn.execute(
            """UPDATE workspaces
                   SET name = $1, color = $2, description = $3, updated_at = $4
                   WHERE id = $5""",
            updated.name,
            updated.color,
            updated.description,
            updated.updatedAt,
            workspace_id,
        )
        return updated


async def delete_workspace(workspace_id: str) -> bool:
    """Delete a workspace by id, refusing to delete the built-in default.

    The ``is_default = FALSE`` clause is defense-in-depth: the router already
    rejects deletes of the default workspace with HTTP 400, but enforcing
    it at the DB layer guarantees the invariant holds even if a future
    caller bypasses the router (refactor, internal task, direct tests).
    """
    pool = _get_pool()
    result = await pool.execute(
        "DELETE FROM workspaces WHERE id = $1 AND is_default = FALSE",
        workspace_id,
    )
    return result == "DELETE 1"


async def count_connections_in_workspace(workspace_id: str) -> int:
    pool = _get_pool()
    val = await pool.fetchval("SELECT COUNT(*) FROM connections WHERE workspace_id = $1", workspace_id)
    return int(val) if val is not None else 0
