from __future__ import annotations

import logging
import secrets
import time

from aerospike_py.exception import IndexFoundError
from fastapi import APIRouter

from aerospike_cluster_manager_api.constants import POLICY_WRITE
from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.models.sample_data import CreateSampleDataRequest, CreateSampleDataResponse
from aerospike_cluster_manager_api.sample_data_generator import SAMPLE_INDEXES, generate_record_bins

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sample-data", tags=["sample-data"])


@router.post(
    "/{conn_id}",
    status_code=201,
    summary="Create sample data set",
    description="Generate deterministic sample records with optional secondary indexes.",
)
async def create_sample_data(
    body: CreateSampleDataRequest,
    client: AerospikeClient,
) -> CreateSampleDataResponse:
    start = time.monotonic()
    ns = body.namespace
    set_name = body.set_name
    count = body.record_count

    # 1. Insert records
    records_created = 0
    for i in range(1, count + 1):
        key_tuple = (ns, set_name, i)
        bins = generate_record_bins(i)
        await client.put(key_tuple, bins, policy=POLICY_WRITE)
        records_created += 1

    # Short random suffix to avoid name collisions across multiple invocations.
    suffix = secrets.token_hex(3)  # e.g. "a3f2b1"

    # 2. Create secondary indexes (if requested)
    indexes_created: list[str] = []
    indexes_skipped: list[str] = []
    if body.create_indexes:
        for idx_name, bin_name, idx_type in SAMPLE_INDEXES:
            actual_idx_name = f"{idx_name}_{suffix}"
            try:
                if idx_type == "numeric":
                    await client.index_integer_create(ns, set_name, bin_name, actual_idx_name)
                elif idx_type == "string":
                    await client.index_string_create(ns, set_name, bin_name, actual_idx_name)
                elif idx_type == "geo2dsphere":
                    await client.index_geo2dsphere_create(ns, set_name, bin_name, actual_idx_name)
                indexes_created.append(actual_idx_name)
            except IndexFoundError:
                indexes_skipped.append(actual_idx_name)
                logger.info("Index %s already exists, skipping", actual_idx_name)

    elapsed_ms = int((time.monotonic() - start) * 1000)

    return CreateSampleDataResponse(
        records_created=records_created,
        indexes_created=indexes_created,
        indexes_skipped=indexes_skipped,
        elapsed_ms=elapsed_ms,
    )
