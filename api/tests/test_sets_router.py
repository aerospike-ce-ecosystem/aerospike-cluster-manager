"""Tests for the POST /sets/{conn_id}/{ns}/{set_name}/truncate endpoint.

ackoctl drives set truncation through this REST surface.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.main import app


@asynccontextmanager
async def _noop_lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


@pytest.fixture()
async def client():
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = _noop_lifespan

    app.state.limiter.enabled = False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.state.limiter.enabled = True
    app.router.lifespan_context = original_lifespan


class TestTruncateSetHappyPath:
    async def test_returns_200_with_message_when_body_omitted(self, client: AsyncClient):
        """No body means ``before_lut=None`` -- full truncate."""
        mock_client = AsyncMock()
        mock_client.truncate = AsyncMock(return_value=None)

        with (
            patch(
                "aerospike_cluster_manager_api.dependencies.db.get_connection",
                AsyncMock(return_value={"id": "conn-test"}),
            ),
            patch(
                "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
                AsyncMock(return_value=mock_client),
            ),
        ):
            response = await client.post(
                "/api/sets/conn-test/test/demo/truncate",
            )

        assert response.status_code == 200
        body = response.json()
        assert "truncated" in body["message"].lower()
        # Service forwards ``nanos=0`` when before_lut is None (truncate-all).
        mock_client.truncate.assert_awaited_once_with("test", "demo", 0)

    async def test_returns_200_with_explicit_null_before_lut(self, client: AsyncClient):
        """``beforeLut: null`` in body must behave like omitted body."""
        mock_client = AsyncMock()
        mock_client.truncate = AsyncMock(return_value=None)

        with (
            patch(
                "aerospike_cluster_manager_api.dependencies.db.get_connection",
                AsyncMock(return_value={"id": "conn-test"}),
            ),
            patch(
                "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
                AsyncMock(return_value=mock_client),
            ),
        ):
            response = await client.post(
                "/api/sets/conn-test/test/demo/truncate",
                json={"beforeLut": None},
            )

        assert response.status_code == 200
        mock_client.truncate.assert_awaited_once_with("test", "demo", 0)

    async def test_before_lut_is_forwarded_when_supplied(self, client: AsyncClient):
        mock_client = AsyncMock()
        mock_client.truncate = AsyncMock(return_value=None)

        with (
            patch(
                "aerospike_cluster_manager_api.dependencies.db.get_connection",
                AsyncMock(return_value={"id": "conn-test"}),
            ),
            patch(
                "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
                AsyncMock(return_value=mock_client),
            ),
        ):
            response = await client.post(
                "/api/sets/conn-test/test/demo/truncate",
                json={"beforeLut": 1_700_000_000_000_000_000},
            )

        assert response.status_code == 200
        body = response.json()
        assert "1700000000000000000" in body["message"]
        mock_client.truncate.assert_awaited_once_with("test", "demo", 1_700_000_000_000_000_000)

    async def test_v1_route_works(self, client: AsyncClient):
        mock_client = AsyncMock()
        mock_client.truncate = AsyncMock(return_value=None)

        with (
            patch(
                "aerospike_cluster_manager_api.dependencies.db.get_connection",
                AsyncMock(return_value={"id": "conn-test"}),
            ),
            patch(
                "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
                AsyncMock(return_value=mock_client),
            ),
        ):
            response = await client.post(
                "/api/v1/sets/conn-test/test/demo/truncate",
            )

        assert response.status_code == 200


class TestTruncateSetErrors:
    async def test_returns_400_on_non_positive_before_lut(self, client: AsyncClient):
        """Service layer rejects ``before_lut=0`` (collision with truncate-all)
        and ``before_lut<0``. Surface as 400 so the caller can fix the request."""
        mock_client = AsyncMock()
        mock_client.truncate = AsyncMock(return_value=None)

        with (
            patch(
                "aerospike_cluster_manager_api.dependencies.db.get_connection",
                AsyncMock(return_value={"id": "conn-test"}),
            ),
            patch(
                "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
                AsyncMock(return_value=mock_client),
            ),
        ):
            response = await client.post(
                "/api/sets/conn-test/test/demo/truncate",
                json={"beforeLut": 0},
            )

        assert response.status_code == 400
        # Service never reached -- the wrong cutoff would otherwise silently
        # become a truncate-all.
        mock_client.truncate.assert_not_awaited()

    async def test_returns_404_when_conn_missing(self, client: AsyncClient):
        """VerifiedConnId gate runs first -- unknown connection surfaces as 404
        before the destructive truncate fires."""
        with patch(
            "aerospike_cluster_manager_api.dependencies.db.get_connection",
            AsyncMock(return_value=None),
        ):
            response = await client.post(
                "/api/sets/conn-missing/test/demo/truncate",
            )

        assert response.status_code == 404
        assert "conn-missing" in response.json()["detail"]
