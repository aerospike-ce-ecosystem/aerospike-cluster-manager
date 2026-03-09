"""Integration tests for the records router."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.constants import POLICY_READ
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


class TestGetRecordDetail:
    async def test_returns_single_record(self, client: AsyncClient):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            return_value=SimpleNamespace(
                key=("test", "demo", 42, bytes.fromhex("abcd")),
                meta={"gen": 7, "ttl": 3600},
                bins={"name": "Alice", "age": 30},
            )
        )

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
            response = await client.get(
                "/api/records/conn-test/detail",
                params={"ns": "test", "set": "demo", "pk": "42"},
            )

        assert response.status_code == 200
        assert response.json() == {
            "key": {
                "namespace": "test",
                "set": "demo",
                "pk": "42",
                "digest": "abcd",
            },
            "meta": {
                "generation": 7,
                "ttl": 3600,
                "lastUpdateMs": None,
            },
            "bins": {
                "name": "Alice",
                "age": 30,
            },
        }
        mock_client.get.assert_awaited_once_with(("test", "demo", 42), policy=POLICY_READ)

    async def test_returns_404_for_missing_record(self, client: AsyncClient):
        from aerospike_py.exception import RecordNotFound

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=RecordNotFound("not found"))

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
            response = await client.get(
                "/api/records/conn-test/detail",
                params={"ns": "test", "set": "demo", "pk": "missing"},
            )

        assert response.status_code == 404
        assert response.json() == {"detail": "Record not found"}
