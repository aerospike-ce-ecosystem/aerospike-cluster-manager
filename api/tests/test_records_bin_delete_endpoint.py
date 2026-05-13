"""Tests for the DELETE /records/{conn_id}/{ns}/{set}/{pk}/bins/{bin_name} endpoint.

Mirrors :func:`mcp.tools.records.delete_bin` so ackoctl reaches MCP
parity through the REST surface.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from aerospike_py.exception import RecordNotFound
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


class TestDeleteBinHappyPath:
    async def test_returns_204_on_success(self, client: AsyncClient):
        mock_client = AsyncMock()
        mock_client.remove_bin = AsyncMock(return_value=None)

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
            response = await client.delete(
                "/api/records/conn-test/test/demo/user_42/bins/name",
            )

        assert response.status_code == 204
        # Body is empty for 204; service call took the auto pk-type heuristic
        # (string for "user_42") so the resolved key tuple is the raw string.
        mock_client.remove_bin.assert_awaited_once()
        call = mock_client.remove_bin.await_args
        assert call.args[0] == ("test", "demo", "user_42")
        assert call.args[1] == ["name"]

    async def test_v1_route_works(self, client: AsyncClient):
        mock_client = AsyncMock()
        mock_client.remove_bin = AsyncMock(return_value=None)

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
            response = await client.delete(
                "/api/v1/records/conn-test/test/demo/user_42/bins/name",
            )

        assert response.status_code == 204

    async def test_explicit_pk_type_int(self, client: AsyncClient):
        """Explicit ``pk_type=int`` parses the path pk as an integer."""
        mock_client = AsyncMock()
        mock_client.remove_bin = AsyncMock(return_value=None)

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
            response = await client.delete(
                "/api/records/conn-test/test/demo/42/bins/age",
                params={"pk_type": "int"},
            )

        assert response.status_code == 204
        call = mock_client.remove_bin.await_args
        assert call.args[0] == ("test", "demo", 42)


class TestDeleteBinErrors:
    async def test_returns_404_when_record_missing(self, client: AsyncClient):
        mock_client = AsyncMock()
        mock_client.remove_bin = AsyncMock(side_effect=RecordNotFound("not found"))

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
            response = await client.delete(
                "/api/records/conn-test/test/demo/missing/bins/name",
            )

        assert response.status_code == 404
        body = response.json()
        assert "missing" in body["detail"]

    async def test_returns_404_when_conn_missing(self, client: AsyncClient):
        """VerifiedConnId gate: unknown connection ID surfaces as 404 before
        the service layer runs."""
        with patch(
            "aerospike_cluster_manager_api.dependencies.db.get_connection",
            AsyncMock(return_value=None),
        ):
            response = await client.delete(
                "/api/records/conn-missing/test/demo/user_42/bins/name",
            )

        assert response.status_code == 404
        assert "conn-missing" in response.json()["detail"]

    async def test_invalid_pk_type_returns_422(self, client: AsyncClient):
        """``pk_type`` is a Literal -- unrecognised values are rejected at
        request validation."""
        mock_client = AsyncMock()

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
            response = await client.delete(
                "/api/records/conn-test/test/demo/user_42/bins/name",
                params={"pk_type": "garbage"},
            )

        assert response.status_code == 422
