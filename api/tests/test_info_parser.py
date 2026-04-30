"""Tests for aerospike_cluster_manager_api.info_parser module."""

from __future__ import annotations

from aerospike_cluster_manager_api.info_parser import (
    aggregate_node_kv,
    aggregate_set_records,
    parse_kv_pairs,
    parse_list,
    parse_records,
    safe_bool,
    safe_int,
)

# ---- parse_kv_pairs --------------------------------------------------------


class TestParseKvPairs:
    def test_basic_kv(self):
        result = parse_kv_pairs("key1=val1;key2=val2")
        assert result == {"key1": "val1", "key2": "val2"}

    def test_single_pair(self):
        result = parse_kv_pairs("name=aerospike")
        assert result == {"name": "aerospike"}

    def test_empty_string(self):
        assert parse_kv_pairs("") == {}

    def test_none_like_empty(self):
        # The function handles empty strings; None would be a caller error,
        # but we test falsy input.
        assert parse_kv_pairs("") == {}

    def test_whitespace_stripping(self):
        result = parse_kv_pairs("  key1 = val1 ; key2 = val2 ")
        assert result == {"key1": "val1", "key2": "val2"}

    def test_custom_separator(self):
        result = parse_kv_pairs("a=1:b=2:c=3", sep=":")
        assert result == {"a": "1", "b": "2", "c": "3"}

    def test_value_with_equals(self):
        """Value that itself contains '=' should not be split further."""
        result = parse_kv_pairs("expr=a=b;other=1")
        assert result == {"expr": "a=b", "other": "1"}

    def test_entry_without_equals_is_skipped(self):
        result = parse_kv_pairs("good=1;badentry;ok=2")
        assert result == {"good": "1", "ok": "2"}

    def test_trailing_separator(self):
        result = parse_kv_pairs("a=1;b=2;")
        assert result == {"a": "1", "b": "2"}

    def test_leading_separator(self):
        result = parse_kv_pairs(";a=1;b=2")
        assert result == {"a": "1", "b": "2"}

    def test_only_separators(self):
        result = parse_kv_pairs(";;;")
        assert result == {}


# ---- parse_list -------------------------------------------------------------


class TestParseList:
    def test_basic_list(self):
        assert parse_list("a;b;c") == ["a", "b", "c"]

    def test_single_item(self):
        assert parse_list("only") == ["only"]

    def test_empty_string(self):
        assert parse_list("") == []

    def test_whitespace_only(self):
        assert parse_list("   ") == []

    def test_whitespace_stripping(self):
        assert parse_list(" a ; b ; c ") == ["a", "b", "c"]

    def test_custom_separator(self):
        assert parse_list("x:y:z", sep=":") == ["x", "y", "z"]

    def test_empty_segments_are_removed(self):
        assert parse_list("a;;b;;c") == ["a", "b", "c"]

    def test_trailing_separator(self):
        assert parse_list("a;b;") == ["a", "b"]


# ---- parse_records ----------------------------------------------------------


class TestParseRecords:
    def test_basic_records(self):
        resp = "set=myset:objects=100:tombstones=0;set=other:objects=50:tombstones=2"
        result = parse_records(resp)
        assert len(result) == 2
        assert result[0] == {"set": "myset", "objects": "100", "tombstones": "0"}
        assert result[1] == {"set": "other", "objects": "50", "tombstones": "2"}

    def test_single_record(self):
        result = parse_records("name=idx1:bin=age:type=numeric")
        assert result == [{"name": "idx1", "bin": "age", "type": "numeric"}]

    def test_empty_string(self):
        assert parse_records("") == []

    def test_whitespace_only(self):
        assert parse_records("   ") == []

    def test_custom_separators(self):
        result = parse_records("a=1,b=2|c=3,d=4", record_sep="|", field_sep=",")
        assert result == [{"a": "1", "b": "2"}, {"c": "3", "d": "4"}]

    def test_fields_without_equals_are_skipped(self):
        result = parse_records("ok=1:badfield:good=2")
        assert result == [{"ok": "1", "good": "2"}]

    def test_empty_records_skipped(self):
        result = parse_records(";;set=a:objects=1;;")
        assert len(result) == 1
        assert result[0]["set"] == "a"

    def test_value_containing_equals(self):
        result = parse_records("expr=a=b:name=test")
        assert result == [{"expr": "a=b", "name": "test"}]


# ---- safe_int ---------------------------------------------------------------


class TestSafeInt:
    def test_valid_integer_string(self):
        assert safe_int("42") == 42

    def test_negative_integer(self):
        assert safe_int("-10") == -10

    def test_zero(self):
        assert safe_int("0") == 0

    def test_none_returns_default(self):
        assert safe_int(None) == 0

    def test_none_custom_default(self):
        assert safe_int(None, default=-1) == -1

    def test_non_numeric_returns_default(self):
        assert safe_int("abc") == 0

    def test_non_numeric_custom_default(self):
        assert safe_int("abc", default=99) == 99

    def test_float_string_returns_default(self):
        assert safe_int("3.14") == 0

    def test_empty_string_returns_default(self):
        assert safe_int("") == 0

    def test_whitespace_string_returns_default(self):
        assert safe_int("  ") == 0


# ---- safe_bool --------------------------------------------------------------


class TestSafeBool:
    def test_true_lowercase(self):
        assert safe_bool("true") is True

    def test_true_uppercase(self):
        assert safe_bool("TRUE") is True

    def test_true_mixed_case(self):
        assert safe_bool("True") is True

    def test_true_with_whitespace(self):
        assert safe_bool("  true  ") is True

    def test_false_lowercase(self):
        assert safe_bool("false") is False

    def test_false_uppercase(self):
        assert safe_bool("FALSE") is False

    def test_none_returns_false(self):
        assert safe_bool(None) is False

    def test_empty_string_returns_false(self):
        assert safe_bool("") is False

    def test_arbitrary_string_returns_false(self):
        assert safe_bool("yes") is False

    def test_one_returns_false(self):
        assert safe_bool("1") is False


# ---- aggregate_node_kv ------------------------------------------------------


class TestAggregateNodeKv:
    def _make_result(self, name: str, resp: str) -> tuple[str, int | None, str]:
        """Helper to create an info_all result tuple (name, err, response)."""
        return (name, None, resp)

    def _make_error(self, name: str) -> tuple[str, int | None, str]:
        return (name, -1, "")

    def test_single_node(self):
        results = [self._make_result("node1", "objects=100;memory=2048")]
        merged = aggregate_node_kv(results)
        assert merged == {"objects": "100", "memory": "2048"}

    def test_sum_keys_across_nodes(self):
        results = [
            self._make_result("node1", "objects=100;memory=2048;version=6.0"),
            self._make_result("node2", "objects=200;memory=4096;version=6.0"),
        ]
        merged = aggregate_node_kv(results, keys_to_sum={"objects", "memory"})
        assert merged["objects"] == "300"
        assert merged["memory"] == "6144"
        # Non-summed key uses the first node's value
        assert merged["version"] == "6.0"

    def test_min_keys_across_nodes(self):
        results = [
            self._make_result("node1", "free-pct-memory=30;objects=100"),
            self._make_result("node2", "free-pct-memory=20;objects=200"),
            self._make_result("node3", "free-pct-memory=40;objects=50"),
        ]
        merged = aggregate_node_kv(results, keys_to_min={"free-pct-memory"})
        assert merged["free-pct-memory"] == "20"

    def test_error_nodes_are_skipped(self):
        results = [
            self._make_result("node1", "objects=100"),
            self._make_error("node2"),
            self._make_result("node3", "objects=200"),
        ]
        merged = aggregate_node_kv(results, keys_to_sum={"objects"})
        assert merged["objects"] == "300"

    def test_all_errors_returns_empty(self):
        results = [self._make_error("node1"), self._make_error("node2")]
        merged = aggregate_node_kv(results)
        assert merged == {}

    def test_empty_results(self):
        merged = aggregate_node_kv([])
        assert merged == {}

    def test_sum_and_min_together(self):
        results = [
            self._make_result("node1", "objects=100;free-pct=50;name=ns1"),
            self._make_result("node2", "objects=200;free-pct=30;name=ns1"),
        ]
        merged = aggregate_node_kv(
            results,
            keys_to_sum={"objects"},
            keys_to_min={"free-pct"},
        )
        assert merged["objects"] == "300"
        assert merged["free-pct"] == "30"
        assert merged["name"] == "ns1"

    def test_non_numeric_sum_key_treated_as_zero(self):
        results = [
            self._make_result("node1", "objects=abc"),
            self._make_result("node2", "objects=10"),
        ]
        merged = aggregate_node_kv(results, keys_to_sum={"objects"})
        assert merged["objects"] == "10"


# ---- aggregate_set_records --------------------------------------------------


class TestAggregateSetRecords:
    def _make_result(self, name: str, resp: str) -> tuple[str, int | None, str]:
        return (name, None, resp)

    def _make_error(self, name: str) -> tuple[str, int | None, str]:
        return (name, -1, "")

    def test_single_node_single_set(self):
        resp = "set=myset:objects=100:tombstones=10:memory_data_bytes=5000:stop-writes-count=0"
        results = [self._make_result("node1", resp)]
        sets = aggregate_set_records(results, replication_factor=1)
        assert len(sets) == 1
        assert sets[0]["name"] == "myset"
        assert sets[0]["objects"] == 100
        assert sets[0]["tombstones"] == 10
        assert sets[0]["memory_data_bytes"] == 5000
        assert sets[0]["node_count"] == 1

    def test_multi_node_dedup_with_rf2(self):
        resp = "set=myset:objects=200:tombstones=4:memory_data_bytes=1000:stop-writes-count=0"
        results = [
            self._make_result("node1", resp),
            self._make_result("node2", resp),
        ]
        sets = aggregate_set_records(results, replication_factor=2)
        assert len(sets) == 1
        # 400 total objects / min(rf=2, 2 responding nodes) = 200
        assert sets[0]["objects"] == 200
        assert sets[0]["tombstones"] == 4
        # memory_data_bytes is summed, not divided
        assert sets[0]["memory_data_bytes"] == 2000
        assert sets[0]["node_count"] == 2

    def test_rf_higher_than_nodes(self):
        """When RF > responding nodes, effective_rf = responding nodes."""
        resp = "set=myset:objects=100:tombstones=2:memory_data_bytes=500:stop-writes-count=0"
        results = [self._make_result("node1", resp)]
        sets = aggregate_set_records(results, replication_factor=3)
        assert len(sets) == 1
        # effective_rf = min(3, 1) = 1
        assert sets[0]["objects"] == 100

    def test_multiple_sets(self):
        resp1 = "set=set_a:objects=50:tombstones=0:memory_data_bytes=100:stop-writes-count=0"
        resp2 = "set=set_b:objects=30:tombstones=1:memory_data_bytes=200:stop-writes-count=0"
        combined = f"{resp1};{resp2}"
        results = [self._make_result("node1", combined)]
        sets = aggregate_set_records(results, replication_factor=1)
        assert len(sets) == 2
        names = {s["name"] for s in sets}
        assert names == {"set_a", "set_b"}

    def test_error_nodes_skipped(self):
        resp = "set=myset:objects=100:tombstones=0:memory_data_bytes=500:stop-writes-count=0"
        results = [
            self._make_result("node1", resp),
            self._make_error("node2"),
        ]
        sets = aggregate_set_records(results, replication_factor=2)
        assert len(sets) == 1
        # Only 1 responding node, effective_rf = min(2, 1) = 1
        assert sets[0]["objects"] == 100

    def test_empty_results(self):
        assert aggregate_set_records([]) == []

    def test_all_errors(self):
        results = [self._make_error("node1"), self._make_error("node2")]
        assert aggregate_set_records(results) == []

    def test_stop_writes_count_takes_max(self):
        resp1 = "set=myset:objects=100:tombstones=0:memory_data_bytes=500:stop-writes-count=5"
        resp2 = "set=myset:objects=100:tombstones=0:memory_data_bytes=500:stop-writes-count=10"
        results = [
            self._make_result("node1", resp1),
            self._make_result("node2", resp2),
        ]
        sets = aggregate_set_records(results, replication_factor=2)
        assert sets[0]["stop_writes_count"] == 10

    def test_set_name_field_fallback(self):
        """Some responses use 'set_name' instead of 'set'."""
        resp = "set_name=myset:objects=100:tombstones=0:memory_data_bytes=500:stop-writes-count=0"
        results = [self._make_result("node1", resp)]
        sets = aggregate_set_records(results, replication_factor=1)
        assert len(sets) == 1
        assert sets[0]["name"] == "myset"

    def test_records_without_set_name_are_skipped(self):
        resp = "objects=100:tombstones=0:memory_data_bytes=500:stop-writes-count=0"
        results = [self._make_result("node1", resp)]
        sets = aggregate_set_records(results, replication_factor=1)
        assert sets == []
