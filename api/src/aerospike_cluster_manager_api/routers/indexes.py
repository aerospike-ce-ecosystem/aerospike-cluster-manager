from __future__ import annotations

import logging
from typing import Any, Literal, cast

from aerospike_py.exception import AerospikeError, IndexFoundError, IndexNotFound
from fastapi import APIRouter, HTTPException, Query, Request
from starlette.responses import Response

from aerospike_cluster_manager_api.constants import INFO_NAMESPACES, info_sindex
from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.info_parser import parse_list, parse_records
from aerospike_cluster_manager_api.models.index import CreateIndexRequest, SecondaryIndex
from aerospike_cluster_manager_api.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/indexes", tags=["indexes"])

_STATE_MAP = {"RW": "ready", "WO": "building", "D": "error"}
_TYPE_MAP = {"numeric": "numeric", "string": "string", "geo2dsphere": "geo2dsphere"}


async def _index_exists(client: Any, namespace: str, name: str) -> bool:
    """Best-effort sindex-list check used to recover from spurious errors that
    fire after the underlying create/drop already committed (issue #260)."""
    try:
        sindex_raw = await client.info_random_node(info_sindex(namespace))
    except AerospikeError:
        logger.debug("Failed to verify index existence for %s.%s", namespace, name, exc_info=True)
        return False
    return any(rec.get("indexname", rec.get("index_name")) == name for rec in parse_records(sindex_raw))


@router.get(
    "/{conn_id}",
    response_model=list[SecondaryIndex],
    summary="List secondary indexes",
    description="Retrieve all secondary indexes across all namespaces in the cluster.",
)
async def get_indexes(client: AerospikeClient) -> list[SecondaryIndex]:
    """Retrieve all secondary indexes across all namespaces in the cluster."""
    ns_raw = await client.info_random_node(INFO_NAMESPACES)
    ns_names = parse_list(ns_raw)

    indexes: list[SecondaryIndex] = []
    for ns in ns_names:
        # Isolate per-namespace sindex failures so one bad namespace does not
        # 500 the whole listing — return indexes from the healthy namespaces
        # instead (matches the partial-failure convention from #257/#260 and
        # sample_data_service). Total cluster-unreachability still surfaces via
        # the unguarded INFO_NAMESPACES call above (ClusterError -> 503).
        try:
            sindex_raw = await client.info_random_node(info_sindex(ns))
        except AerospikeError:
            logger.warning("Failed to list secondary indexes for namespace %s", ns, exc_info=True)
            continue
        for rec in parse_records(sindex_raw):
            raw_type = rec.get("type", rec.get("bin_type", "string")).lower()
            idx_type = cast(Literal["numeric", "string", "geo2dsphere"], _TYPE_MAP.get(raw_type, "string"))
            raw_state = rec.get("state", "RW")
            state = cast(Literal["ready", "building", "error"], _STATE_MAP.get(raw_state, "ready"))

            indexes.append(
                SecondaryIndex(
                    name=rec.get("indexname", rec.get("index_name", "")),
                    namespace=ns,
                    set=rec.get("set", rec.get("set_name", "")),
                    bin=rec.get("bin", rec.get("bin_name", "")),
                    type=idx_type,
                    state=state,
                )
            )
    return indexes


@router.post(
    "/{conn_id}",
    status_code=201,
    response_model=SecondaryIndex,
    summary="Create secondary index",
    description="Create a new secondary index on a specified namespace, set, and bin.",
)
@limiter.limit("10/minute")
async def create_index(request: Request, body: CreateIndexRequest, client: AerospikeClient) -> SecondaryIndex:
    """Create a new secondary index on a specified namespace, set, and bin.

    aerospike-py internally calls ``IndexTask.wait_till_complete`` after the
    server has accepted the create. That wait can fail (timeout, connection
    blip) even though the index is now present — so the original implementation
    returned 500 for an actually-successful create, which corrupts client
    retry/rollback logic (issue #260). When the create raises, we re-check the
    sindex list and treat a present index as success (state=building).
    """
    try:
        if body.type == "numeric":
            await client.index_integer_create(body.namespace, body.set, body.bin, body.name)
        elif body.type == "string":
            await client.index_string_create(body.namespace, body.set, body.bin, body.name)
        elif body.type == "geo2dsphere":
            await client.index_geo2dsphere_create(body.namespace, body.set, body.bin, body.name)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported index type: {body.type}")
    except IndexFoundError:
        raise
    except AerospikeError:
        if not await _index_exists(client, body.namespace, body.name):
            raise
        logger.warning(
            "Index %s.%s create raised after success; verified existence and reporting 201",
            body.namespace,
            body.name,
        )

    return SecondaryIndex(
        name=body.name,
        namespace=body.namespace,
        set=body.set,
        bin=body.bin,
        type=body.type,
        state="building",
    )


@router.delete(
    "/{conn_id}",
    status_code=204,
    summary="Delete secondary index",
    description="Remove a secondary index by name from the specified namespace.",
)
@limiter.limit("10/minute")
async def delete_index(
    request: Request,
    client: AerospikeClient,
    name: str = Query(..., min_length=1),
    ns: str = Query(..., min_length=1),
) -> Response:
    """Remove a secondary index by name from the specified namespace.

    Same idempotency guard as ``create_index`` (issue #260): if the drop call
    raises but the index is already gone, treat the operation as successful.
    """
    try:
        await client.index_remove(ns, name)
    except IndexNotFound:
        raise
    except AerospikeError:
        if await _index_exists(client, ns, name):
            raise
        logger.warning(
            "Index %s.%s remove raised after success; verified absence and reporting 204",
            ns,
            name,
        )
    return Response(status_code=204)
