"""Tests for parallelized cluster info retrieval in routers/clusters.py."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.main import app
from aerospike_cluster_manager_api.services.info_cache import info_cache


def _info_all_result(name: str, resp: str) -> tuple[str, int | None, str]:
    return (name, None, resp)


def _make_mock_client() -> AsyncMock:
    """Build a mock AsyncClient that returns realistic Aerospike info data."""
    mock = AsyncMock()
    mock.get_node_names.return_value = ["node1", "node2"]
    mock.is_connected.return_value = True

    node_stats = (
        "cluster_size=2;uptime=3600;client_connections=10;"
        "stat_read_reqs=1000;stat_write_reqs=500"
    )

    ns_stats = (
        "objects=200;tombstones=0;memory_used_bytes=1024;"
        "memory-size=4096;device_used_bytes=0;device-total-bytes=0;"
        "replication-factor=2;stop_writes=false;hwm_breached=false;"
        "high-water-memory-pct=60;high-water-disk-pct=50;"
        "nsup-period=120;default-ttl=0;allow-ttl-without-nsup=false;"
        "client_read_success=900;client_read_error=100;"
        "client_write_success=450;client_write_error=50"
    )

    def info_all_side_effect(cmd: str):
        if cmd == "statistics":
            return [
                _info_all_result("node1", node_stats),
                _info_all_result("node2", node_stats),
            ]
        if cmd == "build":
            return [
                _info_all_result("node1", "6.4.0"),
                _info_all_result("node2", "6.4.0"),
            ]
        if cmd == "edition":
            return [
                _info_all_result("node1", "Community"),
                _info_all_result("node2", "Community"),
            ]
        if cmd == "service":
            return [
                _info_all_result("node1", "10.0.0.1:3000"),
                _info_all_result("node2", "10.0.0.2:3000"),
            ]
        if cmd.startswith("namespace/"):
            return [
                _info_all_result("node1", ns_stats),
                _info_all_result("node2", ns_stats),
            ]
        if cmd.startswith("sets/"):
            return [
                _info_all_result("node1", "set=myset:objects=100:tombstones=0:memory_data_bytes=500:stop-writes-count=0"),
                _info_all_result("node2", "set=myset:objects=100:tombstones=0:memory_data_bytes=500:stop-writes-count=0"),
            ]
        return []

    mock.info_all.side_effect = info_all_side_effect
    mock.info_random_node.return_value = "test"

    return mock


@asynccontextmanager
async def _noop_lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


@pytest.fixture()
async def client(init_test_db):
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = _noop_lifespan
    app.state.limiter.enabled = False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.state.limiter.enabled = True
    app.router.lifespan_context = original_lifespan


@pytest.fixture(autouse=True)
def _clear_cache():
    """Ensure the info cache is clean for each test."""
    info_cache.clear()
    yield
    info_cache.clear()


class TestGetClusterParallel:
    @pytest.mark.asyncio
    async def test_cluster_endpoint_returns_nodes_and_namespaces(self, client: AsyncClient, sample_connection):
        """Cluster endpoint should return valid data using parallelized calls."""
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)

        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.get(f"/api/clusters/{sample_connection.id}")

        assert resp.status_code == 200
        data = resp.json()
        assert data["connectionId"] == sample_connection.id
        assert len(data["nodes"]) == 2
        assert data["nodes"][0]["build"] == "6.4.0"
        assert data["nodes"][0]["edition"] == "Community"
        assert len(data["namespaces"]) == 1
        assert data["namespaces"][0]["name"] == "test"

    @pytest.mark.asyncio
    async def test_cluster_endpoint_calls_info_all_in_batch(self, client: AsyncClient, sample_connection):
        """Verify that info_all is called for all Phase 1 commands."""
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)

        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.get(f"/api/clusters/{sample_connection.id}")

        assert resp.status_code == 200

        # Verify the expected info_all calls were made
        info_all_commands = [call.args[0] for call in mock_as_client.info_all.call_args_list]
        assert "statistics" in info_all_commands
        assert "service" in info_all_commands
        # namespace/test and sets/test from the namespace loop
        assert "namespace/test" in info_all_commands
        assert "sets/test" in info_all_commands

    @pytest.mark.asyncio
    async def test_empty_namespace_list(self, client: AsyncClient, sample_connection):
        """Cluster with no namespaces should return empty namespace list."""
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)

        mock_as_client = _make_mock_client()
        mock_as_client.info_random_node.return_value = ""  # No namespaces

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.get(f"/api/clusters/{sample_connection.id}")

        assert resp.status_code == 200
        data = resp.json()
        assert data["namespaces"] == []
        assert len(data["nodes"]) == 2
