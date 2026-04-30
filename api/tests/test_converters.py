"""Tests for aerospike_cluster_manager_api.converters module."""

from __future__ import annotations

import pytest
from aerospike_py import Record
from pydantic import ValidationError

from aerospike_cluster_manager_api.converters import record_to_model
from aerospike_cluster_manager_api.models.record import AerospikeRecord


class TestRecordToModel:
    """Tests for the record_to_model converter."""

    def test_full_record(self):
        """Complete key tuple, meta, and bins."""
        rec = Record(
            key=("test", "sample_set", "pk-1", b"\xde\xad\xbe\xef"),
            meta={"gen": 3, "ttl": 86400},
            bins={"name": "Alice", "age": 30, "active": True},
        )

        record = record_to_model(rec)

        assert isinstance(record, AerospikeRecord)
        assert record.key.namespace == "test"
        assert record.key.set == "sample_set"
        assert record.key.pk == "pk-1"
        assert record.key.digest == "deadbeef"
        assert record.meta.generation == 3
        assert record.meta.ttl == 86400
        assert record.bins == {"name": "Alice", "age": 30, "active": True}

    def test_integer_primary_key(self):
        rec = Record(key=("test", "myset", 42, b"\x01\x02"), meta={"gen": 1, "ttl": 0}, bins={"score": 100})

        record = record_to_model(rec)

        assert record.key.pk == "42"

    def test_empty_key_tuple(self):
        """Empty key tuple should raise ValidationError (namespace is required)."""
        rec = Record(key=(), meta={"gen": 1, "ttl": 0}, bins={"x": 1})

        with pytest.raises(ValidationError, match="namespace"):
            record_to_model(rec)

    def test_none_key_tuple(self):
        """None key tuple should raise ValidationError (namespace is required)."""
        rec = Record(key=None, meta={"gen": 1, "ttl": 0}, bins={"x": 1})

        with pytest.raises(ValidationError, match="namespace"):
            record_to_model(rec)

    def test_partial_key_tuple_namespace_only(self):
        rec = Record(key=("test",), meta={"gen": 1, "ttl": 0}, bins={})

        record = record_to_model(rec)

        assert record.key.namespace == "test"
        assert record.key.set == ""
        assert record.key.pk == ""
        assert record.key.digest is None

    def test_partial_key_tuple_namespace_and_set(self):
        rec = Record(key=("test", "myset"), meta={"gen": 1, "ttl": 0}, bins={})

        record = record_to_model(rec)

        assert record.key.namespace == "test"
        assert record.key.set == "myset"
        assert record.key.pk == ""
        assert record.key.digest is None

    def test_partial_key_tuple_no_digest(self):
        rec = Record(key=("test", "myset", "pk-1"), meta={"gen": 1, "ttl": 0}, bins={})

        record = record_to_model(rec)

        assert record.key.namespace == "test"
        assert record.key.set == "myset"
        assert record.key.pk == "pk-1"
        assert record.key.digest is None

    def test_none_meta(self):
        """None meta dict should default to gen=0, ttl=0."""
        rec = Record(key=("test", "myset", "pk-1", b"\x00"), meta=None, bins={"a": 1})

        record = record_to_model(rec)

        assert record.meta.generation == 0
        assert record.meta.ttl == 0

    def test_none_bins(self):
        """None bins dict should result in empty bins."""
        rec = Record(key=("test", "myset", "pk-1", b"\x00"), meta={"gen": 2, "ttl": 100}, bins=None)

        record = record_to_model(rec)

        assert record.bins == {}

    def test_none_meta_and_bins(self):
        rec = Record(key=("test", "myset", "pk-1", b"\x00"), meta=None, bins=None)

        record = record_to_model(rec)

        assert record.meta.generation == 0
        assert record.meta.ttl == 0
        assert record.bins == {}

    def test_none_set_name_becomes_empty_string(self):
        """When set name is None in key tuple, it should become ''."""
        rec = Record(key=("test", None, "pk-1", b"\x00"), meta={"gen": 1, "ttl": 0}, bins={})

        record = record_to_model(rec)

        assert record.key.set == ""

    def test_none_primary_key(self):
        """When pk is None in key tuple, it should become ''."""
        rec = Record(key=("test", "myset", None, b"\x00"), meta={"gen": 1, "ttl": 0}, bins={})

        record = record_to_model(rec)

        assert record.key.pk == ""

    def test_bytearray_digest(self):
        """bytearray digest should be hex-encoded the same as bytes."""
        rec = Record(key=("test", "myset", "pk-1", bytearray(b"\xca\xfe")), meta={"gen": 1, "ttl": 0}, bins={})

        record = record_to_model(rec)

        assert record.key.digest == "cafe"

    def test_non_bytes_digest_becomes_none(self):
        """If the digest field is not bytes/bytearray, digest should be None."""
        rec = Record(key=("test", "myset", "pk-1", "not-bytes"), meta={"gen": 1, "ttl": 0}, bins={})

        record = record_to_model(rec)

        assert record.key.digest is None

    def test_complex_bin_values(self):
        """Bins can contain lists, dicts, GeoJSON, etc."""
        rec = Record(
            key=("test", "myset", "pk-1", b"\x00"),
            meta={"gen": 1, "ttl": 0},
            bins={
                "tags": ["python", "aerospike"],
                "metadata": {"source": "import", "version": 2},
                "location": {"type": "Point", "coordinates": [127.0, 37.5]},
                "score": 3.14,
            },
        )

        record = record_to_model(rec)

        assert record.bins["tags"] == ["python", "aerospike"]
        assert record.bins["metadata"]["source"] == "import"
        assert record.bins["score"] == 3.14

    def test_empty_bins(self):
        rec = Record(key=("test", "myset", "pk-1", b"\x00"), meta={"gen": 5, "ttl": 300}, bins={})

        record = record_to_model(rec)

        assert record.bins == {}

    def test_meta_missing_gen_key(self):
        """Meta dict without 'gen' key should default to 0."""
        rec = Record(key=("test", "myset", "pk-1", b"\x00"), meta={"ttl": 100}, bins={"x": 1})

        record = record_to_model(rec)

        assert record.meta.generation == 0
        assert record.meta.ttl == 100

    def test_meta_missing_ttl_key(self):
        """Meta dict without 'ttl' key should default to 0."""
        rec = Record(key=("test", "myset", "pk-1", b"\x00"), meta={"gen": 5}, bins={"x": 1})

        record = record_to_model(rec)

        assert record.meta.generation == 5
        assert record.meta.ttl == 0

    def test_record_serializable(self):
        """The returned record should be JSON-serializable via Pydantic."""
        rec = Record(
            key=("test", "myset", "pk-1", b"\xab\xcd"), meta={"gen": 2, "ttl": 500}, bins={"name": "Bob", "count": 10}
        )
        record = record_to_model(rec)
        data = record.model_dump()

        assert data["key"]["namespace"] == "test"
        assert data["key"]["digest"] == "abcd"
        assert data["meta"]["generation"] == 2
        assert data["bins"]["name"] == "Bob"
