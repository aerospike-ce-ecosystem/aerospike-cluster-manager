from __future__ import annotations

from collections.abc import Iterable
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

BinValue = Any

# Aerospike bin names: ASCII printable, no control chars / whitespace.
# Server enforces max length 15; we reject 0x00-0x1F + 0x7F at the boundary
# so malformed names surface as a 422 rather than an opaque server-side 5xx.
BinName = Annotated[str, Field(min_length=1, max_length=15)]


def _validate_bin_names(value: Iterable[str] | None, *, field_label: str = "bin name") -> None:
    """Reject control chars and leading/trailing whitespace in bin names.

    ``min_length``/``max_length`` are already enforced by the ``BinName``
    annotation; this helper layers in the rules pydantic Field can't express.
    """
    if value is None:
        return
    for name in value:
        if any(ord(c) < 0x20 or ord(c) == 0x7F for c in name):
            raise ValueError(f"{field_label} must not contain control characters: {name!r}")
        if name != name.strip():
            raise ValueError(f"{field_label} must not have leading/trailing whitespace: {name!r}")


class GeoJSON(BaseModel):
    type: str  # "Point" | "Polygon" | "AeroCircle"
    coordinates: list[Any]


class RecordKey(BaseModel):
    namespace: str = Field(min_length=1, max_length=31)
    set: str = Field(default="", max_length=63)
    pk: str = Field(default="", max_length=1024)
    digest: str | None = None


class RecordMeta(BaseModel):
    generation: int = Field(ge=0)
    ttl: int = Field(ge=0)
    lastUpdateMs: int | None = None


class AerospikeRecord(BaseModel):
    key: RecordKey
    meta: RecordMeta
    bins: dict[str, BinValue]
    # Operator-authored memo from cluster-manager metaDB. Null when no note
    # has been attached. Joined in by records_service after the Aerospike
    # read (single batch SQL, not N+1).
    note: str | None = None


class RecordListResponse(BaseModel):
    records: list[AerospikeRecord]
    total: int
    page: int
    pageSize: int
    hasMore: bool
    totalEstimated: bool = False


class RecordWriteRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    key: RecordKey
    # ``BinName`` constrains each dict key's length (1..15). The
    # ``_check_bin_keys`` validator below layers in control-char /
    # whitespace rules that Field cannot express. Together they reject
    # malformed bin names at the API boundary instead of letting them
    # bubble up as an opaque 5xx (e.g. ``BinNameTooLong``) from the
    # Aerospike server. Matches the rules applied to ``selectBins``.
    bins: dict[BinName, BinValue]
    ttl: int | None = None
    # Particle type to use when persisting ``key.pk``. "auto" preserves the
    # legacy heuristic (numeric-string → INTEGER); use "string" to keep digit
    # keys as STRING so subsequent reads can find them.
    pk_type: Literal["auto", "string", "int", "bytes"] = Field(default="auto", alias="pkType")

    @field_validator("bins")
    @classmethod
    def _check_bin_keys(cls, value: dict[str, BinValue]) -> dict[str, BinValue]:
        _validate_bin_names(value.keys(), field_label="bin name")
        return value
