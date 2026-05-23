"""Validation tests for ``RecordWriteRequest.bins`` keys.

A bin name that is empty, oversized, or contains control characters / leading
or trailing whitespace must be rejected at the model boundary so the HTTP
layer returns a 422 with a clear message instead of an opaque Aerospike
server 5xx (e.g. ``BinNameTooLong``).

Mirrors the rules already applied to ``QueryRequest.selectBins`` /
``FilteredQueryRequest.select_bins`` (see PR #389, ``test_query_models.py``).
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from aerospike_cluster_manager_api.models.record import RecordKey, RecordWriteRequest


def _key() -> RecordKey:
    return RecordKey(namespace="ns", set="demo", pk="k1")


class TestRecordWriteRequestBinKeys:
    def test_rejects_empty_bin_name_key(self):
        with pytest.raises(ValidationError):
            RecordWriteRequest(key=_key(), bins={"": 1})

    def test_rejects_oversized_bin_name_key(self):
        with pytest.raises(ValidationError):
            RecordWriteRequest(key=_key(), bins={"x" * 20: 1})

    def test_rejects_control_character_bin_name_key(self):
        with pytest.raises(ValidationError):
            RecordWriteRequest(key=_key(), bins={"bad\x00name": 1})

    def test_rejects_del_character_bin_name_key(self):
        with pytest.raises(ValidationError):
            RecordWriteRequest(key=_key(), bins={"bad\x7fname": 1})

    def test_rejects_leading_whitespace_bin_name_key(self):
        with pytest.raises(ValidationError):
            RecordWriteRequest(key=_key(), bins={" name": 1})

    def test_rejects_trailing_whitespace_bin_name_key(self):
        with pytest.raises(ValidationError):
            RecordWriteRequest(key=_key(), bins={"name ": 1})

    def test_rejects_when_any_key_is_invalid(self):
        # Mixed dict: one valid key, one invalid. The whole payload must be
        # rejected rather than silently dropping the bad bin.
        with pytest.raises(ValidationError):
            RecordWriteRequest(key=_key(), bins={"good": 1, "x" * 20: 2})

    def test_accepts_valid_bin_name_keys(self):
        req = RecordWriteRequest(key=_key(), bins={"a": 1, "bin2": "value"})
        assert req.bins == {"a": 1, "bin2": "value"}

    def test_accepts_maximum_length_bin_name_key(self):
        # 15 chars is the server-enforced upper bound; must be accepted.
        name = "x" * 15
        req = RecordWriteRequest(key=_key(), bins={name: 1})
        assert req.bins == {name: 1}

    def test_accepts_via_alias_pk_type(self):
        # populate_by_name=True means alias ``pkType`` should also work and
        # the bin-key validator still runs.
        req = RecordWriteRequest.model_validate(
            {
                "key": {"namespace": "ns", "set": "demo", "pk": "k1"},
                "bins": {"a": 1},
                "pkType": "string",
            }
        )
        assert req.pk_type == "string"
        assert req.bins == {"a": 1}

    def test_rejects_invalid_key_via_model_validate(self):
        with pytest.raises(ValidationError):
            RecordWriteRequest.model_validate(
                {
                    "key": {"namespace": "ns", "set": "demo", "pk": "k1"},
                    "bins": {"x" * 20: 1},
                }
            )
