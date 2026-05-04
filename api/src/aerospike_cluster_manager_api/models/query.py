from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .record import AerospikeRecord, BinValue

# Sentinel bin name reserved for FilterConditions whose operator is PK_PREFIX
# or PK_REGEX. PK operators target exp.key() rather than a bin accessor.
PK_BIN_PLACEHOLDER = "__pk__"


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
    PK_PREFIX = "pk_prefix"
    PK_REGEX = "pk_regex"


# Operators that target the record's primary key via exp.key() rather than a
# bin accessor. The condition's `bin` field is ignored (must be the placeholder).
PK_OPERATORS: frozenset[FilterOperator] = frozenset({FilterOperator.PK_PREFIX, FilterOperator.PK_REGEX})


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

    @model_validator(mode="after")
    def _validate_pk_operator_pairing(self) -> FilterCondition:
        is_pk_op = self.operator in PK_OPERATORS
        is_pk_bin = self.bin == PK_BIN_PLACEHOLDER

        if is_pk_op and not is_pk_bin:
            raise ValueError(
                f"PK operator {self.operator.value!r} requires bin={PK_BIN_PLACEHOLDER!r}; got bin={self.bin!r}"
            )
        if is_pk_bin and not is_pk_op:
            allowed = sorted(o.value for o in PK_OPERATORS)
            raise ValueError(
                f"bin={PK_BIN_PLACEHOLDER!r} is reserved for PK operators ({allowed}); "
                f"got operator={self.operator.value!r}"
            )
        if is_pk_op and not isinstance(self.value, str):
            raise ValueError(
                f"PK operator {self.operator.value!r} requires a string value; got {type(self.value).__name__}"
            )
        return self


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
    # Canonical PK search field; primary_key kept for backward compatibility.
    pk_pattern: str | None = Field(default=None, max_length=4096, alias="pkPattern")
    pk_match_mode: Literal["exact", "prefix", "regex"] = Field(default="exact", alias="pkMatchMode")

    @model_validator(mode="after")
    def _validate_pk_fields(self) -> FilteredQueryRequest:
        # Disallow ambiguous request shapes where the legacy and canonical
        # PK fields disagree, or where mode and pattern presence are out
        # of sync. The router's `pk_pattern or primary_key` precedence
        # would otherwise silently pick a winner.
        if self.pk_pattern is not None and self.primary_key is not None:
            raise ValueError("Provide either pk_pattern or primary_key, not both")
        if self.primary_key is not None and self.pk_match_mode != "exact":
            raise ValueError("Legacy primary_key only supports pk_match_mode='exact'; use pk_pattern for prefix/regex")
        if self.pk_match_mode != "exact":
            pattern = self.pk_pattern
            if pattern is None or pattern.strip() == "":
                raise ValueError(f"pk_match_mode={self.pk_match_mode!r} requires a non-empty pk_pattern")
        return self


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
