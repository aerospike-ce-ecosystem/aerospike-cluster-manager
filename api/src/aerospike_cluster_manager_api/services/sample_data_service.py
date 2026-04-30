"""Sample data generation service.

Handles the insertion of deterministic sample records and the creation of
secondary indexes against an Aerospike namespace.
"""

from __future__ import annotations

import logging
import secrets
import time

from aerospike_py.exception import IndexFoundError

from aerospike_cluster_manager_api.constants import POLICY_WRITE
from aerospike_cluster_manager_api.models.sample_data import CreateSampleDataResponse
from aerospike_cluster_manager_api.sample_data_generator import SAMPLE_INDEXES, generate_record_bins

logger = logging.getLogger(__name__)


async def create_sample_records(
    client,
    *,
    namespace: str,
    set_name: str,
    record_count: int,
    create_indexes: bool,
) -> CreateSampleDataResponse:
    """Insert deterministic sample records and optionally create secondary indexes.

    Returns a ``CreateSampleDataResponse`` summarising what was created.
    """
    start = time.monotonic()

    # 1. Insert records
    records_created = 0
    for i in range(1, record_count + 1):
        key_tuple = (namespace, set_name, i)
        bins = generate_record_bins(i)
        await client.put(key_tuple, bins, policy=POLICY_WRITE)
        records_created += 1

    # Short random suffix to avoid name collisions across multiple invocations.
    suffix = secrets.token_hex(3)  # e.g. "a3f2b1"

    # 2. Create secondary indexes (if requested)
    indexes_created: list[str] = []
    indexes_skipped: list[str] = []
    if create_indexes:
        for idx_name, bin_name, idx_type in SAMPLE_INDEXES:
            actual_idx_name = f"{idx_name}_{suffix}"
            try:
                if idx_type == "numeric":
                    await client.index_integer_create(namespace, set_name, bin_name, actual_idx_name)
                elif idx_type == "string":
                    await client.index_string_create(namespace, set_name, bin_name, actual_idx_name)
                elif idx_type == "geo2dsphere":
                    await client.index_geo2dsphere_create(namespace, set_name, bin_name, actual_idx_name)
                indexes_created.append(actual_idx_name)
            except IndexFoundError:
                indexes_skipped.append(actual_idx_name)
                logger.info("Index %s already exists, skipping", actual_idx_name)

    elapsed_ms = int((time.monotonic() - start) * 1000)

    return CreateSampleDataResponse(
        recordsCreated=records_created,
        indexesCreated=indexes_created,
        indexesSkipped=indexes_skipped,
        elapsedMs=elapsed_ms,
    )
