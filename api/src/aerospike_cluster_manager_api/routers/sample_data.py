from __future__ import annotations

from fastapi import APIRouter, Request

from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.models.sample_data import CreateSampleDataRequest, CreateSampleDataResponse
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.services.sample_data_service import create_sample_records

router = APIRouter(prefix="/sample-data", tags=["sample-data"])


@router.post(
    "/{conn_id}",
    status_code=201,
    summary="Create sample data set",
    description="Generate deterministic sample records with optional secondary indexes.",
)
@limiter.limit("10/minute")
async def create_sample_data(
    request: Request,
    body: CreateSampleDataRequest,
    client: AerospikeClient,
) -> CreateSampleDataResponse:
    return await create_sample_records(
        client,
        namespace=body.namespace,
        set_name=body.set_name,
        record_count=body.record_count,
        create_indexes=body.create_indexes,
    )
