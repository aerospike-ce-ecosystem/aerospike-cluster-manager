from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Literal, cast

from fastapi import APIRouter, Query
from starlette.responses import Response

from aerospike_cluster_manager_api.constants import INFO_UDF_LIST
from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.info_parser import parse_records
from aerospike_cluster_manager_api.models.udf import UDFModule, UploadUDFRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/udfs", tags=["udfs"])


async def _list_udfs(c) -> list[UDFModule]:
    raw = await c.info_random_node(INFO_UDF_LIST)
    records = parse_records(raw, field_sep=",")
    modules: list[UDFModule] = []
    for rec in records:
        modules.append(
            UDFModule(
                filename=rec.get("filename", ""),
                type=cast(Literal["LUA"], rec.get("type", "LUA").upper()),
                hash=rec.get("hash", rec.get("content_hash", "")),
            )
        )
    return modules


@router.get(
    "/{conn_id}",
    summary="List UDF modules",
    description="Retrieve all registered UDF modules from the Aerospike cluster.",
)
async def get_udfs(client: AerospikeClient) -> list[UDFModule]:
    """Retrieve all registered UDF modules from the Aerospike cluster."""
    return await _list_udfs(client)


@router.post(
    "/{conn_id}",
    status_code=201,
    summary="Upload UDF module",
    description="Upload and register a Lua UDF module to the Aerospike cluster.",
)
async def upload_udf(body: UploadUDFRequest, client: AerospikeClient) -> UDFModule:
    """Upload and register a Lua UDF module to the Aerospike cluster."""
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".lua", delete=False) as tmp:
            tmp.write(body.content)
            tmp.flush()
            tmp_path = tmp.name
        await client.udf_put(tmp_path)
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)

    # Re-fetch to get actual hash
    modules = await _list_udfs(client)
    uploaded = next((m for m in modules if m.filename == body.filename), None)
    if uploaded:
        return uploaded
    return UDFModule(filename=body.filename, type="LUA", hash="", content=body.content)


@router.delete(
    "/{conn_id}",
    status_code=204,
    summary="Delete UDF module",
    description="Remove a registered UDF module from the Aerospike cluster by filename.",
)
async def delete_udf(
    client: AerospikeClient,
    filename: str = Query(..., min_length=1),
) -> Response:
    """Remove a registered UDF module from the Aerospike cluster by filename."""
    await client.udf_remove(filename)
    return Response(status_code=204)
