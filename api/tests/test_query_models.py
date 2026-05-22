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
    FilteredQueryRequest,
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
