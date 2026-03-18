"""Shared fixtures for backend tests."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import pytest

from aerospike_cluster_manager_api.models.connection import ConnectionProfile


@pytest.fixture()
def sample_connection() -> ConnectionProfile:
    """Return a sample ConnectionProfile for testing."""
    now = datetime.now(UTC).isoformat()
    return ConnectionProfile(
        id="conn-test-1",
        name="Test Aerospike",
        hosts=["localhost"],
        port=3000,
        clusterName="test-cluster",
        username=None,
        password=None,
        color="#0097D3",
        createdAt=now,
        updatedAt=now,
    )


@pytest.fixture()
async def init_test_db(tmp_path):
    """Initialize a temporary SQLite database for testing and clean up after."""
    from aerospike_cluster_manager_api import db

    db_path = str(tmp_path / "test_connections.db")
    with (
        patch("aerospike_cluster_manager_api.config.ENABLE_POSTGRES", False),
        patch("aerospike_cluster_manager_api.config.SQLITE_PATH", db_path),
    ):
        await db.init_db()
        yield db_path
        await db.close_db()
