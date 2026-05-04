"""Build aerospike-py expression dicts from FilterCondition models."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import Literal

from aerospike_py import exp

from aerospike_cluster_manager_api.models.query import (
    BinDataType,
    FilterCondition,
    FilterGroup,
    FilterOperator,
)

# POSIX REG_ICASE — case-insensitive matching. aerospike-py forwards the int
# straight to the server's POSIX regex engine.
REGEX_FLAG_ICASE = 2


class InvalidPkPatternError(ValueError):
    """Raised when a user-supplied PK regex/prefix pattern is malformed."""


def _validate_pattern(pattern: str) -> None:
    """Catch the common syntactic regex errors (unbalanced brackets / parens,
    dangling quantifiers) before the pattern reaches the server. Python's
    regex grammar is more permissive than POSIX in places, but rejecting
    the structural majority on the API side beats letting the user see an
    empty result with no signal that their pattern was the problem."""
    try:
        re.compile(pattern)
    except re.error as e:
        raise InvalidPkPatternError(f"Invalid regex pattern: {e}") from e


def _bin_accessor(bin_name: str, bin_type: BinDataType) -> dict:
    """Return the correct typed bin accessor expression."""
    accessors = {
        BinDataType.INTEGER: exp.int_bin,
        BinDataType.FLOAT: exp.float_bin,
        BinDataType.STRING: exp.string_bin,
        BinDataType.BOOL: exp.bool_bin,
        BinDataType.GEO: exp.geo_bin,
        BinDataType.LIST: exp.list_bin,
        BinDataType.MAP: exp.map_bin,
    }
    return accessors[bin_type](bin_name)


def _val_accessor(value: object, bin_type: BinDataType) -> dict:
    """Return the correct typed value expression."""
    if bin_type == BinDataType.INTEGER:
        return exp.int_val(int(value))  # type: ignore[arg-type]
    if bin_type == BinDataType.FLOAT:
        return exp.float_val(float(value))  # type: ignore[arg-type]
    if bin_type == BinDataType.STRING:
        return exp.string_val(str(value))
    if bin_type == BinDataType.BOOL:
        return exp.bool_val(bool(value))
    if bin_type == BinDataType.GEO:
        geo_str = value if isinstance(value, str) else json.dumps(value)
        return exp.geo_val(geo_str)
    # LIST / MAP — fall back to string representation
    return exp.string_val(str(value))


# Mapping from simple comparison operators to exp helpers
_CMP_OPS: dict[FilterOperator, Callable[..., dict]] = {
    FilterOperator.EQ: exp.eq,
    FilterOperator.NE: exp.ne,
    FilterOperator.GT: exp.gt,
    FilterOperator.GE: exp.ge,
    FilterOperator.LT: exp.lt,
    FilterOperator.LE: exp.le,
}


def _build_condition(cond: FilterCondition) -> dict:
    """Convert a single FilterCondition into an expression dict."""
    op = cond.operator
    bin_name = cond.bin
    bin_type = cond.bin_type

    # Simple comparison operators
    if op in _CMP_OPS:
        cmp_fn = _CMP_OPS[op]
        return cmp_fn(_bin_accessor(bin_name, bin_type), _val_accessor(cond.value, bin_type))

    if op == FilterOperator.BETWEEN:
        return exp.and_(
            exp.ge(_bin_accessor(bin_name, bin_type), _val_accessor(cond.value, bin_type)),
            exp.le(_bin_accessor(bin_name, bin_type), _val_accessor(cond.value2, bin_type)),
        )

    if op == FilterOperator.CONTAINS:
        pattern = f".*{re.escape(str(cond.value))}.*"
        return exp.regex_compare(pattern, REGEX_FLAG_ICASE, exp.string_bin(bin_name))

    if op == FilterOperator.NOT_CONTAINS:
        pattern = f".*{re.escape(str(cond.value))}.*"
        return exp.not_(exp.regex_compare(pattern, REGEX_FLAG_ICASE, exp.string_bin(bin_name)))

    if op == FilterOperator.REGEX:
        regex = str(cond.value)
        _validate_pattern(regex)
        return exp.regex_compare(regex, REGEX_FLAG_ICASE, exp.string_bin(bin_name))

    if op == FilterOperator.PK_PREFIX:
        return build_pk_filter_expression(str(cond.value), "prefix")

    if op == FilterOperator.PK_REGEX:
        return build_pk_filter_expression(str(cond.value), "regex")

    if op == FilterOperator.EXISTS:
        return exp.bin_exists(bin_name)

    if op == FilterOperator.NOT_EXISTS:
        return exp.not_(exp.bin_exists(bin_name))

    if op == FilterOperator.IS_TRUE:
        return exp.eq(exp.bool_bin(bin_name), exp.bool_val(True))

    if op == FilterOperator.IS_FALSE:
        return exp.eq(exp.bool_bin(bin_name), exp.bool_val(False))

    if op in {FilterOperator.GEO_WITHIN, FilterOperator.GEO_CONTAINS}:
        geo_str = cond.value if isinstance(cond.value, str) else json.dumps(cond.value)
        return exp.geo_compare(exp.geo_bin(bin_name), exp.geo_val(geo_str))

    raise ValueError(f"Unknown filter operator: {op}")


def build_expression(group: FilterGroup) -> dict:
    """Build a complete expression dict from a FilterGroup."""
    exprs = [_build_condition(c) for c in group.conditions]

    if len(exprs) == 1:
        return exprs[0]

    if group.logic == "and":
        return exp.and_(*exprs)
    return exp.or_(*exprs)


def build_pk_filter_expression(pattern: str, mode: Literal["prefix", "regex"]) -> dict:
    """Build a regex_compare expression that matches against the record's
    primary key (user key) instead of a bin.

    Notes:
    - PK is digest-indexed in Aerospike — this expression runs as a server-side
      filter over a full set scan. There is no PK B-tree prefix index.
    - Records written without ``POLICY_KEY_SEND`` do not store the user key
      and therefore never match.
    - ``prefix`` mode escapes the pattern and anchors with ``^``. ``regex``
      mode passes the pattern through verbatim.
    """
    if mode == "prefix":
        # re.escape produces a known-valid pattern; no validation needed.
        regex_pattern = f"^{re.escape(pattern)}.*"
    elif mode == "regex":
        _validate_pattern(pattern)
        regex_pattern = pattern
    else:
        raise ValueError(f"Unsupported PK match mode: {mode!r}")

    return exp.regex_compare(
        regex_pattern,
        REGEX_FLAG_ICASE,
        exp.key(exp.EXP_TYPE_STRING),
    )
