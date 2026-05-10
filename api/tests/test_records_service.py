"""Unit tests for the records service layer.

These tests exercise ``services.records_service`` directly — without going
through FastAPI — so the same functions can be reused by an MCP tool layer.
The router-layer regression net lives in ``test_records_router.py``.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import aerospike_py
import pytest
from aerospike_py import exp
from aerospike_py.exception import (
    AerospikeError,
    AerospikeTimeoutError,
    BackpressureError,
    ClusterError,
    RecordExistsError,
    RecordNotFound,
)

from aerospike_cluster_manager_api.constants import POLICY_QUERY, POLICY_READ, POLICY_WRITE
from aerospike_cluster_manager_api.expression_builder import build_pk_filter_expression
from aerospike_cluster_manager_api.models.query import (
    BinDataType,
    FilterCondition,
    FilteredQueryRequest,
    FilterGroup,
    FilterOperator,
)
from aerospike_cluster_manager_api.models.record import RecordKey, RecordWriteRequest
from aerospike_cluster_manager_api.services import records_service
from aerospike_cluster_manager_api.services.records_service import (
    InvalidPkPattern,
    PrimaryKeyMissing,
    SetRequiredForPkLookup,
)


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
    mock_client.info_all = AsyncMock(return_value=[])
    return mock_client, query_obj


# ---------------------------------------------------------------------------
# get_record
# ---------------------------------------------------------------------------


class TestGetRecord:
    async def test_returns_record_for_valid_key(self):
        client = AsyncMock()
        rec = _make_record(
            key=("test", "demo", 42, b"\xab\xcd"),
            meta=SimpleNamespace(gen=7, ttl=3600),
            bins={"name": "Alice", "age": 30},
        )
        client.get = AsyncMock(return_value=rec)

        result = await records_service.get_record(client, "test", "demo", "42", "auto")

        assert result is rec
        # auto resolution: "42" -> int 42 (numeric string heuristic)
        client.get.assert_awaited_once_with(("test", "demo", 42), policy=POLICY_READ)

    async def test_string_pk_type_passes_string(self):
        client = AsyncMock()
        client.get = AsyncMock(return_value=_make_record())

        await records_service.get_record(client, "test", "demo", "42", "string")

        client.get.assert_awaited_once_with(("test", "demo", "42"), policy=POLICY_READ)

    async def test_propagates_record_not_found_for_explicit_pk_type(self):
        client = AsyncMock()
        client.get = AsyncMock(side_effect=RecordNotFound("not found"))

        with pytest.raises(RecordNotFound):
            await records_service.get_record(client, "test", "demo", "missing", "string")

    async def test_auto_falls_back_to_string_when_int_not_found(self):
        """auto mode: numeric-string PK like "42" first probes as INTEGER; on
        NOT_FOUND it retries as STRING. Mirrors the existing get_with_pk_fallback
        behaviour the router relied on."""
        client = AsyncMock()
        rec = _make_record(key=("test", "demo", "42", b"\x00"))
        # First call (int) raises, second call (string) succeeds.
        client.get = AsyncMock(side_effect=[RecordNotFound("nope"), rec])

        result = await records_service.get_record(client, "test", "demo", "42", "auto")

        assert result is rec
        assert client.get.await_count == 2
        first_call = client.get.await_args_list[0]
        second_call = client.get.await_args_list[1]
        assert first_call.args[0] == ("test", "demo", 42)
        assert second_call.args[0] == ("test", "demo", "42")


# ---------------------------------------------------------------------------
# delete_record
# ---------------------------------------------------------------------------


class TestDeleteRecord:
    async def test_calls_remove_with_resolved_key(self):
        client = AsyncMock()
        client.remove = AsyncMock(return_value=None)

        await records_service.delete_record(client, "test", "demo", "42", "auto")

        client.remove.assert_awaited_once_with(("test", "demo", 42))

    async def test_string_pk_type_keeps_string_key(self):
        client = AsyncMock()
        client.remove = AsyncMock(return_value=None)

        await records_service.delete_record(client, "test", "demo", "42", "string")

        client.remove.assert_awaited_once_with(("test", "demo", "42"))

    async def test_propagates_record_not_found(self):
        client = AsyncMock()
        client.remove = AsyncMock(side_effect=RecordNotFound("not found"))

        with pytest.raises(RecordNotFound):
            await records_service.delete_record(client, "test", "demo", "missing", "string")


# ---------------------------------------------------------------------------
# put_record (write path — create or update)
# ---------------------------------------------------------------------------


class TestPutRecord:
    async def test_writes_then_reads_back_for_response(self):
        client = AsyncMock()
        client.put = AsyncMock(return_value=None)
        rec = _make_record(
            key=("test", "demo", 42, b"\x00"),
            meta=SimpleNamespace(gen=1, ttl=0),
            bins={"name": "Alice"},
        )
        client.get = AsyncMock(return_value=rec)

        body = RecordWriteRequest(
            key=RecordKey(namespace="test", set="demo", pk="42"),
            bins={"name": "Alice"},
        )
        result = await records_service.put_record(client, body)

        assert result is rec
        # auto-mode "42" -> int 42 in put + get
        client.put.assert_awaited_once()
        put_call = client.put.await_args
        assert put_call.args[0] == ("test", "demo", 42)
        assert put_call.args[1] == {"name": "Alice"}
        client.get.assert_awaited_once_with(("test", "demo", 42), policy=POLICY_READ)

    async def test_passes_ttl_via_write_meta(self):
        client = AsyncMock()
        client.put = AsyncMock(return_value=None)
        client.get = AsyncMock(return_value=_make_record())

        body = RecordWriteRequest(
            key=RecordKey(namespace="test", set="demo", pk="k1"),
            bins={"a": 1},
            ttl=120,
        )
        await records_service.put_record(client, body)

        put_call = client.put.await_args
        meta = put_call.kwargs.get("meta")
        # WriteMeta is a TypedDict, so isinstance() does not work. The shape
        # is enforced at the typing layer; at runtime it is a plain dict.
        assert meta is not None
        assert meta["ttl"] == 120

    async def test_no_ttl_means_no_meta(self):
        client = AsyncMock()
        client.put = AsyncMock(return_value=None)
        client.get = AsyncMock(return_value=_make_record())

        body = RecordWriteRequest(
            key=RecordKey(namespace="test", set="demo", pk="k1"),
            bins={"a": 1},
        )
        await records_service.put_record(client, body)

        put_call = client.put.await_args
        assert put_call.kwargs.get("meta") is None

    async def test_missing_namespace_raises(self):
        client = AsyncMock()
        # Build the request manually — RecordKey enforces ns min_length=1 so
        # we can't construct one with empty namespace via the model. Use a
        # raw dict-build path.
        body = RecordWriteRequest.model_construct(
            key=RecordKey.model_construct(namespace="", set="demo", pk="k1"),
            bins={"a": 1},
        )
        with pytest.raises(PrimaryKeyMissing):
            await records_service.put_record(client, body)

    async def test_missing_set_raises(self):
        client = AsyncMock()
        body = RecordWriteRequest.model_construct(
            key=RecordKey.model_construct(namespace="test", set="", pk="k1"),
            bins={"a": 1},
        )
        with pytest.raises(PrimaryKeyMissing):
            await records_service.put_record(client, body)

    async def test_missing_pk_raises(self):
        client = AsyncMock()
        body = RecordWriteRequest.model_construct(
            key=RecordKey.model_construct(namespace="test", set="demo", pk=""),
            bins={"a": 1},
        )
        with pytest.raises(PrimaryKeyMissing):
            await records_service.put_record(client, body)


# ---------------------------------------------------------------------------
# record_exists
# ---------------------------------------------------------------------------


class TestRecordExists:
    async def test_returns_true_when_meta_present(self):
        client = AsyncMock()
        client.exists = AsyncMock(
            return_value=SimpleNamespace(key=("test", "demo", "k1", b"\x00"), meta=SimpleNamespace(gen=1, ttl=0))
        )

        result = await records_service.record_exists(client, "test", "demo", "k1", "string")

        assert result is True
        client.exists.assert_awaited_once_with(("test", "demo", "k1"), policy=POLICY_READ)

    async def test_returns_false_when_meta_is_none(self):
        client = AsyncMock()
        client.exists = AsyncMock(return_value=SimpleNamespace(key=("test", "demo", "k1", b"\x00"), meta=None))

        result = await records_service.record_exists(client, "test", "demo", "missing", "string")

        assert result is False

    async def test_auto_resolves_numeric_string_to_int(self):
        client = AsyncMock()
        client.exists = AsyncMock(return_value=SimpleNamespace(key=("test", "demo", 42, b"\x00"), meta=None))

        await records_service.record_exists(client, "test", "demo", "42", "auto")

        # auto: "42" -> int 42
        client.exists.assert_awaited_once_with(("test", "demo", 42), policy=POLICY_READ)

    async def test_record_not_found_treated_as_false(self):
        # Some aerospike-py builds may raise RecordNotFound rather than
        # returning meta=None for a missing record. The service treats both
        # signals as "absent" so the MCP tool can answer with exists=False.
        client = AsyncMock()
        client.exists = AsyncMock(side_effect=RecordNotFound("nope"))

        result = await records_service.record_exists(client, "test", "demo", "missing", "string")

        assert result is False


# ---------------------------------------------------------------------------
# create_record (CREATE_ONLY policy)
# ---------------------------------------------------------------------------


class TestCreateRecord:
    async def test_writes_with_create_only_policy(self):
        client = AsyncMock()
        client.put = AsyncMock(return_value=None)

        await records_service.create_record(client, "test", "demo", "k1", {"name": "Alice"}, "string")

        client.put.assert_awaited_once()
        put_call = client.put.await_args
        # key tuple
        assert put_call.args[0] == ("test", "demo", "k1")
        # bins
        assert put_call.args[1] == {"name": "Alice"}
        # policy carries CREATE_ONLY
        policy = put_call.kwargs.get("policy") or {}
        assert policy.get("exists") == aerospike_py.POLICY_EXISTS_CREATE_ONLY
        # base read/write policy keys are still applied
        for k, v in POLICY_WRITE.items():
            assert policy[k] == v

    async def test_auto_resolves_numeric_string_to_int(self):
        client = AsyncMock()
        client.put = AsyncMock(return_value=None)

        await records_service.create_record(client, "test", "demo", "42", {"a": 1}, "auto")

        put_call = client.put.await_args
        assert put_call.args[0] == ("test", "demo", 42)

    async def test_record_exists_propagates(self):
        client = AsyncMock()
        client.put = AsyncMock(side_effect=RecordExistsError("already exists"))

        with pytest.raises(RecordExistsError):
            await records_service.create_record(client, "test", "demo", "k1", {"a": 1}, "string")


# ---------------------------------------------------------------------------
# update_record (UPDATE policy — must exist)
# ---------------------------------------------------------------------------


class TestUpdateRecord:
    async def test_writes_with_update_only_policy(self):
        client = AsyncMock()
        client.put = AsyncMock(return_value=None)

        await records_service.update_record(client, "test", "demo", "k1", {"name": "Bob"}, "string")

        client.put.assert_awaited_once()
        put_call = client.put.await_args
        assert put_call.args[0] == ("test", "demo", "k1")
        assert put_call.args[1] == {"name": "Bob"}
        policy = put_call.kwargs.get("policy") or {}
        # UPDATE_ONLY guarantees the record must already exist; UPDATE alone
        # would create it.
        assert policy.get("exists") == aerospike_py.POLICY_EXISTS_UPDATE_ONLY
        for k, v in POLICY_WRITE.items():
            assert policy[k] == v

    async def test_auto_resolves_numeric_string_to_int(self):
        client = AsyncMock()
        client.put = AsyncMock(return_value=None)

        await records_service.update_record(client, "test", "demo", "42", {"a": 1}, "auto")

        put_call = client.put.await_args
        assert put_call.args[0] == ("test", "demo", 42)

    async def test_record_not_found_propagates(self):
        client = AsyncMock()
        client.put = AsyncMock(side_effect=RecordNotFound("absent"))

        with pytest.raises(RecordNotFound):
            await records_service.update_record(client, "test", "demo", "missing", {"a": 1}, "string")


# ---------------------------------------------------------------------------
# delete_bin
# ---------------------------------------------------------------------------


class TestDeleteBin:
    async def test_calls_remove_bin(self):
        client = AsyncMock()
        client.remove_bin = AsyncMock(return_value=None)

        await records_service.delete_bin(client, "test", "demo", "k1", "old_bin", "string")

        client.remove_bin.assert_awaited_once()
        call = client.remove_bin.await_args
        assert call.args[0] == ("test", "demo", "k1")
        # The bin name list is passed through.
        assert call.args[1] == ["old_bin"]

    async def test_auto_resolves_numeric_string_to_int(self):
        client = AsyncMock()
        client.remove_bin = AsyncMock(return_value=None)

        await records_service.delete_bin(client, "test", "demo", "42", "x", "auto")

        call = client.remove_bin.await_args
        assert call.args[0] == ("test", "demo", 42)

    async def test_record_not_found_propagates(self):
        client = AsyncMock()
        client.remove_bin = AsyncMock(side_effect=RecordNotFound("nope"))

        with pytest.raises(RecordNotFound):
            await records_service.delete_bin(client, "test", "demo", "missing", "x", "string")


# ---------------------------------------------------------------------------
# truncate_set
# ---------------------------------------------------------------------------


class TestTruncateSet:
    async def test_calls_client_truncate_with_zero_when_no_lut(self):
        client = AsyncMock()
        client.truncate = AsyncMock(return_value=None)

        await records_service.truncate_set(client, "test", "demo")

        client.truncate.assert_awaited_once_with("test", "demo", 0)

    async def test_passes_before_lut_in_nanos(self):
        client = AsyncMock()
        client.truncate = AsyncMock(return_value=None)

        await records_service.truncate_set(client, "test", "demo", before_lut=1_700_000_000_000_000_000)

        client.truncate.assert_awaited_once_with("test", "demo", 1_700_000_000_000_000_000)


# ---------------------------------------------------------------------------
# list_records (scan with limit)
# ---------------------------------------------------------------------------


class TestListRecords:
    async def test_returns_records_with_total_and_pagesize(self):
        recs = [_make_record(key=("test", "demo", f"k{i}", b"\x00")) for i in range(3)]
        client, _query = _build_query_mock(recs)
        # info_all is used to compute set object count via _get_set_object_count
        # In the bare default (returning []) it falls through to 0.

        result = await records_service.list_records(client, "test", "demo", page_size=25)

        assert len(result.records) == 3
        assert result.page_size == 25
        # Empty info_all → set total resolves to 0; hasMore is therefore False.
        assert result.total == 0
        assert result.has_more is False

    async def test_query_failure_returns_empty_page_not_raising(self):
        client, query = _build_query_mock()
        # Simulate aerospike_py raising on the underlying scan
        query.results = AsyncMock(side_effect=AerospikeError("empty namespace"))

        result = await records_service.list_records(client, "test", "demo", page_size=25)

        assert result.records == []
        assert result.has_more is False

    async def test_cluster_error_propagates_not_silently_empty(self):
        """Connectivity failures must surface as 503 via the global handler,
        not be swallowed into HTTP 200 with an empty page (silent failure)."""
        client, query = _build_query_mock()
        query.results = AsyncMock(side_effect=ClusterError("cluster down"))

        with pytest.raises(ClusterError):
            await records_service.list_records(client, "test", "demo", page_size=25)

    async def test_timeout_error_propagates(self):
        """Timeouts must propagate (504) — silent empty-page would mask outages."""
        client, query = _build_query_mock()
        query.results = AsyncMock(side_effect=AerospikeTimeoutError("timeout"))

        with pytest.raises(AerospikeTimeoutError):
            await records_service.list_records(client, "test", "demo", page_size=25)

    async def test_backpressure_error_propagates(self):
        """Backpressure must propagate (503 + Retry-After), not be hidden."""
        client, query = _build_query_mock()
        query.results = AsyncMock(side_effect=BackpressureError("queue full"))

        with pytest.raises(BackpressureError):
            await records_service.list_records(client, "test", "demo", page_size=25)

    async def test_max_records_capped_to_pagesize(self):
        client, query = _build_query_mock()
        await records_service.list_records(client, "test", "demo", page_size=5)
        # results() invoked with a policy whose max_records is at most page_size.
        call = query.results.await_args
        policy = call.args[0]
        assert "max_records" in policy
        assert policy["max_records"] <= 5

    async def test_uses_policy_query_base(self):
        client, query = _build_query_mock()
        await records_service.list_records(client, "test", "demo", page_size=10)
        call = query.results.await_args
        policy = call.args[0]
        # The base POLICY_QUERY keys leak into the merged policy
        for k, v in POLICY_QUERY.items():
            assert policy[k] == v


# ---------------------------------------------------------------------------
# filter_records (PK exact / prefix / regex + bin filters)
# ---------------------------------------------------------------------------


class TestFilterRecords:
    async def test_exact_mode_short_circuits_to_get(self):
        client, _query = _build_query_mock()
        rec = _make_record(key=("test", "demo", "k1", b"\x00"))
        client.get = AsyncMock(return_value=rec)

        body = FilteredQueryRequest(namespace="test", set="demo", pkPattern="k1", pkMatchMode="exact")
        result = await records_service.filter_records(client, body)

        assert len(result.records) == 1
        assert result.records[0] is rec
        client.get.assert_awaited_once()
        # Scan path NOT taken
        client.query.assert_not_called()

    async def test_exact_mode_pk_not_found_returns_empty_page(self):
        client, _query = _build_query_mock()
        client.get = AsyncMock(side_effect=RecordNotFound("nope"))

        body = FilteredQueryRequest(namespace="test", set="demo", pkPattern="k1", pkMatchMode="exact")
        result = await records_service.filter_records(client, body)

        assert result.records == []
        assert result.has_more is False

    async def test_prefix_mode_uses_pk_filter_expression(self):
        client, query = _build_query_mock()

        body = FilteredQueryRequest(namespace="test", set="demo", pkPattern="user_", pkMatchMode="prefix")
        await records_service.filter_records(client, body)

        client.query.assert_called_once_with("test", "demo")
        call = query.results.await_args
        policy = call.args[0]
        assert "filter_expression" in policy
        assert policy["filter_expression"] == build_pk_filter_expression("user_", "prefix")

    async def test_regex_mode_combines_with_bin_filter_via_and(self):
        client, query = _build_query_mock()

        body = FilteredQueryRequest(
            namespace="test",
            set="demo",
            pkPattern="^acct[0-9]+$",
            pkMatchMode="regex",
            filters=FilterGroup(
                logic="and",
                conditions=[
                    FilterCondition(
                        bin="score",
                        operator=FilterOperator.GT,
                        value=100,
                        binType=BinDataType.INTEGER,
                    )
                ],
            ),
        )
        await records_service.filter_records(client, body)

        call = query.results.await_args
        policy = call.args[0]
        pk_part = build_pk_filter_expression("^acct[0-9]+$", "regex")
        bin_part = exp.gt(exp.int_bin("score"), exp.int_val(100))
        assert policy["filter_expression"] == exp.and_(pk_part, bin_part)

    async def test_pk_lookup_without_set_raises(self):
        client = AsyncMock()
        body = FilteredQueryRequest(namespace="test", pkPattern="k1", pkMatchMode="exact")
        with pytest.raises(SetRequiredForPkLookup):
            await records_service.filter_records(client, body)

    async def test_invalid_regex_raises_invalid_pk_pattern(self):
        client, _query = _build_query_mock()
        body = FilteredQueryRequest(namespace="test", set="demo", pkPattern="[unclosed", pkMatchMode="regex")
        with pytest.raises(InvalidPkPattern):
            await records_service.filter_records(client, body)

    async def test_query_failure_returns_empty_page(self):
        client, query = _build_query_mock()
        query.results = AsyncMock(side_effect=AerospikeError("empty"))

        body = FilteredQueryRequest(namespace="test", set="demo")
        result = await records_service.filter_records(client, body)

        assert result.records == []
        assert result.has_more is False

    async def test_cluster_error_propagates_not_silently_empty(self):
        """ClusterError must propagate so the global 503 handler runs;
        masking it as an empty page hides outages from the UI."""
        client, query = _build_query_mock()
        query.results = AsyncMock(side_effect=ClusterError("cluster down"))

        body = FilteredQueryRequest(namespace="test", set="demo")
        with pytest.raises(ClusterError):
            await records_service.filter_records(client, body)

    async def test_timeout_error_propagates(self):
        client, query = _build_query_mock()
        query.results = AsyncMock(side_effect=AerospikeTimeoutError("timeout"))

        body = FilteredQueryRequest(namespace="test", set="demo")
        with pytest.raises(AerospikeTimeoutError):
            await records_service.filter_records(client, body)

    async def test_backpressure_error_propagates(self):
        client, query = _build_query_mock()
        query.results = AsyncMock(side_effect=BackpressureError("queue full"))

        body = FilteredQueryRequest(namespace="test", set="demo")
        with pytest.raises(BackpressureError):
            await records_service.filter_records(client, body)

    async def test_exact_mode_without_set_raises_set_required(self):
        """The PK-exact short-circuit must reject a missing set with the
        explicit domain exception even with python -O (where ``assert``
        is stripped). This guards the invariant at runtime, not just
        during development."""
        client, _query = _build_query_mock()
        body = FilteredQueryRequest(namespace="test", primaryKey="42", pkMatchMode="exact")
        with pytest.raises(SetRequiredForPkLookup):
            await records_service.filter_records(client, body)

    async def test_hasMore_true_when_results_equal_pagesize_plus_one(self):
        recs = [_make_record(key=("test", "demo", f"k{i}", b"\x00"), bins={"score": i}) for i in range(6)]
        client, _query = _build_query_mock(recs)

        body = FilteredQueryRequest(namespace="test", set="demo", pageSize=5, pkPattern="k", pkMatchMode="prefix")
        result = await records_service.filter_records(client, body)

        assert result.has_more is True
        assert result.returned_records == 5
        assert len(result.records) == 5

    async def test_pure_bin_filter_runs_scan_with_bin_expression_only(self):
        client, query = _build_query_mock()
        body = FilteredQueryRequest(
            namespace="test",
            set="demo",
            filters=FilterGroup(
                logic="and",
                conditions=[
                    FilterCondition(
                        bin="score",
                        operator=FilterOperator.GT,
                        value=1,
                        binType=BinDataType.INTEGER,
                    )
                ],
            ),
        )
        await records_service.filter_records(client, body)

        client.get.assert_not_called()
        client.query.assert_called_once_with("test", "demo")
        call = query.results.await_args
        policy = call.args[0]
        # Only the bin filter, no PK component.
        assert policy["filter_expression"] == exp.gt(exp.int_bin("score"), exp.int_val(1))


# ---------------------------------------------------------------------------
# Domain exception construction
# ---------------------------------------------------------------------------


class TestDomainExceptions:
    def test_invalid_pk_pattern_is_value_error(self):
        exc = InvalidPkPattern("bad regex")
        assert isinstance(exc, ValueError)
        assert "bad regex" in str(exc)

    def test_set_required_for_pk_lookup_is_value_error(self):
        exc = SetRequiredForPkLookup()
        assert isinstance(exc, ValueError)

    def test_primary_key_missing_is_value_error(self):
        exc = PrimaryKeyMissing("namespace")
        assert isinstance(exc, ValueError)


# ---------------------------------------------------------------------------
# Cross-module guarantees
# ---------------------------------------------------------------------------


class TestServiceModuleHasNoFastAPI:
    def test_no_fastapi_import(self):
        import aerospike_cluster_manager_api.services.records_service as mod

        # The service module must not depend on FastAPI shaping.
        assert "fastapi" not in mod.__dict__
        # And no fastapi.* names leak through.
        for attr in dir(mod):
            value = getattr(mod, attr)
            module_name = getattr(value, "__module__", "") or ""
            assert not module_name.startswith("fastapi"), f"{attr} originates in {module_name}"
