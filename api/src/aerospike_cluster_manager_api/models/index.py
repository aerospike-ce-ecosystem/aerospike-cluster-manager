from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from aerospike_cluster_manager_api.constants import INFO_NAME_ARG_PATTERN, INFO_NS_ARG_PATTERN

from .record import BinName, _validate_bin_names


class SecondaryIndex(BaseModel):
    name: str
    namespace: str
    set: str
    bin: str
    type: Literal["numeric", "string", "geo2dsphere"]
    state: Literal["ready", "building", "error"]


class CreateIndexRequest(BaseModel):
    # ``namespace``/``set``/``name`` are interpolated into the
    # ``sindex-create:namespace=..;set=..;indexname=..`` info command, and
    # aerospike-core joins the commands it sends with ``\n``. The patterns
    # keep a chained second command out of that frame (same boundary as the
    # namespace builders in ``constants``).
    namespace: str = Field(min_length=1, max_length=31, pattern=INFO_NS_ARG_PATTERN)
    set: str = Field(min_length=1, max_length=63, pattern=INFO_NAME_ARG_PATTERN)
    # ``BinName`` enforces length 1..15; the ``_check_bin_name`` validator
    # below layers in control-char / whitespace rules so malformed names
    # surface as a 422 rather than an opaque server-side 5xx (e.g.
    # ``BinNameTooLong``). Matches ``FilterCondition.bin`` / ``selectBins`` /
    # ``RecordWriteRequest.bins``.
    bin: BinName
    name: str = Field(min_length=1, max_length=255, pattern=INFO_NAME_ARG_PATTERN)
    type: Literal["numeric", "string", "geo2dsphere"]

    @field_validator("bin")
    @classmethod
    def _check_bin_name(cls, value: str) -> str:
        _validate_bin_names([value], field_label="bin name")
        return value
