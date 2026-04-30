from __future__ import annotations

import logging
import time
from typing import Any, Literal

from aerospike_py.exception import AerospikeError, RecordNotFound
from aerospike_py.types import WriteMeta
from fastapi import APIRouter, HTTPException, Query
from starlette.responses import Response

from aerospike_cluster_manager_api.constants import (
    MAX_QUERY_RECORDS,
    POLICY_QUERY,
    POLICY_READ,
    POLICY_WRITE,
    info_namespace,
    info_sets,
)
from aerospike_cluster_manager_api.converters import record_to_model
from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.expression_builder import build_expression
from aerospike_cluster_manager_api.info_parser import aggregate_node_kv, aggregate_set_records, safe_int
from aerospike_cluster_manager_api.models.query import FilteredQueryRequest, FilteredQueryResponse
from aerospike_cluster_manager_api.models.record import (
    AerospikeRecord,
    RecordListResponse,
    RecordWriteRequest,
)
from aerospike_cluster_manager_api.utils import (
    build_predicate,
    get_with_pk_fallback,
    resolve_pk,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/records", tags=["records"])


async def _get_set_object_count(client: Any, ns: str, set_name: str) -> int:
    """Get the approximate object count for a set via info command.

    Fetches the namespace replication-factor to de-duplicate counts
    across nodes, matching the same approach used in clusters.py.
    """
    if not set_name:
        return 0
    try:
        # Resolve replication factor from namespace info (same pattern as clusters.py)
        ns_all = await client.info_all(info_namespace(ns))
        ns_stats = aggregate_node_kv(ns_all)
        replication_factor = safe_int(ns_stats.get("replication-factor"), 1)

        sets_all = await client.info_all(info_sets(ns))
        agg = aggregate_set_records(sets_all, replication_factor)
        for s in agg:
            if s["name"] == set_name:
                return s["objects"]
    except (AerospikeError, OSError):
        logger.debug("Failed to get set object count for %s.%s", ns, set_name, exc_info=True)
    return 0


@router.get(
    "/{conn_id}",
    summary="List records",
    description="Retrieve records from a namespace and set with a server-side limit.",
)
async def get_records(
    client: AerospikeClient,
    ns: str = Query(..., min_length=1),
    set: str = "",
    pageSize: int = Query(25, ge=1, le=500),
) -> RecordListResponse:
    """Retrieve records from a namespace and set (limited by pageSize).

    Note: if any record in the scan stream contains a particle type the native
    client cannot decode (e.g. PYTHON_BLOB / JAVA_BLOB written by a legacy
    language-specific client — see aerospike-py issue #280), the underlying
    aerospike-core stream is broken at that record and the whole request
    surfaces as HTTP 422 (``RustPanicError``). Per-record skipping is not
    available without an aerospike-core fork.
    """
    set_total = await _get_set_object_count(client, ns, set)

    limit = min(pageSize, MAX_QUERY_RECORDS)
    policy = {**POLICY_QUERY, "max_records": limit}
    q = client.query(ns, set)
    raw_results = await q.results(policy)

    records = [record_to_model(r) for r in raw_results]

    return RecordListResponse(
        records=records,
        total=set_total,
        page=1,
        pageSize=pageSize,
        hasMore=set_total > len(raw_results),
        totalEstimated=True,
    )


@router.get(
    "/{conn_id}/detail",
    summary="Get record detail",
    description="Retrieve a single record identified by namespace, set, and primary key.",
)
async def get_record_detail(
    client: AerospikeClient,
    ns: str = Query(..., min_length=1),
    set: str = Query(...),
    pk: str = Query(..., min_length=1),
    pk_type: Literal["auto", "string", "int", "bytes"] = Query("auto"),
) -> AerospikeRecord:
    """Retrieve a single record identified by namespace, set, and primary key.

    When ``pk_type='auto'`` (default), the lookup falls back to the alternate
    particle type on NOT_FOUND — fixing the case where a numeric-string key
    (e.g. ``"23404907"``) was stored as STRING but would otherwise be probed
    as INTEGER. Pass an explicit ``pk_type`` to disable the fallback.
    """
    resolved = resolve_pk(pk, pk_type)
    raw_result = await get_with_pk_fallback(client, (ns, set, resolved), pk, pk_type, POLICY_READ)
    return record_to_model(raw_result)


@router.post(
    "/{conn_id}",
    status_code=201,
    summary="Create or update record",
    description="Write a record to Aerospike with the specified key, bins, and optional TTL.",
)
async def put_record(body: RecordWriteRequest, client: AerospikeClient) -> AerospikeRecord:
    """Write a record to Aerospike with the specified key, bins, and optional TTL.

    The key's particle type comes from ``body.key.pk_type`` ("auto" by default).
    Writes do not fall back: the resolved type is what gets persisted on disk,
    so callers that care should pass an explicit ``pk_type`` to avoid creating
    a record under a particle type that subsequent reads can't find.
    """
    k = body.key
    if not k.namespace or not k.set or not k.pk:
        raise HTTPException(status_code=400, detail="Missing required key fields: namespace, set, pk")

    key_tuple = (k.namespace, k.set, resolve_pk(k.pk, body.pk_type))

    meta: WriteMeta | None = None
    if body.ttl is not None:
        meta = WriteMeta(ttl=body.ttl)

    await client.put(key_tuple, body.bins, meta=meta, policy=POLICY_WRITE)
    result = await client.get(key_tuple, policy=POLICY_READ)
    return record_to_model(result)


@router.delete(
    "/{conn_id}",
    status_code=204,
    summary="Delete record",
    description="Delete a record identified by namespace, set, and primary key.",
)
async def delete_record(
    client: AerospikeClient,
    ns: str = Query(..., min_length=1),
    set: str = Query(..., min_length=1),
    pk: str = Query(..., min_length=1),
    pk_type: Literal["auto", "string", "int", "bytes"] = Query("auto"),
) -> Response:
    """Delete a record identified by namespace, set, and primary key.

    Deletes do not fall back to the alternate type even in ``auto`` mode: a
    delete that targets the wrong particle type would silently no-op (the
    record at the *other* type stays put), and a fallback could mask that
    fact. Pass an explicit ``pk_type`` to be sure of which record gets removed.
    """
    await client.remove((ns, set, resolve_pk(pk, pk_type)))
    return Response(status_code=204)


@router.post(
    "/{conn_id}/filter",
    summary="Filtered record scan",
    description="Scan records with optional expression filters and pagination.",
)
async def get_filtered_records(
    body: FilteredQueryRequest,
    client: AerospikeClient,
) -> FilteredQueryResponse:
    """Scan records with optional expression filters and pagination."""
    start_time = time.monotonic()

    # PK lookup short-circuit. Falls back to the alternate particle type on
    # NOT_FOUND when pk_type=auto so numeric-string keys (stored as STRING)
    # are still found even though auto's heuristic resolves them as INTEGER.
    if body.primary_key:
        if not body.set:
            raise HTTPException(status_code=400, detail="Set is required for primary key lookup")

        resolved = resolve_pk(body.primary_key, body.pk_type)
        try:
            raw_result = await get_with_pk_fallback(
                client,
                (body.namespace, body.set, resolved),
                body.primary_key,
                body.pk_type,
                POLICY_READ,
            )
            raw_results = [raw_result]
        except RecordNotFound:
            raw_results = []

        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        records = [record_to_model(r) for r in raw_results]
        return FilteredQueryResponse(
            records=records,
            total=len(records),
            page=1,
            pageSize=body.page_size,
            hasMore=False,
            executionTimeMs=elapsed_ms,
            scannedRecords=len(records),
            returnedRecords=len(records),
        )

    # Build query
    q = client.query(body.namespace, body.set or "")

    if body.predicate:
        q.where(build_predicate(body.predicate))

    if body.select_bins:
        q.select(*body.select_bins)

    # Build policy with server-side max_records limit to prevent OOM
    has_filters = body.filters is not None or body.predicate is not None
    effective_limit = min(body.max_records or MAX_QUERY_RECORDS, MAX_QUERY_RECORDS, body.page_size)

    policy: dict[str, Any] = {**POLICY_QUERY, "max_records": effective_limit}
    if body.filters:
        policy["filter_expression"] = build_expression(body.filters)

    raw_results = await q.results(policy)

    elapsed_ms = int((time.monotonic() - start_time) * 1000)
    returned = len(raw_results)

    records = [record_to_model(r) for r in raw_results]

    # Determine total and scanned counts.
    # With server-side max_records, the returned count is capped — it does not
    # reflect the true number of records scanned by the Aerospike server.
    # For unfiltered scans we use the info command to get the real set size.
    if has_filters:
        set_total = returned
        scanned = returned  # lower bound; actual server-side scan may be higher
        total_estimated = False
    else:
        set_total = await _get_set_object_count(client, body.namespace, body.set or "")
        scanned = set_total  # info-based: represents all objects in the set
        total_estimated = True

    return FilteredQueryResponse(
        records=records,
        total=set_total,
        page=1,
        pageSize=body.page_size,
        hasMore=set_total > returned,
        executionTimeMs=elapsed_ms,
        scannedRecords=scanned,
        returnedRecords=returned,
        totalEstimated=total_estimated,
    )
