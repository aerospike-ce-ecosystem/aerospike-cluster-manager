"""Build aerospike-py expression dicts from FilterCondition models."""

from __future__ import annotations

import json
import re
from collections.abc import Callable

from aerospike_py import exp

from aerospike_cluster_manager_api.models.query import (
    BinDataType,
    FilterCondition,
    FilterGroup,
    FilterOperator,
)


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
        return exp.regex_compare(pattern, 2, exp.string_bin(bin_name))

    if op == FilterOperator.NOT_CONTAINS:
        pattern = f".*{re.escape(str(cond.value))}.*"
        return exp.not_(exp.regex_compare(pattern, 2, exp.string_bin(bin_name)))

    if op == FilterOperator.REGEX:
        return exp.regex_compare(str(cond.value), 2, exp.string_bin(bin_name))

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
