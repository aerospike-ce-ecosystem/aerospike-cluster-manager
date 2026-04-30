from __future__ import annotations

import logging
from typing import Literal, cast

from fastapi import APIRouter, HTTPException, Query
from starlette.responses import Response

from aerospike_cluster_manager_api.constants import INFO_NAMESPACES, info_sindex
from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.info_parser import parse_list, parse_records
from aerospike_cluster_manager_api.models.index import CreateIndexRequest, SecondaryIndex

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/indexes", tags=["indexes"])

_STATE_MAP = {"RW": "ready", "WO": "building", "D": "error"}
_TYPE_MAP = {"numeric": "numeric", "string": "string", "geo2dsphere": "geo2dsphere"}


@router.get(
    "/{conn_id}",
    summary="List secondary indexes",
    description="Retrieve all secondary indexes across all namespaces in the cluster.",
)
async def get_indexes(client: AerospikeClient) -> list[SecondaryIndex]:
    """Retrieve all secondary indexes across all namespaces in the cluster."""
    ns_raw = await client.info_random_node(INFO_NAMESPACES)
    ns_names = parse_list(ns_raw)

    indexes: list[SecondaryIndex] = []
    for ns in ns_names:
        sindex_raw = await client.info_random_node(info_sindex(ns))
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
    summary="Create secondary index",
    description="Create a new secondary index on a specified namespace, set, and bin.",
)
async def create_index(body: CreateIndexRequest, client: AerospikeClient) -> SecondaryIndex:
    """Create a new secondary index on a specified namespace, set, and bin."""
    if body.type == "numeric":
        await client.index_integer_create(body.namespace, body.set, body.bin, body.name)
    elif body.type == "string":
        await client.index_string_create(body.namespace, body.set, body.bin, body.name)
    elif body.type == "geo2dsphere":
        await client.index_geo2dsphere_create(body.namespace, body.set, body.bin, body.name)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported index type: {body.type}")

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
async def delete_index(
    client: AerospikeClient,
    name: str = Query(..., min_length=1),
    ns: str = Query(..., min_length=1),
) -> Response:
    """Remove a secondary index by name from the specified namespace."""
    await client.index_remove(ns, name)
    return Response(status_code=204)
