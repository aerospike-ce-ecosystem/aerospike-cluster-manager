"""Shared predicate-builder — HTTP-free domain logic.

This module is the single source of truth for translating a
:class:`~aerospike_cluster_manager_api.models.query.QueryPredicate` into
the predicate tuple aerospike-py expects on a query's ``where`` clause.

Design rules:

* Must not import ``fastapi`` or any HTTP-shaping libraries — service
  callers (``query_service``, ``records_service``) share the same code.
* Unknown operators surface as :class:`UnknownPredicateOperator` (a
  :class:`ValueError` subclass). The records and query routers catch
  ``PredicateError`` / ``ValueError`` at the HTTP boundary and re-raise
  as :class:`fastapi.HTTPException` with status 400.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from aerospike_cluster_manager_api.models.query import QueryPredicate


class PredicateError(ValueError):
    """Base class for all client-side predicate-construction failures.

    A :class:`ValueError` subclass so HTTP-boundary callers that already
    catch ``ValueError`` keep working; callers that want to handle every
    predicate failure in one ``except`` can target this base directly.
    """


class UnknownPredicateOperator(PredicateError):
    """Raised when a :class:`QueryPredicate` carries an unrecognised operator.

    The pydantic model enumerates the supported operators in its
    ``Literal``, so this should only fire when a future operator is added
    to the schema before the dispatch table here is updated — defensive
    rather than load-bearing.
    """

    def __init__(self, operator: str) -> None:
        super().__init__(f"Unknown predicate operator: {operator}")
        self.operator = operator


class InvalidPredicateValue(PredicateError):
    """Raised when a :class:`QueryPredicate` is missing a required value.

    ``QueryPredicate.value`` is typed ``BinValue`` (``BinValue`` is
    ``Any``) and ``value2`` defaults to ``None``, so pydantic accepts a
    request that omits a value entirely or supplies a ``between`` without
    an upper bound. The aerospike-py ``predicates.*`` builders then choke
    on the ``None`` and the raw ``TypeError`` escaped to the generic 500
    handler. The HTTP boundary catches this :class:`ValueError` subclass
    and maps it to a 400 instead.
    """


def build_predicate(pred: QueryPredicate) -> tuple[Any, ...]:
    """Convert a :class:`QueryPredicate` into an Aerospike predicate tuple.

    Used by both ``services.query_service`` and ``services.records_service``
    via ``q.where(build_predicate(...))``.

    Raises:
        UnknownPredicateOperator: ``pred.operator`` is not in the dispatch
            table. The records / query routers translate this to status
            400 at the HTTP boundary.
        InvalidPredicateValue: a required ``value`` (or ``value2`` for
            ``between``) is missing. Also a :class:`ValueError`, so the
            HTTP boundary maps it to 400.
    """
    from aerospike_py import INDEX_TYPE_LIST, predicates

    op = pred.operator
    # Every supported operator needs a non-None ``value``; ``between`` also
    # needs a non-None ``value2``. Validate here so a missing bound surfaces
    # as a clean 400 instead of an opaque 500 from the aerospike-py builder.
    if pred.value is None:
        raise InvalidPredicateValue(f"predicate operator {op!r} requires a 'value'")
    if op == "equals":
        return predicates.equals(pred.bin, pred.value)
    if op == "between":
        if pred.value2 is None:
            raise InvalidPredicateValue("predicate operator 'between' requires both 'value' and 'value2'")
        return predicates.between(pred.bin, pred.value, pred.value2)
    if op == "contains":
        return predicates.contains(pred.bin, INDEX_TYPE_LIST, pred.value)
    if op in ("geo_within_region", "geo_contains_point"):
        # ``value`` must be GeoJSON: a str (already-serialised GeoJSON) or a
        # dict/list that ``json.dumps`` can turn into one. Anything else (e.g.
        # an int) serialises to a non-GeoJSON scalar like ``"5"`` that the
        # aerospike-py builder rejects as an opaque 500; reject it here as 400.
        if not isinstance(pred.value, str | dict | list):
            raise InvalidPredicateValue(
                f"predicate operator {op!r} requires a GeoJSON 'value' (str, dict, or list); "
                f"got {type(pred.value).__name__}"
            )
        geo = pred.value if isinstance(pred.value, str) else json.dumps(pred.value)
        if op == "geo_within_region":
            return predicates.geo_within_geojson_region(pred.bin, geo)
        return predicates.geo_contains_geojson_point(pred.bin, geo)
    raise UnknownPredicateOperator(op)
