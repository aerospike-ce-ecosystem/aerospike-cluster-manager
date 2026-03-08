"""Tests for aerospike_cluster_manager_api.db module.

Uses a testcontainers PostgreSQL database to test async CRUD operations
on connection profiles.
"""

from __future__ import annotations

from datetime import UTC, datetime

import asyncpg
import pytest

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.models.connection import ConnectionProfile


class TestInitDb:
    async def test_init_creates_table(self, init_test_db):
        """init_db() should create the connections table."""
        pool = db._get_pool()
        row = await pool.fetchrow("SELECT table_name FROM information_schema.tables WHERE table_name = 'connections'")
        assert row is not None

    async def test_init_starts_with_empty_table(self, init_test_db):
        """init_db() should create an empty connections table (no seed data)."""
        profiles = await db.get_all_connections()
        assert len(profiles) == 0


class TestGetAllConnections:
    async def test_returns_list(self, init_test_db):
        result = await db.get_all_connections()
        assert isinstance(result, list)
        for item in result:
            assert isinstance(item, ConnectionProfile)

    async def test_ordered_by_created_at(self, init_test_db, sample_connection):
        """Connections should come back ordered by created_at."""
        await db.create_connection(sample_connection)
        later = ConnectionProfile(
            id="conn-later",
            name="Later Connection",
            hosts=["10.0.0.1"],
            port=3000,
            color="#FF0000",
            createdAt="2099-01-01T00:00:00+00:00",
            updatedAt="2099-01-01T00:00:00+00:00",
        )
        await db.create_connection(later)

        all_profiles = await db.get_all_connections()
        ids = [p.id for p in all_profiles]
        assert ids.index(sample_connection.id) < ids.index("conn-later")


class TestGetConnection:
    async def test_existing(self, init_test_db, sample_connection):
        await db.create_connection(sample_connection)
        result = await db.get_connection(sample_connection.id)
        assert result is not None
        assert result.id == sample_connection.id
        assert result.name == sample_connection.name

    async def test_not_found(self, init_test_db):
        result = await db.get_connection("nonexistent-id")
        assert result is None


class TestCreateConnection:
    async def test_insert_and_retrieve(self, init_test_db, sample_connection):
        await db.create_connection(sample_connection)

        retrieved = await db.get_connection(sample_connection.id)
        assert retrieved is not None
        assert retrieved.id == sample_connection.id
        assert retrieved.name == sample_connection.name
        assert retrieved.hosts == sample_connection.hosts
        assert retrieved.port == sample_connection.port
        assert retrieved.color == sample_connection.color

    async def test_insert_preserves_optional_fields(self, init_test_db):
        now = datetime.now(UTC).isoformat()
        conn = ConnectionProfile(
            id="conn-full",
            name="Full Connection",
            hosts=["10.0.0.1", "10.0.0.2"],
            port=4000,
            clusterName="my-cluster",
            username="admin",
            password="secret",
            color="#AABBCC",
            createdAt=now,
            updatedAt=now,
        )
        await db.create_connection(conn)

        retrieved = await db.get_connection("conn-full")
        assert retrieved is not None
        assert retrieved.clusterName == "my-cluster"
        assert retrieved.username == "admin"
        assert retrieved.password == "secret"
        assert retrieved.hosts == ["10.0.0.1", "10.0.0.2"]

    async def test_insert_duplicate_id_raises(self, init_test_db, sample_connection):
        await db.create_connection(sample_connection)
        with pytest.raises(asyncpg.UniqueViolationError):
            await db.create_connection(sample_connection)


class TestUpdateConnection:
    async def test_update_name(self, init_test_db, sample_connection):
        await db.create_connection(sample_connection)

        updated = await db.update_connection(sample_connection.id, {"name": "Updated Name"})
        assert updated is not None
        assert updated.name == "Updated Name"
        assert updated.hosts == sample_connection.hosts
        assert updated.port == sample_connection.port

    async def test_update_multiple_fields(self, init_test_db, sample_connection):
        await db.create_connection(sample_connection)

        updated = await db.update_connection(
            sample_connection.id,
            {"name": "New Name", "port": 4000, "color": "#FF0000"},
        )
        assert updated is not None
        assert updated.name == "New Name"
        assert updated.port == 4000
        assert updated.color == "#FF0000"

    async def test_update_sets_updated_at(self, init_test_db, sample_connection):
        await db.create_connection(sample_connection)
        original_updated_at = sample_connection.updatedAt

        updated = await db.update_connection(sample_connection.id, {"name": "Changed"})
        assert updated is not None
        assert updated.updatedAt != original_updated_at

    async def test_update_nonexistent_returns_none(self, init_test_db):
        result = await db.update_connection("does-not-exist", {"name": "Nope"})
        assert result is None

    async def test_update_preserves_id(self, init_test_db, sample_connection):
        """Attempting to change the id via data dict should be overridden."""
        await db.create_connection(sample_connection)

        updated = await db.update_connection(sample_connection.id, {"id": "hacked", "name": "Same"})
        assert updated is not None
        assert updated.id == sample_connection.id


class TestDeleteConnection:
    async def test_delete_existing(self, init_test_db, sample_connection):
        await db.create_connection(sample_connection)
        assert await db.get_connection(sample_connection.id) is not None

        deleted = await db.delete_connection(sample_connection.id)
        assert deleted is True
        assert await db.get_connection(sample_connection.id) is None

    async def test_delete_nonexistent(self, init_test_db):
        deleted = await db.delete_connection("no-such-id")
        assert deleted is False

    async def test_delete_does_not_affect_others(self, init_test_db, sample_connection):
        other = ConnectionProfile(
            id="conn-other",
            name="Other Connection",
            hosts=["10.0.0.1"],
            port=3000,
            color="#FF0000",
            createdAt=sample_connection.createdAt,
            updatedAt=sample_connection.updatedAt,
        )
        await db.create_connection(sample_connection)
        await db.create_connection(other)

        await db.delete_connection(sample_connection.id)

        remaining = await db.get_all_connections()
        assert any(p.id == "conn-other" for p in remaining)


class TestCloseDb:
    async def test_close_sets_pool_to_none(self, init_test_db):
        """After close_db(), the module-level _pool should be None."""
        assert db._pool is not None
        await db.close_db()
        assert db._pool is None

    async def test_close_when_already_closed(self):
        """Calling close_db() when already closed should not raise."""
        db._pool = None
        await db.close_db()
        assert db._pool is None


class TestGetPoolWithoutInit:
    def test_raises_runtime_error(self):
        """_get_pool() should raise if init_db() was never called."""
        original = db._pool
        db._pool = None
        try:
            with pytest.raises(RuntimeError, match="Database not initialized"):
                db._get_pool()
        finally:
            db._pool = original
