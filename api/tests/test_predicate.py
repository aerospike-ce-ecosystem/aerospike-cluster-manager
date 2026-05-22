"""Unit tests for the HTTP-free predicate builder.

``predicate.build_predicate`` translates a :class:`QueryPredicate` into the
tuple aerospike-py expects on a query's ``where`` clause. ``QueryPredicate``
permits ``value=None`` (``BinValue`` is ``Any``) and defaults ``value2`` to
``None``, so a request can omit a bound the aerospike-py builder requires.
These tests pin the input-validation contract: a missing value/value2 must
surface as a :class:`PredicateError` (a ``ValueError``) so the HTTP boundary
maps it to a clean 400 instead of an opaque 500.
"""

from __future__ import annotations

import pytest

from aerospike_cluster_manager_api.models.query import QueryPredicate
from aerospike_cluster_manager_api.predicate import (
    InvalidPredicateValue,
    PredicateError,
    build_predicate,
)


class TestBuildPredicateValidation:
    def test_equals_with_value_builds_ok(self):
        pred = QueryPredicate(bin="age", operator="equals", value=30)
        result = build_predicate(pred)
        assert isinstance(result, tuple)

    def test_between_with_both_bounds_builds_ok(self):
        pred = QueryPredicate(bin="age", operator="between", value=10, value2=20)
        result = build_predicate(pred)
        assert isinstance(result, tuple)

    def test_between_missing_value2_raises_predicate_error(self):
        """BETWEEN with no upper bound must raise, not let None reach the
        aerospike-py builder where it becomes an opaque 500."""
        pred = QueryPredicate(bin="age", operator="between", value=10)
        with pytest.raises(InvalidPredicateValue, match="between"):
            build_predicate(pred)

    def test_missing_value_raises_predicate_error(self):
        """An operator with value=None must raise InvalidPredicateValue."""
        pred = QueryPredicate(bin="age", operator="equals", value=None)
        with pytest.raises(InvalidPredicateValue, match="value"):
            build_predicate(pred)

    def test_contains_missing_value_raises_predicate_error(self):
        pred = QueryPredicate(bin="tags", operator="contains", value=None)
        with pytest.raises(InvalidPredicateValue):
            build_predicate(pred)

    def test_predicate_error_is_value_error(self):
        """PredicateError must remain a ValueError subclass so callers that
        catch ValueError (e.g. the query router) keep working."""
        assert issubclass(PredicateError, ValueError)
        assert issubclass(InvalidPredicateValue, PredicateError)
