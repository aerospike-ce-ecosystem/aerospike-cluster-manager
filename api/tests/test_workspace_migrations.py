"""Migration tests for the workspaces table and connections.workspace_id."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import patch

import aiosqlite

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.models.workspace import (
    DEFAULT_WORKSPACE_ID,
    SYSTEM_OWNER_ID,
)


class TestDefaultWorkspaceSeed:
    async def test_default_created_on_init(self, init_test_db):
        ws = await db.get_workspace(DEFAULT_WORKSPACE_ID)
        assert ws is not None
        assert ws.isDefault is True
        assert ws.name == "Default"

    async def test_idempotent_init(self, init_test_db):
        # Re-init pointing at the same SQLite file used by the fixture.
        await db.close_db()
        with (
            patch("aerospike_cluster_manager_api.config.ENABLE_POSTGRES", False),
            patch("aerospike_cluster_manager_api.config.SQLITE_PATH", init_test_db),
        ):
            await db.init_db()
            workspaces = await db.get_all_workspaces()
        # Only one default workspace, no duplicates.
        assert sum(1 for w in workspaces if w.id == DEFAULT_WORKSPACE_ID) == 1


class TestConnectionBackfill:
    async def test_pre_existing_connection_backfilled(self, tmp_path):
        """A connection inserted before the workspace_id column existed
        should be migrated into the default workspace."""
        db_path = str(tmp_path / "legacy.db")

        # Build a "legacy" schema: the original connections table without
        # workspace_id, no workspaces table, with one row already present.
        async with aiosqlite.connect(db_path) as conn:
            await conn.execute("PRAGMA foreign_keys=ON")
            await conn.execute(
                """CREATE TABLE connections (
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
                )"""
            )
            now = datetime.now(UTC).isoformat()
            await conn.execute(
                """INSERT INTO connections
                       (id, name, hosts, port, color, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                ("conn-legacy-1", "legacy", json.dumps(["localhost"]), 3000, "#0097D3", now, now),
            )
            await conn.commit()

        with (
            patch("aerospike_cluster_manager_api.config.ENABLE_POSTGRES", False),
            patch("aerospike_cluster_manager_api.config.SQLITE_PATH", db_path),
        ):
            await db.init_db()
            try:
                conn_profile = await db.get_connection("conn-legacy-1")
                workspaces = await db.get_all_workspaces()
            finally:
                await db.close_db()

        assert conn_profile is not None
        assert conn_profile.workspaceId == DEFAULT_WORKSPACE_ID
        assert any(w.id == DEFAULT_WORKSPACE_ID and w.isDefault for w in workspaces)


class TestWorkspaceOwnerIdMigration:
    """Phase 0b — workspaces.owner_id ALTER + ``DEFAULT 'system'`` backfill.

    Together these guarantee:

    * The default workspace always lands with ``ownerId='system'`` after a
      fresh init_db (system sentinel grants any caller access).
    * A pre-existing workspaces row that predates the column gets the
      ``'system'`` value via the column DEFAULT — no data migration code.
    * The ALTER is idempotent: a re-run on a DB that already has the
      column does nothing, and the existing rows keep their values.
    * New rows can carry a real OIDC sub as ``ownerId``.
    """

    async def test_default_workspace_owner_is_system_after_init(self, init_test_db):
        ws = await db.get_workspace(DEFAULT_WORKSPACE_ID)
        assert ws is not None
        assert ws.ownerId == SYSTEM_OWNER_ID

    async def test_pre_existing_workspace_row_backfilled_to_system(self, tmp_path):
        db_path = str(tmp_path / "legacy-ws.db")

        # Build a legacy workspaces table without owner_id and seed one row.
        async with aiosqlite.connect(db_path) as conn:
            await conn.execute(
                """CREATE TABLE workspaces (
                    id          TEXT PRIMARY KEY,
                    name        TEXT NOT NULL,
                    color       TEXT NOT NULL DEFAULT '#6366F1',
                    description TEXT,
                    is_default  INTEGER NOT NULL DEFAULT 0,
                    created_at  TEXT NOT NULL,
                    updated_at  TEXT NOT NULL
                )"""
            )
            await conn.execute(
                """CREATE TABLE connections (
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
                    workspace_id TEXT,
                    created_at   TEXT NOT NULL,
                    updated_at   TEXT NOT NULL
                )"""
            )
            now = datetime.now(UTC).isoformat()
            await conn.execute(
                """INSERT INTO workspaces (id, name, color, is_default, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                ("ws-legacy-1", "legacy", "#123456", 0, now, now),
            )
            await conn.commit()

        with (
            patch("aerospike_cluster_manager_api.config.ENABLE_POSTGRES", False),
            patch("aerospike_cluster_manager_api.config.SQLITE_PATH", db_path),
        ):
            await db.init_db()
            try:
                ws = await db.get_workspace("ws-legacy-1")
            finally:
                await db.close_db()

        assert ws is not None
        # The migration's ``DEFAULT 'system'`` backfilled the legacy row.
        assert ws.ownerId == SYSTEM_OWNER_ID

    async def test_alter_is_idempotent(self, init_test_db):
        """Running the SQLite migration twice on a DB that already has the
        column must be a no-op (no error, no schema change, no data loss)."""
        # Re-init the same DB — _apply_migrations runs again.
        await db.close_db()
        with (
            patch("aerospike_cluster_manager_api.config.ENABLE_POSTGRES", False),
            patch("aerospike_cluster_manager_api.config.SQLITE_PATH", init_test_db),
        ):
            await db.init_db()
            ws = await db.get_workspace(DEFAULT_WORKSPACE_ID)
        assert ws is not None
        assert ws.ownerId == SYSTEM_OWNER_ID

    async def test_new_row_carries_real_owner_id(self, init_test_db):
        from aerospike_cluster_manager_api.models.workspace import Workspace

        now = datetime.now(UTC).isoformat()
        ws = Workspace(
            id="ws-team-real",
            name="real",
            color="#123456",
            ownerId="user-real",
            createdAt=now,
            updatedAt=now,
        )
        await db.create_workspace(ws)
        fetched = await db.get_workspace("ws-team-real")
        assert fetched is not None
        assert fetched.ownerId == "user-real"
