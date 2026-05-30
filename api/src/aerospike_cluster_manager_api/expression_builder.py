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


class InvalidFilterValueError(ValueError):
    """Raised when a filter condition's value is missing or type-incompatible.

    ``FilterCondition.value`` / ``value2`` are typed ``BinValue | None``
    (``BinValue`` is ``Any``), so pydantic accepts a request that omits a
    value or supplies one that cannot be coerced to the declared
    ``bin_type`` (e.g. ``binType=integer`` with ``value="abc"`` or no
    ``value`` at all). Without this guard the raw ``int()``/``float()``
    ``TypeError``/``ValueError`` escaped to the generic 500 handler; the
    HTTP boundary catches this subclass and maps it to a 400 instead.
    """


# Hard cap on user-supplied regex length. 256 is comfortably above any
# legitimate PK / bin pattern we've seen, well below the size at which
# pathological backtracking becomes feasible.
_MAX_REGEX_PATTERN_LENGTH = 256

# String spellings accepted for a ``bin_type=bool`` filter value. JSON clients
# routinely send booleans as strings ("false", "0"), and the naive ``bool(str)``
# coercion treats every non-empty string as ``True`` — so ``value="false"``
# would silently build a filter matching ``True``. Parse explicitly instead.
_BOOL_TRUE_STRINGS = frozenset({"true", "1", "yes", "on"})
_BOOL_FALSE_STRINGS = frozenset({"false", "0", "no", "off"})


def _coerce_bool(value: object) -> bool:
    """Coerce a filter value to ``bool`` without the ``bool(str)`` footgun.

    ``bool("false")`` and ``bool("0")`` are both ``True`` in Python because
    any non-empty string is truthy. A filter for a boolean bin equal to
    ``false`` is commonly sent over JSON as the string ``"false"`` (or
    ``"0"``), so the naive coercion silently inverts the user's intent.

    Rules:
        - genuine ``bool`` → returned as-is.
        - ``int`` / ``float`` → standard truthiness (``0`` → ``False``).
        - ``str`` → parsed case-insensitively against the known true/false
          spellings; anything else raises :class:`InvalidFilterValueError`.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, int | float):
        return bool(value)
    if isinstance(value, str):
        token = value.strip().lower()
        if token in _BOOL_TRUE_STRINGS:
            return True
        if token in _BOOL_FALSE_STRINGS:
            return False
    raise InvalidFilterValueError(f"Filter value {value!r} is not a valid boolean")


# Heuristic detector for the classic "evil regex" shapes that drive
# catastrophic backtracking in Python's ``re`` engine: a quantifier
# wrapped in a quantified group, e.g. ``(a+)+``, ``(a*)*``, ``(a?)+``,
# ``(.+)+`` etc. We can't catch every pathological pattern this way, but
# the structural majority of accidental ReDoS payloads land on this
# shape and the rejection is cheap.
_REDOS_NESTED_QUANTIFIER_RE = re.compile(r"\([^()]*[+*?][^()]*\)\s*[+*?{]")


def _validate_pattern(pattern: str) -> None:
    """Catch the common syntactic regex errors (unbalanced brackets / parens,
    dangling quantifiers) before the pattern reaches the server. Python's
    regex grammar is more permissive than POSIX in places, but rejecting
    the structural majority on the API side beats letting the user see an
    empty result with no signal that their pattern was the problem.

    Also rejects patterns that exceed
    :data:`_MAX_REGEX_PATTERN_LENGTH` or match the nested-quantifier
    heuristic in :data:`_REDOS_NESTED_QUANTIFIER_RE` -- a coarse but
    cheap ReDoS guard. Python's ``re`` cannot be safely interrupted
    once compilation/matching has started, so structural rejection is
    the only viable defence at this layer.
    """
    if len(pattern) > _MAX_REGEX_PATTERN_LENGTH:
        raise InvalidPkPatternError(f"Regex pattern is too long ({len(pattern)} > {_MAX_REGEX_PATTERN_LENGTH})")
    if _REDOS_NESTED_QUANTIFIER_RE.search(pattern):
        raise InvalidPkPatternError(
            "Regex pattern contains a nested quantifier shape "
            "(e.g. (...+)+, (...*)+, (...?)+) that can trigger catastrophic backtracking"
        )
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
    """Return the correct typed value expression.

    Raises :class:`InvalidFilterValueError` when ``value`` is ``None`` or
    cannot be coerced to a numeric ``bin_type`` — the request-model layer
    permits ``BinValue | None`` so the type mismatch is a 400-class user
    error, not a server fault.
    """
    if value is None:
        raise InvalidFilterValueError(f"Filter value is required for bin_type={bin_type.value!r}")
    if bin_type == BinDataType.INTEGER:
        try:
            return exp.int_val(int(value))  # type: ignore[arg-type]
        except (TypeError, ValueError) as exc:
            raise InvalidFilterValueError(f"Filter value {value!r} is not a valid integer") from exc
    if bin_type == BinDataType.FLOAT:
        try:
            return exp.float_val(float(value))  # type: ignore[arg-type]
        except (TypeError, ValueError) as exc:
            raise InvalidFilterValueError(f"Filter value {value!r} is not a valid float") from exc
    if bin_type == BinDataType.STRING:
        return exp.string_val(str(value))
    if bin_type == BinDataType.BOOL:
        return exp.bool_val(_coerce_bool(value))
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
        if cond.value is None or cond.value2 is None:
            raise InvalidFilterValueError("BETWEEN requires both 'value' (lower bound) and 'value2' (upper bound)")
        return exp.and_(
            exp.ge(_bin_accessor(bin_name, bin_type), _val_accessor(cond.value, bin_type)),
            exp.le(_bin_accessor(bin_name, bin_type), _val_accessor(cond.value2, bin_type)),
        )

    if op == FilterOperator.CONTAINS:
        if cond.value is None:
            raise InvalidFilterValueError(f"Operator {op.value!r} requires a 'value'")
        pattern = f".*{re.escape(str(cond.value))}.*"
        return exp.regex_compare(pattern, REGEX_FLAG_ICASE, exp.string_bin(bin_name))

    if op == FilterOperator.NOT_CONTAINS:
        if cond.value is None:
            raise InvalidFilterValueError(f"Operator {op.value!r} requires a 'value'")
        pattern = f".*{re.escape(str(cond.value))}.*"
        return exp.not_(exp.regex_compare(pattern, REGEX_FLAG_ICASE, exp.string_bin(bin_name)))

    if op == FilterOperator.REGEX:
        if cond.value is None:
            raise InvalidFilterValueError(f"Operator {op.value!r} requires a 'value'")
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
