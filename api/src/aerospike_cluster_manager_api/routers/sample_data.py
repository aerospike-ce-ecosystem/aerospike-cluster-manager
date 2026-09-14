from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from aerospike_cluster_manager_api.constants import InvalidInfoArgument
from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.models.sample_data import CreateSampleDataRequest, CreateSampleDataResponse
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.services.sample_data_service import create_sample_records

router = APIRouter(prefix="/sample-data", tags=["sample-data"])


@router.post(
    "/{conn_id}",
    status_code=201,
    response_model=CreateSampleDataResponse,
    summary="Create sample data set",
    description="Generate deterministic sample records with optional secondary indexes.",
)
@limiter.limit("10/minute")
async def create_sample_data(
    request: Request,
    body: CreateSampleDataRequest,
    client: AerospikeClient,
) -> CreateSampleDataResponse:
    try:
        return await create_sample_records(
            client,
            namespace=body.namespace,
            set_name=body.set_name,
            record_count=body.record_count,
            create_indexes=body.create_indexes,
        )
    except InvalidInfoArgument as exc:
        # Defence-in-depth: the request model carries the same patterns, so this
        # only fires if a caller reaches the service some other way.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
