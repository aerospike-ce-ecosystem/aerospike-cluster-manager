"""Shared predicate-builder — HTTP-free domain logic.

This module is the single source of truth for translating a
:class:`~aerospike_cluster_manager_api.models.query.QueryPredicate` into
the predicate tuple aerospike-py expects on a query's ``where`` clause.

Design rules:

* Must not import ``fastapi`` or any HTTP-shaping libraries — service
  callers (``query_service``, ``records_service``) share the same code.
* Unknown operators surface as :class:`UnknownPredicateOperator` (a
  :class:`ValueError` subclass). HTTP-boundary callers (``utils.py``)
  catch it and re-raise as :class:`fastapi.HTTPException` with status
  400.

Previously :func:`utils.build_predicate` raised
:class:`fastapi.HTTPException` directly, leaking HTTP coupling into the
service layer (services imported it locally to dodge the issue). This
module fixes the leak.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from aerospike_cluster_manager_api.models.query import QueryPredicate


class UnknownPredicateOperator(ValueError):
    """Raised when a :class:`QueryPredicate` carries an unrecognised operator.

    The pydantic model enumerates the supported operators in its
    ``Literal``, so this should only fire when a future operator is added
    to the schema before the dispatch table here is updated — defensive
    rather than load-bearing.
    """

    def __init__(self, operator: str) -> None:
        super().__init__(f"Unknown predicate operator: {operator}")
        self.operator = operator


def build_predicate(pred: QueryPredicate) -> tuple[Any, ...]:
    """Convert a :class:`QueryPredicate` into an Aerospike predicate tuple.

    Used by both ``services.query_service`` and ``services.records_service``
    via ``q.where(build_predicate(...))``.

    Raises:
        UnknownPredicateOperator: ``pred.operator`` is not in the dispatch
            table. The HTTP boundary translates this to status 400 via
            :func:`utils.build_predicate`.
    """
    from aerospike_py import INDEX_TYPE_LIST, predicates

    op = pred.operator
    if op == "equals":
        return predicates.equals(pred.bin, pred.value)
    if op == "between":
        return predicates.between(pred.bin, pred.value, pred.value2)
    if op == "contains":
        return predicates.contains(pred.bin, INDEX_TYPE_LIST, pred.value)
    if op == "geo_within_region":
        geo = pred.value if isinstance(pred.value, str) else json.dumps(pred.value)
        return predicates.geo_within_geojson_region(pred.bin, geo)
    if op == "geo_contains_point":
        geo = pred.value if isinstance(pred.value, str) else json.dumps(pred.value)
        return predicates.geo_contains_geojson_point(pred.bin, geo)
    raise UnknownPredicateOperator(op)
