"""Sample data generation service.

Handles the insertion of deterministic sample records and the creation of
secondary indexes against an Aerospike namespace.
"""

from __future__ import annotations

import logging
import secrets
import time

from aerospike_py.exception import AerospikeError, IndexFoundError

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

    Per-record write failures and per-index creation failures are caught and
    reported in the response (issue #257) rather than aborting the whole call —
    so partial-success retries stay safe and 5xx never accompanies side effects.
    """
    start = time.monotonic()

    # 1. Insert records — track per-record failures instead of aborting
    records_created = 0
    records_failed = 0
    for i in range(1, record_count + 1):
        key_tuple = (namespace, set_name, i)
        bins = generate_record_bins(i)
        try:
            await client.put(key_tuple, bins, policy=POLICY_WRITE)
            records_created += 1
        except AerospikeError:
            records_failed += 1
            logger.exception("Failed to write sample record %d to %s.%s", i, namespace, set_name)

    # Short random suffix to avoid name collisions across multiple invocations.
    suffix = secrets.token_hex(3)  # e.g. "a3f2b1"

    # 2. Create secondary indexes (if requested) — never fail the whole request
    indexes_created: list[str] = []
    indexes_skipped: list[str] = []
    indexes_failed: list[str] = []
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
            except AerospikeError:
                # The aerospike-py create call can raise after the underlying
                # server-side create succeeded (e.g. task.wait_till_complete
                # times out / connection blip). Record the failure and keep
                # going so callers see partial success rather than a 500 with
                # hidden side effects.
                indexes_failed.append(actual_idx_name)
                logger.exception("Failed to create index %s on %s.%s", actual_idx_name, namespace, set_name)

    elapsed_ms = int((time.monotonic() - start) * 1000)

    return CreateSampleDataResponse(
        recordsCreated=records_created,
        recordsFailed=records_failed,
        indexesCreated=indexes_created,
        indexesSkipped=indexes_skipped,
        indexesFailed=indexes_failed,
        elapsedMs=elapsed_ms,
    )
