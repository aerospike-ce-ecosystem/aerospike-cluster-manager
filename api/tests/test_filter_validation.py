"""Regression tests for filter/query validation hardening (2026-05-30).

Covers the 500→4xx hardening for the filtered-record scan and idempotent
index delete:

- Malformed filter condition (binType=integer with a non-numeric value) used to
  500 — ``_val_accessor`` calls ``int("abc")`` deep in ``build_expression`` and
  the resulting ``ValueError`` escaped to the generic 500 handler. Now mapped to
  HTTP 400 by ``get_filtered_records``.
- BETWEEN operator missing ``value2`` used to 500 via ``int(None)`` (TypeError).
  Now rejected at the Pydantic layer (422) by ``FilterCondition`` and, for any
  programmatic build path, mapped to 400 by the router handler.
- DELETE /indexes for a non-existent index used to 404 despite the docstring
  promising idempotency. Now returns 204, matching ``delete_record``.

Mirrors the fixture/mocking style of ``test_api_500_regressions.py``.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from aerospike_py.exception import IndexNotFound
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.main import app


@asynccontextmanager
async def _noop_lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


@pytest.fixture()
async def http_client():
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = _noop_lifespan
    app.state.limiter.enabled = False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.state.limiter.enabled = True
    app.router.lifespan_context = original_lifespan


def _patch_client(mock_client):
    """Patch dependency resolution so router code receives *mock_client*."""
    return (
        patch(
            "aerospike_cluster_manager_api.dependencies.db.get_connection",
            AsyncMock(return_value={"id": "conn-test"}),
        ),
        patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            AsyncMock(return_value=mock_client),
        ),
    )


# ---------------------------------------------------------------------------
# Finding 1+3 — malformed filter condition → 400 (not 500)
# ---------------------------------------------------------------------------


class TestFilterValueCoercion:
    async def test_integer_bin_with_non_numeric_value_returns_400(self, http_client: AsyncClient):
        """binType=integer with value="abc" makes build_expression call
        int("abc") → ValueError. The router must map that to 400, not 500."""
        mock_client = AsyncMock()

        db_patch, client_patch = _patch_client(mock_client)
        with db_patch, client_patch:
            response = await http_client.post(
                "/api/v1/records/conn-test/filter",
                json={
                    "namespace": "test",
                    "set": "demo",
                    "filters": {
                        "logic": "and",
                        "conditions": [
                            {"bin": "score", "operator": "eq", "binType": "integer", "value": "abc"},
                        ],
                    },
                },
            )

        assert response.status_code == 400, response.text
        # client.query must never have been reached — the bad value is caught
        # while building the expression.
        mock_client.query.assert_not_called()


# ---------------------------------------------------------------------------
# Finding 2 — BETWEEN missing value2 → 422/400 (not 500 via int(None))
# ---------------------------------------------------------------------------


class TestBetweenMissingValue2:
    async def test_between_without_value2_is_rejected(self, http_client: AsyncClient):
        """BETWEEN with no value2 previously crashed on int(None). It must be
        rejected as a validation error (422 from the Pydantic model) or 400."""
        mock_client = AsyncMock()

        db_patch, client_patch = _patch_client(mock_client)
        with db_patch, client_patch:
            response = await http_client.post(
                "/api/v1/records/conn-test/filter",
                json={
                    "namespace": "test",
                    "set": "demo",
                    "filters": {
                        "logic": "and",
                        "conditions": [
                            {"bin": "score", "operator": "between", "binType": "integer", "value": 1},
                        ],
                    },
                },
            )

        assert response.status_code in (400, 422), response.text
        mock_client.query.assert_not_called()


# ---------------------------------------------------------------------------
# Finding 4 — DELETE /indexes is idempotent → 204 when index is absent
# ---------------------------------------------------------------------------


class TestDeleteIndexIdempotent:
    async def test_delete_nonexistent_index_returns_204(self, http_client: AsyncClient):
        """IndexNotFound must be swallowed and return 204, matching the
        docstring promise and ``delete_record`` behaviour."""
        mock_client = AsyncMock()
        mock_client.index_remove = AsyncMock(side_effect=IndexNotFound("no such index"))

        db_patch, client_patch = _patch_client(mock_client)
        with db_patch, client_patch:
            response = await http_client.delete(
                "/api/v1/indexes/conn-test",
                params={"name": "ghost_idx", "ns": "test"},
            )

        assert response.status_code == 204, response.text
        assert response.text == ""
