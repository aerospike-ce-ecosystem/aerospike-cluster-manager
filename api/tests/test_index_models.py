"""Validation tests for ``CreateIndexRequest.bin``.

The ``bin`` field must enforce the same rules as ``FilterCondition.bin`` and
``RecordWriteRequest.bins`` keys: length 1..15, no control characters, no
leading/trailing whitespace. Otherwise malformed names round-trip to
Aerospike and surface as opaque server-side 5xxs (e.g. ``BinNameTooLong``)
instead of a clean 422 at the API boundary.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from aerospike_cluster_manager_api.models.index import CreateIndexRequest


class TestCreateIndexRequestBinValidation:
    def _base_kwargs(self, **overrides: object) -> dict[str, object]:
        kwargs: dict[str, object] = {
            "namespace": "test",
            "set": "users",
            "bin": "email",
            "name": "idx_users_email",
            "type": "string",
        }
        kwargs.update(overrides)
        return kwargs

    def test_rejects_empty_bin_name(self):
        with pytest.raises(ValidationError):
            CreateIndexRequest(**self._base_kwargs(bin=""))

    def test_rejects_oversized_bin_name(self):
        with pytest.raises(ValidationError):
            CreateIndexRequest(**self._base_kwargs(bin="x" * 20))

    def test_accepts_max_length_boundary(self):
        req = CreateIndexRequest(**self._base_kwargs(bin="x" * 15))
        assert req.bin == "x" * 15

    def test_rejects_control_character_bin_name(self):
        with pytest.raises(ValidationError):
            CreateIndexRequest(**self._base_kwargs(bin="bad\x00name"))

    def test_rejects_del_character_bin_name(self):
        with pytest.raises(ValidationError):
            CreateIndexRequest(**self._base_kwargs(bin="bad\x7fname"))

    def test_rejects_leading_whitespace_bin_name(self):
        with pytest.raises(ValidationError):
            CreateIndexRequest(**self._base_kwargs(bin=" email"))

    def test_rejects_trailing_whitespace_bin_name(self):
        with pytest.raises(ValidationError):
            CreateIndexRequest(**self._base_kwargs(bin="email "))

    def test_accepts_valid_bin_name(self):
        req = CreateIndexRequest(**self._base_kwargs(bin="email"))
        assert req.bin == "email"
