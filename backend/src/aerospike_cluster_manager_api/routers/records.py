from __future__ import annotations

import logging
import time

from aerospike_py.exception import RecordNotFound
from fastapi import APIRouter, HTTPException, Query
from starlette.responses import Response

from aerospike_cluster_manager_api.constants import MAX_QUERY_RECORDS, POLICY_QUERY, POLICY_READ, POLICY_WRITE
from aerospike_cluster_manager_api.converters import record_to_model
from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.expression_builder import build_expression
from aerospike_cluster_manager_api.models.query import FilteredQueryRequest, FilteredQueryResponse
from aerospike_cluster_manager_api.models.record import (
    AerospikeRecord,
    RecordListResponse,
    RecordWriteRequest,
)
from aerospike_cluster_manager_api.utils import build_predicate

logger = logging.getLogger(__name__)


def _auto_detect_pk(pk: str) -> str | int:
    """Convert PK to int only when the round-trip is lossless (no leading zeros).

    "1"     → 1    (integer key)
    "00001" → "00001"  (string key — leading zeros preserved)
    "-5"    → -5   (negative integer key)
    "abc"   → "abc"  (string key)
    """
    try:
        as_int = int(pk)
        if str(as_int) == pk:
            return as_int
    except ValueError:
        pass
    return pk


router = APIRouter(prefix="/records", tags=["records"])


@router.get(
    "/{conn_id}",
    summary="List records",
    description="Retrieve paginated records from a namespace and set.",
)
async def get_records(
    client: AerospikeClient,
    ns: str = Query(..., min_length=1),
    set: str = "",
    page: int = Query(1, ge=1),
    pageSize: int = Query(25, ge=1, le=500),
) -> RecordListResponse:
    """Retrieve paginated records from a namespace and set."""
    q = client.query(ns, set)
    raw_results = await q.results(POLICY_QUERY)

    if len(raw_results) > MAX_QUERY_RECORDS:
        raw_results = raw_results[:MAX_QUERY_RECORDS]

    total = len(raw_results)
    start = (page - 1) * pageSize
    paged = raw_results[start : start + pageSize]
    records = [record_to_model(r) for r in paged]

    return RecordListResponse(
        records=records,
        total=total,
        page=page,
        pageSize=pageSize,
        hasMore=start + pageSize < total,
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
) -> AerospikeRecord:
    """Retrieve a single record identified by namespace, set, and primary key."""
    raw_result = await client.get((ns, set, _auto_detect_pk(pk)), policy=POLICY_READ)
    return record_to_model(raw_result)


@router.post(
    "/{conn_id}",
    status_code=201,
    summary="Create or update record",
    description="Write a record to Aerospike with the specified key, bins, and optional TTL.",
)
async def put_record(body: RecordWriteRequest, client: AerospikeClient) -> AerospikeRecord:
    """Write a record to Aerospike with the specified key, bins, and optional TTL."""
    k = body.key
    if not k.namespace or not k.set or not k.pk:
        raise HTTPException(status_code=400, detail="Missing required key fields: namespace, set, pk")

    key_tuple = (k.namespace, k.set, _auto_detect_pk(k.pk))

    meta = None
    if body.ttl is not None:
        meta = {"ttl": body.ttl}

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
) -> Response:
    """Delete a record identified by namespace, set, and primary key."""
    await client.remove((ns, set, _auto_detect_pk(pk)))
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

    # PK lookup short-circuit
    if body.primary_key:
        if not body.set:
            raise HTTPException(status_code=400, detail="Set is required for primary key lookup")

        pk = _auto_detect_pk(body.primary_key)
        try:
            raw_result = await client.get((body.namespace, body.set, pk), policy=POLICY_READ)
            raw_results = [raw_result]
        except RecordNotFound:
            raw_results = []

        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        records = [record_to_model(r) for r in raw_results]
        return FilteredQueryResponse(
            records=records,
            total=len(records),
            page=1,
            page_size=body.page_size,
            has_more=False,
            execution_time_ms=elapsed_ms,
            scanned_records=len(records),
            returned_records=len(records),
        )

    # Build query
    q = client.query(body.namespace, body.set or "")

    if body.predicate:
        q.where(build_predicate(body.predicate))

    if body.select_bins:
        q.select(*body.select_bins)

    # Build policy with optional filter expression
    policy = dict(POLICY_QUERY)
    if body.filters:
        policy["filter_expression"] = build_expression(body.filters)

    raw_results = await q.results(policy)

    elapsed_ms = int((time.monotonic() - start_time) * 1000)
    scanned = len(raw_results)

    # Apply max_records limit
    if body.max_records and body.max_records > 0:
        raw_results = raw_results[: body.max_records]
    if len(raw_results) > MAX_QUERY_RECORDS:
        raw_results = raw_results[:MAX_QUERY_RECORDS]

    total = len(raw_results)

    # Paginate
    start = (body.page - 1) * body.page_size
    paged = raw_results[start : start + body.page_size]
    records = [record_to_model(r) for r in paged]

    return FilteredQueryResponse(
        records=records,
        total=total,
        page=body.page,
        page_size=body.page_size,
        has_more=start + body.page_size < total,
        execution_time_ms=elapsed_ms,
        scanned_records=scanned,
        returned_records=len(records),
    )
