"""Validation tests for ``QueryRequest`` and ``FilteredQueryRequest`` selectBins.

An empty list, an empty string, an oversized name, or a name with control
characters must be rejected at the model boundary so the HTTP layer returns
a 400 with a clear message instead of an opaque Aerospike server 5xx (e.g.,
``BinNameTooLong``).
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from aerospike_cluster_manager_api.models.query import (
    PK_BIN_PLACEHOLDER,
    FilterCondition,
    FilteredQueryRequest,
    FilterOperator,
    QueryRequest,
)


class TestQueryRequestSelectBins:
    def test_rejects_empty_select_bins(self):
        with pytest.raises(ValidationError):
            QueryRequest(namespace="ns", selectBins=[])

    def test_rejects_oversized_bin_name(self):
        with pytest.raises(ValidationError):
            QueryRequest(namespace="ns", selectBins=["x" * 20])

    def test_rejects_empty_bin_name(self):
        with pytest.raises(ValidationError):
            QueryRequest(namespace="ns", selectBins=[""])

    def test_rejects_control_character_bin_name(self):
        with pytest.raises(ValidationError):
            QueryRequest(namespace="ns", selectBins=["bad\x00name"])

    def test_accepts_valid_bin_names(self):
        req = QueryRequest(namespace="ns", selectBins=["a", "bin2"])
        assert req.selectBins == ["a", "bin2"]

    def test_accepts_none_select_bins(self):
        req = QueryRequest(namespace="ns")
        assert req.selectBins is None


class TestFilteredQueryRequestSelectBins:
    def test_rejects_empty_select_bins_by_field_name(self):
        with pytest.raises(ValidationError):
            FilteredQueryRequest(namespace="ns", select_bins=[])

    def test_rejects_empty_select_bins_by_alias(self):
        with pytest.raises(ValidationError):
            FilteredQueryRequest.model_validate({"namespace": "ns", "selectBins": []})

    def test_rejects_oversized_bin_name_by_alias(self):
        with pytest.raises(ValidationError):
            FilteredQueryRequest.model_validate({"namespace": "ns", "selectBins": ["x" * 20]})

    def test_rejects_empty_bin_name_by_alias(self):
        with pytest.raises(ValidationError):
            FilteredQueryRequest.model_validate({"namespace": "ns", "selectBins": [""]})

    def test_rejects_control_character_bin_name(self):
        with pytest.raises(ValidationError):
            FilteredQueryRequest(namespace="ns", select_bins=["bad\x01name"])

    def test_accepts_valid_bin_names_by_alias(self):
        req = FilteredQueryRequest.model_validate({"namespace": "ns", "selectBins": ["a", "bin2"]})
        assert req.select_bins == ["a", "bin2"]

    def test_accepts_none_select_bins(self):
        req = FilteredQueryRequest(namespace="ns")
        assert req.select_bins is None


class TestFilterConditionBinName:
    """``FilterCondition.bin`` must enforce the same bin-name rules as
    ``selectBins`` and ``RecordWriteRequest.bins`` keys: length 1..15, no
    control characters, no leading/trailing whitespace. The PK placeholder
    sentinel is intentionally short and printable so it passes these rules.
    """

    def test_rejects_empty_bin_name(self):
        with pytest.raises(ValidationError):
            FilterCondition(bin="", operator=FilterOperator.EQ, value="x")

    def test_rejects_oversized_bin_name(self):
        with pytest.raises(ValidationError):
            FilterCondition(bin="x" * 20, operator=FilterOperator.EQ, value="x")

    def test_accepts_max_length_boundary(self):
        cond = FilterCondition(bin="x" * 15, operator=FilterOperator.EQ, value="x")
        assert cond.bin == "x" * 15

    def test_rejects_control_character_bin_name(self):
        with pytest.raises(ValidationError):
            FilterCondition(bin="bad\x00name", operator=FilterOperator.EQ, value="x")

    def test_rejects_del_character_bin_name(self):
        with pytest.raises(ValidationError):
            FilterCondition(bin="bad\x7fname", operator=FilterOperator.EQ, value="x")

    def test_rejects_leading_whitespace_bin_name(self):
        with pytest.raises(ValidationError):
            FilterCondition(bin=" bin", operator=FilterOperator.EQ, value="x")

    def test_rejects_trailing_whitespace_bin_name(self):
        with pytest.raises(ValidationError):
            FilterCondition(bin="bin ", operator=FilterOperator.EQ, value="x")

    def test_accepts_valid_bin_name(self):
        cond = FilterCondition(bin="age", operator=FilterOperator.GT, value=18)
        assert cond.bin == "age"

    def test_pk_placeholder_still_accepted(self):
        # PK placeholder must pass bin-name validation so PK operators keep
        # working after the new control-char / whitespace rule.
        cond = FilterCondition(
            bin=PK_BIN_PLACEHOLDER,
            operator=FilterOperator.PK_PREFIX,
            value="user-",
        )
        assert cond.bin == PK_BIN_PLACEHOLDER
