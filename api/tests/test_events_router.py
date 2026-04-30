"""Integration tests for the SSE events router."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.events.broker import broker


@pytest.fixture(autouse=True)
async def _reset_broker():
    """Ensure broker has no leftover subscribers between tests."""
    yield
    for sub_id in list(broker._subscribers.keys()):
        await broker.unsubscribe(sub_id)


@pytest.fixture()
async def client(init_test_db):
    """Create a test client with SSE enabled."""
    with (
        patch("aerospike_cluster_manager_api.config.SSE_ENABLED", True),
        patch("aerospike_cluster_manager_api.routers.events.config.SSE_ENABLED", True),
        patch("aerospike_cluster_manager_api.events.collector.collector.start", return_value=None),
        patch("aerospike_cluster_manager_api.events.collector.collector.stop", return_value=None),
    ):
        from aerospike_cluster_manager_api.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


async def test_sse_disabled_returns_404(init_test_db) -> None:
    """When SSE_ENABLED is False, the endpoint returns 404."""
    with (
        patch("aerospike_cluster_manager_api.config.SSE_ENABLED", False),
        patch("aerospike_cluster_manager_api.routers.events.config.SSE_ENABLED", False),
        patch("aerospike_cluster_manager_api.events.collector.collector.start", return_value=None),
        patch("aerospike_cluster_manager_api.events.collector.collector.stop", return_value=None),
    ):
        from aerospike_cluster_manager_api.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/v1/events/stream")
            assert resp.status_code == 404
            assert resp.json()["detail"] == "SSE streaming is disabled"


async def test_sse_max_connections_returns_429(client: AsyncClient) -> None:
    """When max connections is reached, new connections get 429."""
    with patch.object(broker, "_max_connections", 0):
        resp = await client.get("/api/v1/events/stream")
        assert resp.status_code == 429
        assert "Too many" in resp.json()["detail"]
