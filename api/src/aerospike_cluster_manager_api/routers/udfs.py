from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from typing import Literal, cast

from aerospike_py.exception import AerospikeError
from fastapi import APIRouter, HTTPException, Query, Request
from starlette.responses import Response

from aerospike_cluster_manager_api.constants import INFO_UDF_LIST
from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.info_parser import parse_records
from aerospike_cluster_manager_api.models.udf import UDFModule, UploadUDFRequest
from aerospike_cluster_manager_api.rate_limit import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/udfs", tags=["udfs"])


def _write_text(path: str, content: str) -> None:
    """Write *content* to *path*. Runs in a worker thread via asyncio.to_thread."""
    with open(path, "w") as f:
        f.write(content)


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
@limiter.limit("20/minute")
async def upload_udf(request: Request, body: UploadUDFRequest, client: AerospikeClient) -> UDFModule:
    """Upload and register a Lua UDF module to the Aerospike cluster.

    aerospike-py's ``udf_put`` derives the registered module name from the
    file's basename, so the temp file MUST be created with ``body.filename``
    as its basename. Using ``NamedTemporaryFile`` (basename ``tmpXXXX.lua``)
    registered the UDF under a random name and broke every later fetch /
    delete by ``body.filename``. ``body.filename`` is already validated
    against a strict pattern at the request model layer, so there is no
    path traversal exposure from joining it with the temp directory.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = os.path.join(tmpdir, body.filename)
        # The Lua source is written off the event loop — a synchronous
        # open()/write() in an async handler blocks the whole loop while
        # the file hits disk. asyncio.to_thread keeps the handler async.
        await asyncio.to_thread(_write_text, tmp_path, body.content)
        await client.udf_put(tmp_path)

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
@limiter.limit("20/minute")
async def delete_udf(
    request: Request,
    client: AerospikeClient,
    filename: str = Query(..., min_length=1),
) -> Response:
    """Remove a registered UDF module from the Aerospike cluster by filename.

    aerospike-py does not expose a dedicated ``UDFNotFound`` exception, so
    "module is not registered" surfaces as a generic ``AerospikeError`` /
    ``UDFError`` carrying a ``"udf not found"`` (or similar) server message.
    We pattern-match that here so a missing module returns 404 instead of
    being swallowed by the global 500 handler — mirrors the 404 mapping
    that ``delete_index`` gets for ``IndexNotFound``.
    """
    try:
        await client.udf_remove(filename)
    except AerospikeError as exc:
        if "not found" in str(exc).lower():
            raise HTTPException(status_code=404, detail=f"UDF module '{filename}' not found") from exc
        raise
    return Response(status_code=204)
