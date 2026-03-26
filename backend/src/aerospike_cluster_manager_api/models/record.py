from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

BinValue = Any


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


class RecordListResponse(BaseModel):
    records: list[AerospikeRecord]
    total: int
    page: int
    pageSize: int
    hasMore: bool
    totalEstimated: bool = False


class RecordWriteRequest(BaseModel):
    key: RecordKey
    bins: dict[str, BinValue]
    ttl: int | None = None
