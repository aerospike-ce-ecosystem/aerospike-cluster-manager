from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .record import BinName, _validate_bin_names


class SecondaryIndex(BaseModel):
    name: str
    namespace: str
    set: str
    bin: str
    type: Literal["numeric", "string", "geo2dsphere"]
    state: Literal["ready", "building", "error"]


class CreateIndexRequest(BaseModel):
    namespace: str = Field(min_length=1, max_length=31)
    set: str = Field(min_length=1, max_length=63)
    # ``BinName`` enforces length 1..15; the ``_check_bin_name`` validator
    # below layers in control-char / whitespace rules so malformed names
    # surface as a 422 rather than an opaque server-side 5xx (e.g.
    # ``BinNameTooLong``). Matches ``FilterCondition.bin`` / ``selectBins`` /
    # ``RecordWriteRequest.bins``.
    bin: BinName
    name: str = Field(min_length=1, max_length=255)
    type: Literal["numeric", "string", "geo2dsphere"]

    @field_validator("bin")
    @classmethod
    def _check_bin_name(cls, value: str) -> str:
        _validate_bin_names([value], field_label="bin name")
        return value
