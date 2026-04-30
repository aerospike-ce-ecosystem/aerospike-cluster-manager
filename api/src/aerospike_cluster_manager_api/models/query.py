from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .record import AerospikeRecord, BinValue


class QueryPredicate(BaseModel):
    bin: str = Field(min_length=1, max_length=15)
    operator: Literal["equals", "between", "contains", "geo_within_region", "geo_contains_point"]
    value: BinValue
    value2: BinValue | None = None


class QueryRequest(BaseModel):
    namespace: str = Field(min_length=1, max_length=31)
    set: str | None = Field(default=None, max_length=63)
    predicate: QueryPredicate | None = None
    selectBins: list[str] | None = None
    expression: str | None = Field(default=None, max_length=4096)
    maxRecords: int | None = Field(default=None, ge=1, le=1_000_000)
    primaryKey: str | None = Field(default=None, max_length=1024)
    # Particle type for primaryKey resolution. "auto" retries alternate type on NOT_FOUND.
    pkType: Literal["auto", "string", "int", "bytes"] = "auto"


class QueryResponse(BaseModel):
    records: list[AerospikeRecord]
    executionTimeMs: int = Field(ge=0)
    scannedRecords: int = Field(ge=0)
    returnedRecords: int = Field(ge=0)


# ---------------------------------------------------------------------------
# Filter system models
# ---------------------------------------------------------------------------


class FilterOperator(StrEnum):
    EQ = "eq"
    NE = "ne"
    GT = "gt"
    GE = "ge"
    LT = "lt"
    LE = "le"
    BETWEEN = "between"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    REGEX = "regex"
    EXISTS = "exists"
    NOT_EXISTS = "not_exists"
    IS_TRUE = "is_true"
    IS_FALSE = "is_false"
    GEO_WITHIN = "geo_within"
    GEO_CONTAINS = "geo_contains"


class BinDataType(StrEnum):
    INTEGER = "integer"
    FLOAT = "float"
    STRING = "string"
    BOOL = "bool"
    LIST = "list"
    MAP = "map"
    GEO = "geo"


class FilterCondition(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    bin: str = Field(min_length=1, max_length=15)
    operator: FilterOperator
    value: BinValue | None = None
    value2: BinValue | None = None
    bin_type: BinDataType = Field(default=BinDataType.STRING, alias="binType")


class FilterGroup(BaseModel):
    logic: Literal["and", "or"] = "and"
    conditions: list[FilterCondition] = Field(min_length=1, max_length=20)


class FilteredQueryRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    namespace: str = Field(min_length=1, max_length=31)
    set: str | None = Field(default=None, max_length=63)
    filters: FilterGroup | None = None
    predicate: QueryPredicate | None = None
    select_bins: list[str] | None = Field(default=None, alias="selectBins")
    max_records: int | None = Field(default=None, ge=1, le=1_000_000, alias="maxRecords")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=25, ge=1, le=500, alias="pageSize")
    primary_key: str | None = Field(default=None, max_length=1024, alias="primaryKey")
    # Particle type for primary_key resolution. "auto" retries alternate type on NOT_FOUND.
    pk_type: Literal["auto", "string", "int", "bytes"] = Field(default="auto", alias="pkType")


class FilteredQueryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    records: list[AerospikeRecord]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, alias="pageSize")
    has_more: bool = Field(alias="hasMore")
    execution_time_ms: int = Field(ge=0, alias="executionTimeMs")
    scanned_records: int = Field(ge=0, alias="scannedRecords")
    returned_records: int = Field(ge=0, alias="returnedRecords")
    total_estimated: bool = Field(default=False, alias="totalEstimated")
