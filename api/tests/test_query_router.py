"""Integration tests for the ``POST /query/{conn_id}`` router.

Service-level coverage of the query pipeline lives in
``test_query_service.py``. This module exists specifically to pin the
HTTP-boundary error mapping that callers depend on — in particular the
``PredicateError`` → 422 contract that diverges from the otherwise
generic ``ValueError`` → 400 mapping.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.main import app
from aerospike_cluster_manager_api.predicate import InvalidPredicateValue


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


class TestExecuteQueryPredicateErrorMapping:
    """``PredicateError`` must surface as 422, NOT the generic 400.

    ``PredicateError`` is a subclass of ``ValueError`` — the router must
    catch it BEFORE the generic ``ValueError`` branch or the more
    accurate 422 mapping silently degrades to 400. This test guards that
    ordering against future refactors.
    """

    async def test_predicate_error_returns_422_with_clear_detail(self, client: AsyncClient):
        mock_aerospike = AsyncMock()

        with (
            patch(
                "aerospike_cluster_manager_api.dependencies.db.get_connection",
                AsyncMock(return_value={"id": "conn-test"}),
            ),
            patch(
                "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
                AsyncMock(return_value=mock_aerospike),
            ),
            patch(
                "aerospike_cluster_manager_api.routers.query.query_service.execute_query",
                AsyncMock(
                    side_effect=InvalidPredicateValue("predicate operator 'between' requires both 'value' and 'value2'")
                ),
            ),
        ):
            response = await client.post(
                "/api/v1/query/conn-test",
                json={
                    "namespace": "test",
                    "set": "demo",
                    "predicate": {
                        "bin": "age",
                        "operator": "between",
                        "value": 1,
                        # value2 omitted on purpose — the (mocked) service
                        # surfaces InvalidPredicateValue exactly as the
                        # real build_predicate would.
                    },
                },
            )

        assert response.status_code == 422, response.text
        body = response.json()
        # FastAPI wraps HTTPException(detail=...) in {"detail": ...}; the
        # message must mention the underlying predicate problem so callers
        # get an actionable error rather than a bare "Unprocessable Entity".
        assert "predicate" in body["detail"].lower()
        assert "value2" in body["detail"]
