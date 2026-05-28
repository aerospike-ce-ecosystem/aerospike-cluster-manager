from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from aerospike_cluster_manager_api.converters import record_to_model
from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.models.query import QueryRequest, QueryResponse
from aerospike_cluster_manager_api.predicate import PredicateError
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.services import query_service
from aerospike_cluster_manager_api.services.query_service import SetRequiredForPkLookup

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/query", tags=["query"])


@router.post(
    "/{conn_id}",
    response_model=QueryResponse,
    summary="Execute query",
    description="Execute a query against Aerospike using primary key lookup, predicate filter, or full scan.",
)
@limiter.limit("30/minute")
async def execute_query(request: Request, body: QueryRequest, client: AerospikeClient) -> QueryResponse:
    """Execute a query against Aerospike using primary key lookup, predicate filter, or full scan."""
    try:
        result = await query_service.execute_query(client, body)
    except SetRequiredForPkLookup as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PredicateError as exc:
        # A bad ``predicate`` (unknown operator, missing value/value2) is a
        # client-side schema-level error. ``PredicateError`` is a subclass
        # of ``ValueError`` so this branch MUST be ordered before the
        # generic ``ValueError`` catch below — otherwise predicate failures
        # would be swallowed as 400 instead of the more accurate 422.
        raise HTTPException(status_code=422, detail=f"Invalid predicate: {exc}") from exc
    except ValueError as exc:
        # Explicit pk_type with unparseable pk → 400.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return QueryResponse(
        records=[record_to_model(r) for r in result.records],
        executionTimeMs=result.execution_time_ms,
        scannedRecords=result.scanned_records,
        returnedRecords=result.returned_records,
    )
