"""Integration tests for ``POST /clusters/{conn_id}/namespaces``.

Drives the FastAPI surface end-to-end (httpx ASGITransport) so the HTTP
status codes of the partial-update contract are pinned at the boundary
callers actually see: 400 for a body that names no parameter, 422 for an
unknown field, 200 for a partial update. The matching service-layer unit
tests for command construction live in ``test_clusters_service.py``.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.main import app
from aerospike_cluster_manager_api.services.info_cache import info_cache


def _make_mock_client() -> AsyncMock:
    """Mock AsyncClient whose ``info_random_node`` answers both round-trips.

    ``configure_namespace`` calls it twice — first the ``namespaces``
    existence check (``"test"``), then the ``set-config`` call (``"ok"``).
    """
    mock = AsyncMock()
    mock.get_node_names = Mock(return_value=["BB9020011AC4202"])
    mock.is_connected.return_value = True
    mock.info_random_node = AsyncMock(side_effect=["test", "ok"])
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
async def _clear_cache():
    await info_cache.clear()
    yield
    await info_cache.clear()


class TestConfigureNamespacePartialUpdate:
    @pytest.mark.asyncio
    async def test_name_only_body_is_rejected_400(self, client: AsyncClient, sample_connection):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/namespaces",
                json={"name": "test"},
            )

        assert resp.status_code == 400, resp.text
        detail = resp.json()["detail"]
        # The message must name what IS settable so the caller can fix the body.
        assert "memorySize" in detail
        assert "replicationFactor" in detail
        # Nothing reached the cluster.
        assert mock_as_client.info_random_node.await_count == 0

    @pytest.mark.asyncio
    async def test_unknown_field_is_rejected_422(self, client: AsyncClient, sample_connection):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/namespaces",
                # snake_case misspelling of memorySize — previously dropped
                # silently, which then applied the model default instead.
                json={"name": "test", "memory_size": 8_000_000_000},
            )

        assert resp.status_code == 422, resp.text
        assert mock_as_client.info_random_node.await_count == 0

    @pytest.mark.asyncio
    async def test_single_parameter_body_applies_only_that_parameter(self, client: AsyncClient, sample_connection):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/namespaces",
                json={"name": "test", "memorySize": 8_000_000_000},
            )

        assert resp.status_code == 200, resp.text
        cmd = mock_as_client.info_random_node.await_args_list[1].args[0]
        assert cmd == "set-config:context=namespace;id=test;memory-size=8000000000"
