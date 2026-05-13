"""Unit tests for the query service layer.

These tests exercise ``services.query_service`` directly — without going
through FastAPI — so the service contract stays stable independent of the
REST router. The router-layer regression net (when present) lives elsewhere.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from aerospike_py.exception import AerospikeError, RecordNotFound

from aerospike_cluster_manager_api.constants import MAX_QUERY_RECORDS, POLICY_QUERY, POLICY_READ
from aerospike_cluster_manager_api.models.query import QueryPredicate, QueryRequest
from aerospike_cluster_manager_api.services import query_service
from aerospike_cluster_manager_api.services.query_service import SetRequiredForPkLookup


def _make_record(key=("test", "demo", "k1", b"\x00"), meta=None, bins=None) -> SimpleNamespace:
    """Build a SimpleNamespace that mimics an aerospike-py Record NamedTuple."""
    return SimpleNamespace(
        key=key,
        meta=meta if meta is not None else SimpleNamespace(gen=1, ttl=0),
        bins=bins if bins is not None else {},
    )


def _build_query_mock(records: list[SimpleNamespace] | None = None) -> tuple[AsyncMock, MagicMock]:
    """Build an AsyncMock client whose .query(...) returns a query object whose
    .results(policy) records the policy and resolves to the given records."""
    query_obj = MagicMock()
    query_obj.results = AsyncMock(return_value=records or [])
    query_obj.where = MagicMock()
    query_obj.select = MagicMock()
    mock_client = AsyncMock()
    mock_client.query = MagicMock(return_value=query_obj)
    return mock_client, query_obj


# ---------------------------------------------------------------------------
# execute_query — PK lookup branch
# ---------------------------------------------------------------------------


class TestExecuteQueryPkLookup:
    async def test_pk_lookup_returns_single_record(self):
        client = AsyncMock()
        rec = _make_record(
            key=("test", "demo", 42, b"\xab\xcd"),
            meta=SimpleNamespace(gen=2, ttl=600),
            bins={"name": "Bob"},
        )
        client.get = AsyncMock(return_value=rec)

        body = QueryRequest(namespace="test", set="demo", primaryKey="42")
        result = await query_service.execute_query(client, body)

        assert len(result.records) == 1
        assert result.records[0] is rec
        assert result.scanned_records == 1
        assert result.returned_records == 1
        assert result.execution_time_ms >= 0
        # auto resolution: "42" -> int 42 in get
        client.get.assert_awaited_once_with(("test", "demo", 42), policy=POLICY_READ)
        # Scan path NOT taken
        client.query.assert_not_called()

    async def test_pk_lookup_string_pk_type_keeps_string(self):
        client = AsyncMock()
        client.get = AsyncMock(return_value=_make_record())

        body = QueryRequest(namespace="test", set="demo", primaryKey="42", pkType="string")
        await query_service.execute_query(client, body)

        client.get.assert_awaited_once_with(("test", "demo", "42"), policy=POLICY_READ)

    async def test_pk_lookup_record_not_found_returns_empty(self):
        client = AsyncMock()
        client.get = AsyncMock(side_effect=RecordNotFound("not found"))

        body = QueryRequest(namespace="test", set="demo", primaryKey="missing", pkType="string")
        result = await query_service.execute_query(client, body)

        assert result.records == []
        assert result.scanned_records == 0
        assert result.returned_records == 0

    async def test_pk_lookup_auto_falls_back_to_string_when_int_not_found(self):
        """auto mode: numeric-string PK like "42" first probes as INTEGER; on
        NOT_FOUND it retries as STRING. Mirrors get_with_pk_fallback behaviour."""
        client = AsyncMock()
        rec = _make_record(key=("test", "demo", "42", b"\x00"))
        client.get = AsyncMock(side_effect=[RecordNotFound("nope"), rec])

        body = QueryRequest(namespace="test", set="demo", primaryKey="42", pkType="auto")
        result = await query_service.execute_query(client, body)

        assert len(result.records) == 1
        assert result.records[0] is rec
        assert client.get.await_count == 2
        first_call = client.get.await_args_list[0]
        second_call = client.get.await_args_list[1]
        assert first_call.args[0] == ("test", "demo", 42)
        assert second_call.args[0] == ("test", "demo", "42")

    async def test_pk_lookup_without_set_raises_set_required(self):
        client = AsyncMock()
        body = QueryRequest(namespace="test", primaryKey="42")
        with pytest.raises(SetRequiredForPkLookup):
            await query_service.execute_query(client, body)


# ---------------------------------------------------------------------------
# execute_query — scan branch
# ---------------------------------------------------------------------------


class TestExecuteQueryScan:
    async def test_unfiltered_scan_returns_records(self):
        recs = [_make_record(key=("test", "demo", f"k{i}", b"\x00")) for i in range(3)]
        client, _query = _build_query_mock(recs)

        body = QueryRequest(namespace="test", set="demo")
        result = await query_service.execute_query(client, body)

        assert len(result.records) == 3
        assert result.scanned_records == 3
        assert result.returned_records == 3
        client.query.assert_called_once_with("test", "demo")

    async def test_scan_uses_empty_set_when_no_set_provided(self):
        client, _query = _build_query_mock()
        body = QueryRequest(namespace="test")
        await query_service.execute_query(client, body)

        client.query.assert_called_once_with("test", "")

    async def test_scan_failure_returns_empty_records(self):
        client, query = _build_query_mock()
        query.results = AsyncMock(side_effect=AerospikeError("empty namespace"))

        body = QueryRequest(namespace="test", set="demo")
        result = await query_service.execute_query(client, body)

        assert result.records == []
        assert result.scanned_records == 0
        assert result.returned_records == 0
        assert result.execution_time_ms >= 0

    async def test_scan_max_records_capped_at_global_max(self):
        client, query = _build_query_mock()
        body = QueryRequest(namespace="test", set="demo", maxRecords=999_999)
        await query_service.execute_query(client, body)

        call = query.results.await_args
        policy = call.args[0]
        assert policy["max_records"] == MAX_QUERY_RECORDS

    async def test_scan_max_records_uses_request_value_when_below_max(self):
        client, query = _build_query_mock()
        body = QueryRequest(namespace="test", set="demo", maxRecords=50)
        await query_service.execute_query(client, body)

        call = query.results.await_args
        policy = call.args[0]
        assert policy["max_records"] == 50

    async def test_scan_default_uses_global_max_when_no_max_records(self):
        client, query = _build_query_mock()
        body = QueryRequest(namespace="test", set="demo")
        await query_service.execute_query(client, body)

        call = query.results.await_args
        policy = call.args[0]
        assert policy["max_records"] == MAX_QUERY_RECORDS

    async def test_scan_uses_policy_query_base(self):
        client, query = _build_query_mock()
        body = QueryRequest(namespace="test", set="demo")
        await query_service.execute_query(client, body)

        call = query.results.await_args
        policy = call.args[0]
        for k, v in POLICY_QUERY.items():
            assert policy[k] == v

    async def test_scan_with_select_bins_calls_select(self):
        client, query = _build_query_mock()
        body = QueryRequest(namespace="test", set="demo", selectBins=["a", "b"])
        await query_service.execute_query(client, body)

        query.select.assert_called_once_with("a", "b")

    async def test_scan_without_select_bins_does_not_call_select(self):
        client, query = _build_query_mock()
        body = QueryRequest(namespace="test", set="demo")
        await query_service.execute_query(client, body)

        query.select.assert_not_called()

    async def test_scan_with_predicate_calls_where(self):
        client, query = _build_query_mock()
        body = QueryRequest(
            namespace="test",
            set="demo",
            predicate=QueryPredicate(bin="age", operator="equals", value=30),
        )
        await query_service.execute_query(client, body)

        query.where.assert_called_once()

    async def test_scan_without_predicate_does_not_call_where(self):
        client, query = _build_query_mock()
        body = QueryRequest(namespace="test", set="demo")
        await query_service.execute_query(client, body)

        query.where.assert_not_called()


# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------


class TestExecuteQueryResult:
    async def test_execution_time_is_non_negative_int(self):
        client, _query = _build_query_mock()
        body = QueryRequest(namespace="test", set="demo")
        result = await query_service.execute_query(client, body)

        assert isinstance(result.execution_time_ms, int)
        assert result.execution_time_ms >= 0

    async def test_returns_named_tuple_with_records_attribute(self):
        client, _query = _build_query_mock()
        body = QueryRequest(namespace="test", set="demo")
        result = await query_service.execute_query(client, body)

        # Should expose attribute access (NamedTuple style)
        assert hasattr(result, "records")
        assert hasattr(result, "execution_time_ms")
        assert hasattr(result, "scanned_records")
        assert hasattr(result, "returned_records")


# ---------------------------------------------------------------------------
# Domain exceptions
# ---------------------------------------------------------------------------


class TestDomainExceptions:
    def test_set_required_for_pk_lookup_is_value_error(self):
        exc = SetRequiredForPkLookup()
        assert isinstance(exc, ValueError)


# ---------------------------------------------------------------------------
# Cross-module guarantees
# ---------------------------------------------------------------------------


class TestServiceModuleHasNoFastAPI:
    def test_no_fastapi_import(self):
        import aerospike_cluster_manager_api.services.query_service as mod

        # The service module must not depend on FastAPI shaping.
        assert "fastapi" not in mod.__dict__
        # And no fastapi.* names leak through.
        for attr in dir(mod):
            value: Any = getattr(mod, attr)
            module_name = getattr(value, "__module__", "") or ""
            assert not module_name.startswith("fastapi"), f"{attr} originates in {module_name}"
