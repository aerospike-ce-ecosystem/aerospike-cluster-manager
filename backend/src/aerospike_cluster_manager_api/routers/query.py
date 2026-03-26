from __future__ import annotations

import logging
import time
from typing import cast

from aerospike_py.exception import RecordNotFound
from fastapi import APIRouter, HTTPException

from aerospike_cluster_manager_api.constants import MAX_QUERY_RECORDS, POLICY_QUERY, POLICY_READ
from aerospike_cluster_manager_api.converters import record_to_model
from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.models.query import QueryRequest, QueryResponse
from aerospike_cluster_manager_api.utils import auto_detect_pk, build_predicate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/query", tags=["query"])


@router.post(
    "/{conn_id}",
    summary="Execute query",
    description="Execute a query against Aerospike using primary key lookup, predicate filter, or full scan.",
)
async def execute_query(body: QueryRequest, client: AerospikeClient) -> QueryResponse:
    """Execute a query against Aerospike using primary key lookup, predicate filter, or full scan."""
    start_time = time.monotonic()

    if body.primaryKey:
        if not body.set:
            raise HTTPException(status_code=400, detail="Set is required for primary key lookup")

        pk = auto_detect_pk(body.primaryKey)

        try:
            raw_result = await client.get((body.namespace, body.set, pk), policy=POLICY_READ)
            raw_results = [raw_result]
        except RecordNotFound:
            raw_results = []

        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        records = [record_to_model(r) for r in raw_results]
        return QueryResponse(
            records=records,
            executionTimeMs=elapsed_ms,
            scannedRecords=len(records),
            returnedRecords=len(records),
        )

    q = client.query(body.namespace, body.set or "")
    if body.predicate:
        q.where(cast(tuple[str, ...], build_predicate(body.predicate)))
    if body.selectBins:
        q.select(*body.selectBins)

    # Apply server-side max_records limit to prevent OOM
    effective_limit = min(body.maxRecords or MAX_QUERY_RECORDS, MAX_QUERY_RECORDS)
    policy = {**POLICY_QUERY, "max_records": effective_limit}
    raw_results = await q.results(policy)

    elapsed_ms = int((time.monotonic() - start_time) * 1000)
    scanned = len(raw_results)

    records = [record_to_model(r) for r in raw_results]

    return QueryResponse(
        records=records,
        executionTimeMs=elapsed_ms,
        scannedRecords=scanned,
        returnedRecords=len(records),
    )
