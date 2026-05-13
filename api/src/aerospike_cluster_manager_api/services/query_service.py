"""Business logic for ad-hoc Aerospike queries.

This module backs the ``POST /query/{conn_id}`` endpoint. It is the single
source of truth for query execution. The HTTP router (``routers/query.py``)
wraps the result in HTTPException translation, FastAPI dependencies, and
``record_to_model`` conversion to the wire-format ``AerospikeRecord``.

To stay reusable from any caller, this module **must not** import ``fastapi``
or other HTTP-shaping libraries. Domain failures are signalled by plain
exceptions defined here, which the router translates to HTTP status codes.

CDT (lists, maps, geojson) bin values are returned as the raw aerospike-py
``Record`` NamedTuple — JSON-safe serialization is intentionally deferred to
the dedicated serializer layer (Phase 1 task A.10), so this module never
mutates bin contents.
"""

from __future__ import annotations

import logging
import time
from typing import Any, NamedTuple

import aerospike_py
from aerospike_py import Record
from aerospike_py.exception import AerospikeError, RecordNotFound

from aerospike_cluster_manager_api.constants import MAX_QUERY_RECORDS, POLICY_QUERY, POLICY_READ
from aerospike_cluster_manager_api.models.query import QueryRequest
from aerospike_cluster_manager_api.pk import (
    PkType,
    SetRequiredForPkLookup,
    get_with_pk_fallback,
    resolve_pk,
)
from aerospike_cluster_manager_api.predicate import build_predicate

logger = logging.getLogger(__name__)


# ``PkType`` and ``SetRequiredForPkLookup`` are re-exported from this module
# for backward compatibility. The canonical home is
# :mod:`aerospike_cluster_manager_api.pk`.
__all__ = [
    "PkType",
    "QueryResult",
    "SetRequiredForPkLookup",
    "execute_query",
]


# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------


class QueryResult(NamedTuple):
    """Outcome of a query/scan call.

    ``records`` is a list of raw aerospike-py ``Record`` NamedTuples. The
    router converts each one via ``converters.record_to_model`` before
    returning to clients; CDT-safe serialization is left to a dedicated
    serializer layer.

    ``scanned_records`` and ``returned_records`` are equal in this layer
    because the underlying aerospike-py scan does not expose an exact count
    distinct from the returned records once ``max_records`` is applied. They
    are kept as separate fields to mirror the wire-format ``QueryResponse``.
    """

    records: list[Record]
    execution_time_ms: int
    scanned_records: int
    returned_records: int


# ---------------------------------------------------------------------------
# Service entry point
# ---------------------------------------------------------------------------


async def execute_query(client: aerospike_py.AsyncClient, body: QueryRequest) -> QueryResult:
    """Execute a query against Aerospike.

    Two execution paths, selected by ``body.primaryKey``:

    1. **PK lookup** — when ``body.primaryKey`` is set. Resolves the PK via
       ``body.pkType`` (``"auto"`` retries the alternate particle type on
       NOT_FOUND so numeric-string keys are resolvable even when the
       heuristic guesses int). Returns at most one record. ``RecordNotFound``
       is treated as an empty result rather than propagating.

    2. **Scan** — when no ``primaryKey``. Optionally applies a predicate
       (legacy secondary-index path) and a ``select_bins`` projection. The
       server-side ``max_records`` policy is capped at ``MAX_QUERY_RECORDS``
       to prevent OOM. Empty/sparse namespaces can make the underlying scan
       raise (aerospike-py issue #259) — those are caught and surfaced as
       an empty result instead of a 500.

    Raises:
        SetRequiredForPkLookup: ``primaryKey`` provided without a ``set``.
        ValueError: explicit ``pkType`` rejected the resolved value.

    Returns:
        ``QueryResult`` with raw aerospike-py ``Record`` NamedTuples. The
        router converts each one via ``record_to_model`` for the wire format.
    """
    start_time = time.monotonic()

    # ---- PK lookup branch -------------------------------------------------
    if body.primaryKey:
        if not body.set:
            raise SetRequiredForPkLookup()

        resolved = resolve_pk(body.primaryKey, body.pkType)
        try:
            raw_record = await get_with_pk_fallback(
                client,
                (body.namespace, body.set, resolved),
                body.primaryKey,
                body.pkType,
                POLICY_READ,
            )
            raw_results: list[Record] = [raw_record]
        except RecordNotFound:
            raw_results = []

        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        return QueryResult(
            records=raw_results,
            execution_time_ms=elapsed_ms,
            scanned_records=len(raw_results),
            returned_records=len(raw_results),
        )

    # ---- Scan branch ------------------------------------------------------
    q = client.query(body.namespace, body.set or "")
    if body.predicate:
        # build_predicate raises ``UnknownPredicateOperator`` (a ``ValueError``)
        # for unknown operators — the HTTP router catches it via
        # ``utils.build_predicate``'s adapter.
        q.where(build_predicate(body.predicate))
    if body.selectBins:
        q.select(*body.selectBins)

    # Apply server-side max_records limit to prevent OOM. With max_records
    # the server stops after returning this many matching records, so
    # scanned_records reflects the returned count (lower bound), not the true
    # number of records examined by the server.
    effective_limit = min(body.maxRecords or MAX_QUERY_RECORDS, MAX_QUERY_RECORDS)
    policy: dict[str, Any] = {**POLICY_QUERY, "max_records": effective_limit}

    # See aerospike-py issue #259: empty / sparse namespaces can make the
    # underlying scan raise. Treat as no records rather than 500.
    try:
        raw_results = await q.results(policy)
    except AerospikeError:
        logger.exception(
            "Query failed for ns=%s set=%s; returning empty result",
            body.namespace,
            body.set,
        )
        raw_results = []

    elapsed_ms = int((time.monotonic() - start_time) * 1000)
    return QueryResult(
        records=raw_results,
        execution_time_ms=elapsed_ms,
        scanned_records=len(raw_results),
        returned_records=len(raw_results),
    )
