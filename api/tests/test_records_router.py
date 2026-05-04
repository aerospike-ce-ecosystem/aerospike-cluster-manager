"""Integration tests for the records router."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aerospike_py import exp
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.constants import POLICY_READ
from aerospike_cluster_manager_api.expression_builder import build_pk_filter_expression
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

    async def test_rust_panic_returns_422(self, client: AsyncClient):
        """aerospike-py #280: a record with a particle type the native client
        cannot decode (e.g. PYTHON_BLOB / JAVA_BLOB legacy data) surfaces as
        ``RustPanicError``. The global handler maps it to HTTP 422 so the UI
        can show a "this record needs a legacy client" hint instead of crashing
        the page."""
        from aerospike_py.exception import RustPanicError

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=RustPanicError("Rust panic in `AsyncClient.get`: unreachable code"))

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
                params={"ns": "test", "set": "demo", "pk": "legacy_blob"},
            )

        assert response.status_code == 422
        body = response.json()
        assert body["error_kind"] == "rust_panic"
        assert "particle type" in body["detail"]


def _build_query_mock(records: list[SimpleNamespace] | None = None) -> AsyncMock:
    """Build an AsyncMock client whose .query(...) returns a query object whose
    .results(policy) records the policy and resolves to the given records."""
    query_obj = MagicMock()
    query_obj.results = AsyncMock(return_value=records or [])
    query_obj.where = MagicMock()
    query_obj.select = MagicMock()
    mock_client = AsyncMock()
    mock_client.query = MagicMock(return_value=query_obj)
    mock_client.info_all = AsyncMock(return_value={})
    return mock_client


class TestFilteredRecordsPkMatchMode:
    """Coverage for issue #287: PK exact / prefix / regex match modes on the
    POST /api/records/{conn_id}/filter endpoint."""

    async def test_exact_mode_uses_pk_short_circuit(self, client: AsyncClient):
        mock_client = _build_query_mock()
        mock_client.get = AsyncMock(
            return_value=SimpleNamespace(
                key=("test", "demo", "k1", b"\x00"),
                meta={"gen": 1, "ttl": 0},
                bins={"a": 1},
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
            resp = await client.post(
                "/api/records/conn-test/filter",
                json={
                    "namespace": "test",
                    "set": "demo",
                    "pkPattern": "k1",
                    "pkMatchMode": "exact",
                },
            )

        assert resp.status_code == 200
        # Short-circuit: client.get is called, scan path is NOT taken.
        # Assert the resolved key is plumbed through correctly.
        mock_client.get.assert_awaited_once_with(
            ("test", "demo", "k1"),
            policy=POLICY_READ,
        )
        mock_client.query.assert_not_called()

    async def test_prefix_mode_runs_scan_with_pk_filter_expression(self, client: AsyncClient):
        mock_client = _build_query_mock()

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
            resp = await client.post(
                "/api/records/conn-test/filter",
                json={
                    "namespace": "test",
                    "set": "demo",
                    "pkPattern": "user_",
                    "pkMatchMode": "prefix",
                },
            )

        assert resp.status_code == 200
        # Scan path was taken.
        mock_client.query.assert_called_once_with("test", "demo")
        # The policy passed to .results contains a filter_expression matching
        # the PK regex helper output.
        call_args = mock_client.query.return_value.results.await_args
        assert call_args is not None
        policy = call_args.args[0]
        assert "filter_expression" in policy
        assert policy["filter_expression"] == build_pk_filter_expression("user_", "prefix")

    async def test_regex_mode_combines_with_bin_filters_via_and(self, client: AsyncClient):
        mock_client = _build_query_mock()

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
            resp = await client.post(
                "/api/records/conn-test/filter",
                json={
                    "namespace": "test",
                    "set": "demo",
                    "pkPattern": "^acct[0-9]+$",
                    "pkMatchMode": "regex",
                    "filters": {
                        "logic": "and",
                        "conditions": [
                            {
                                "bin": "score",
                                "operator": "gt",
                                "value": 100,
                                "binType": "integer",
                            }
                        ],
                    },
                },
            )

        assert resp.status_code == 200
        call_args = mock_client.query.return_value.results.await_args
        assert call_args is not None
        policy = call_args.args[0]
        pk_part = build_pk_filter_expression("^acct[0-9]+$", "regex")
        bin_part = exp.gt(exp.int_bin("score"), exp.int_val(100))
        assert policy["filter_expression"] == exp.and_(pk_part, bin_part)

    async def test_legacy_primary_key_field_still_works(self, client: AsyncClient):
        """Backward compatibility: callers that send the legacy `primaryKey`
        field without `pkMatchMode` must still get exact-match short-circuit."""
        mock_client = _build_query_mock()
        mock_client.get = AsyncMock(
            return_value=SimpleNamespace(
                key=("test", "demo", "legacy", b"\x00"),
                meta={"gen": 1, "ttl": 0},
                bins={},
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
            resp = await client.post(
                "/api/records/conn-test/filter",
                json={
                    "namespace": "test",
                    "set": "demo",
                    "primaryKey": "legacy",
                },
            )

        assert resp.status_code == 200
        mock_client.get.assert_awaited_once()
        mock_client.query.assert_not_called()

    async def test_invalid_regex_returns_400(self, client: AsyncClient):
        """C1: a malformed user pattern surfaces as 400, not silent empty page."""
        mock_client = _build_query_mock()

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
            resp = await client.post(
                "/api/records/conn-test/filter",
                json={
                    "namespace": "test",
                    "set": "demo",
                    "pkPattern": "[unclosed",
                    "pkMatchMode": "regex",
                },
            )

        assert resp.status_code == 400
        assert "Invalid regex pattern" in resp.json()["detail"]
        # Critical: the scan never executes when validation fails.
        mock_client.query.assert_not_called()

    async def test_prefix_or_regex_mode_with_no_pattern_returns_422(self, client: AsyncClient):
        """C2: empty pk_pattern with non-exact mode rejected at request level."""
        mock_client = _build_query_mock()

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
            resp = await client.post(
                "/api/records/conn-test/filter",
                json={
                    "namespace": "test",
                    "set": "demo",
                    "pkMatchMode": "prefix",
                    # no pkPattern
                },
            )

        assert resp.status_code == 422
        mock_client.query.assert_not_called()

    async def test_pk_prefix_without_set_returns_400(self, client: AsyncClient):
        """C3: set is required for any PK-targeted query, not only exact mode."""
        mock_client = _build_query_mock()

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
            resp = await client.post(
                "/api/records/conn-test/filter",
                json={
                    "namespace": "test",
                    "pkPattern": "user_",
                    "pkMatchMode": "prefix",
                },
            )

        assert resp.status_code == 400
        assert "Set is required" in resp.json()["detail"]
        mock_client.query.assert_not_called()

    async def test_exact_mode_without_pk_falls_through_to_scan_path(self, client: AsyncClient):
        """Pure bin-filter request (default pkMatchMode=exact, no pkPattern)
        must skip both PK branches and run the regular scan."""
        mock_client = _build_query_mock()

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
            resp = await client.post(
                "/api/records/conn-test/filter",
                json={
                    "namespace": "test",
                    "set": "demo",
                    "filters": {
                        "logic": "and",
                        "conditions": [
                            {"bin": "score", "operator": "gt", "value": 1, "binType": "integer"},
                        ],
                    },
                },
            )

        assert resp.status_code == 200
        mock_client.get.assert_not_called()
        mock_client.query.assert_called_once_with("test", "demo")
        policy = mock_client.query.return_value.results.await_args.args[0]
        # Only the bin filter, no PK component.
        assert policy["filter_expression"] == exp.gt(exp.int_bin("score"), exp.int_val(1))

    async def test_prefix_mode_hasMore_true_when_results_equal_pageSize_plus_one(self, client: AsyncClient):
        """The scan path fetches pageSize+1 records and trims to pageSize so
        hasMore is reliable. Pin this for the new PK prefix path."""
        # 6 records returned for pageSize=5 → hasMore=True, returned=5.
        records = [
            SimpleNamespace(
                key=("test", "demo", f"k{i}", b"\x00"),
                meta={"gen": 1, "ttl": 0},
                bins={"score": i},
            )
            for i in range(6)
        ]
        mock_client = _build_query_mock(records)

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
            resp = await client.post(
                "/api/records/conn-test/filter",
                json={
                    "namespace": "test",
                    "set": "demo",
                    "pkPattern": "k",
                    "pkMatchMode": "prefix",
                    "pageSize": 5,
                },
            )

        body = resp.json()
        assert resp.status_code == 200
        assert body["hasMore"] is True
        assert body["returnedRecords"] == 5
        assert len(body["records"]) == 5
