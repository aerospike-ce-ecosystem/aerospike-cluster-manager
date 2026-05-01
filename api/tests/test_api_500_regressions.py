"""Regression tests for the 500-error bugs filed 2026-05-01.

Covers:
- #257  POST /api/v1/sample-data — used to always 500 on partial index failure.
- #259  GET  /api/v1/records — used to 500 for namespaces whose underlying scan raised.
- #260  POST/DELETE /api/v1/indexes — used to 500 even when the operation succeeded.

Issue #258 (pkType=auto → 500) is already covered by the pre-existing pkType
plumbing on main (resolve_pk + get_with_pk_fallback + model fields), so it does
not need a new regression test in this batch.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aerospike_py.exception import AerospikeError, ClientError
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
# Issue #257 — sample-data must not 500 when index creation partially fails
# ---------------------------------------------------------------------------


class TestSampleDataPartialFailure:
    async def test_returns_201_and_reports_failed_indexes(self, http_client: AsyncClient):
        """Index creation that raises after the underlying create succeeded must
        not blow up the whole request — it should be reported in indexesFailed."""
        mock_client = AsyncMock()
        mock_client.put = AsyncMock(return_value=None)
        # Most index creates succeed; the geo2dsphere one raises a generic
        # AerospikeError mid-wait (mirroring the real-world task.wait_till_complete bug).
        mock_client.index_integer_create = AsyncMock(return_value=None)
        mock_client.index_string_create = AsyncMock(return_value=None)
        mock_client.index_geo2dsphere_create = AsyncMock(side_effect=ClientError("post-create wait failed"))

        db_patch, client_patch = _patch_client(mock_client)
        with db_patch, client_patch:
            response = await http_client.post(
                "/api/v1/sample-data/conn-test",
                json={"namespace": "test", "setName": "qa_smoke", "recordCount": 3},
            )

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["recordsCreated"] == 3
        assert body["recordsFailed"] == 0
        assert len(body["indexesCreated"]) == 4  # 3 numeric + 1 string
        assert len(body["indexesFailed"]) == 1  # the geo2dsphere one
        assert any("geojson" in name for name in body["indexesFailed"])

    async def test_record_write_failure_is_isolated(self, http_client: AsyncClient):
        """A single failing put must not abort the whole batch."""
        call_count = {"n": 0}

        async def flaky_put(*_args, **_kwargs):
            call_count["n"] += 1
            if call_count["n"] == 2:
                raise ClientError("transient")
            return None

        mock_client = AsyncMock()
        mock_client.put = flaky_put
        mock_client.index_integer_create = AsyncMock(return_value=None)
        mock_client.index_string_create = AsyncMock(return_value=None)
        mock_client.index_geo2dsphere_create = AsyncMock(return_value=None)

        db_patch, client_patch = _patch_client(mock_client)
        with db_patch, client_patch:
            response = await http_client.post(
                "/api/v1/sample-data/conn-test",
                json={
                    "namespace": "test",
                    "setName": "qa_smoke",
                    "recordCount": 5,
                    "createIndexes": False,
                },
            )

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["recordsCreated"] == 4
        assert body["recordsFailed"] == 1


# ---------------------------------------------------------------------------
# Issue #259 — GET /records must not 500 when underlying scan raises
# ---------------------------------------------------------------------------


class TestRecordsEmptyNamespace:
    async def test_returns_empty_page_when_query_raises(self, http_client: AsyncClient):
        mock_client = AsyncMock()
        mock_client.info_all = AsyncMock(return_value=[])  # empty set/ns metadata

        mock_query = MagicMock()
        mock_query.results = AsyncMock(side_effect=ClientError("underlying scan blew up"))
        mock_client.query = MagicMock(return_value=mock_query)

        db_patch, client_patch = _patch_client(mock_client)
        with db_patch, client_patch:
            response = await http_client.get(
                "/api/v1/records/conn-test",
                params={"ns": "empty_ns", "pageSize": 3},
            )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["records"] == []
        assert body["page"] == 1
        assert body["hasMore"] is False


# ---------------------------------------------------------------------------
# Issue #260 — POST/DELETE /indexes must reflect actual state, not raise
# ---------------------------------------------------------------------------


class TestIndexesIdempotency:
    async def test_create_returns_201_when_post_create_wait_raises_but_index_exists(
        self,
        http_client: AsyncClient,
    ):
        mock_client = AsyncMock()
        # The aerospike-py call raises (e.g. task.wait_till_complete failed)
        mock_client.index_integer_create = AsyncMock(side_effect=ClientError("wait_till_complete blew up"))
        # ...but the index actually exists per the sindex info command.
        mock_client.info_random_node = AsyncMock(
            return_value="ns=test:indexname=qa_idx:set=demo:bin=score:type=numeric"
        )

        db_patch, client_patch = _patch_client(mock_client)
        with db_patch, client_patch:
            response = await http_client.post(
                "/api/v1/indexes/conn-test",
                json={
                    "namespace": "test",
                    "set": "demo",
                    "bin": "score",
                    "name": "qa_idx",
                    "type": "numeric",
                },
            )

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["name"] == "qa_idx"
        assert body["state"] == "building"

    async def test_create_propagates_when_index_does_not_exist(self, http_client: AsyncClient):
        """If the create raised AND the verify confirms absence, propagate as 500."""
        mock_client = AsyncMock()
        mock_client.index_integer_create = AsyncMock(side_effect=ClientError("real failure"))
        mock_client.info_random_node = AsyncMock(return_value="")  # no indexes reported

        db_patch, client_patch = _patch_client(mock_client)
        with db_patch, client_patch:
            response = await http_client.post(
                "/api/v1/indexes/conn-test",
                json={
                    "namespace": "test",
                    "set": "demo",
                    "bin": "score",
                    "name": "qa_idx",
                    "type": "numeric",
                },
            )

        assert response.status_code == 500
        body = response.json()
        # The improved 500 handler now surfaces requestId + error message.
        assert "requestId" in body
        assert "real failure" in body.get("error", "")

    async def test_delete_returns_204_when_drop_raises_but_index_already_gone(
        self,
        http_client: AsyncClient,
    ):
        mock_client = AsyncMock()
        mock_client.index_remove = AsyncMock(side_effect=ClientError("drop wait blew up"))
        mock_client.info_random_node = AsyncMock(return_value="")  # no indexes — already gone

        db_patch, client_patch = _patch_client(mock_client)
        with db_patch, client_patch:
            response = await http_client.delete(
                "/api/v1/indexes/conn-test",
                params={"name": "qa_idx", "ns": "test"},
            )

        assert response.status_code == 204
        assert response.text == ""

    async def test_delete_propagates_when_index_still_exists(self, http_client: AsyncClient):
        mock_client = AsyncMock()
        mock_client.index_remove = AsyncMock(side_effect=ClientError("actual drop failure"))
        mock_client.info_random_node = AsyncMock(
            return_value="ns=test:indexname=qa_idx:set=demo:bin=score:type=numeric"
        )

        db_patch, client_patch = _patch_client(mock_client)
        with db_patch, client_patch:
            response = await http_client.delete(
                "/api/v1/indexes/conn-test",
                params={"name": "qa_idx", "ns": "test"},
            )

        assert response.status_code == 500


# ---------------------------------------------------------------------------
# 500 handler — common ask in #257/#260: include requestId + error in body
# ---------------------------------------------------------------------------


class TestInternalErrorBody:
    async def test_500_body_includes_request_id_and_error_message(self, http_client: AsyncClient):
        mock_client = AsyncMock()
        mock_client.index_integer_create = AsyncMock(side_effect=AerospikeError("boom"))
        mock_client.info_random_node = AsyncMock(return_value="")

        db_patch, client_patch = _patch_client(mock_client)
        with db_patch, client_patch:
            response = await http_client.post(
                "/api/v1/indexes/conn-test",
                # 32-char alphanumeric — TraceIDMiddleware accepts this as-is.
                headers={"X-Request-ID": "abcd1234abcd1234abcd1234abcd1234"},
                json={"namespace": "test", "set": "demo", "bin": "x", "name": "i", "type": "numeric"},
            )

        assert response.status_code == 500
        body = response.json()
        assert body["detail"] == "An internal server error occurred"
        assert body["requestId"] == "abcd1234abcd1234abcd1234abcd1234"
        assert body["error"] == "boom"
        assert response.headers.get("X-Request-ID") == "abcd1234abcd1234abcd1234abcd1234"
