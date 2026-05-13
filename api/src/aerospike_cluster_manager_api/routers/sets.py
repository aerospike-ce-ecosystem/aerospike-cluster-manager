"""REST endpoints scoped to a single Aerospike set.

Currently exposes a single destructive operation -- ``truncate``. The
endpoint mirrors :func:`mcp.tools.records.truncate_set` so ackoctl can
reach MCP parity through the REST surface; the MCP wrapper does not get
deleted in this PR, but with this router in place a future PR can drop
the MCP tool without orphaning the operation.

Workspace ACL: ``VerifiedConnId`` already gates the connection by
workspace before the body runs -- identity-404 if the caller cannot see
the workspace. Aerospike CE has no built-in security, so workspace
visibility is the only ACL applied.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Path, Request
from pydantic import BaseModel, Field

from aerospike_cluster_manager_api.dependencies import AerospikeClient, VerifiedConnId
from aerospike_cluster_manager_api.models.common import MessageResponse
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.services import records_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sets", tags=["sets"])


class TruncateSetRequest(BaseModel):
    """Body for ``POST /sets/{conn_id}/{namespace}/{set_name}/truncate``.

    ``beforeLut`` is the cutoff in nanoseconds since the Aerospike
    CITRUS epoch. ``None`` (the default) means "truncate every record
    currently in the set". A positive value targets only records whose
    last-update-time is below the threshold.

    The service layer rejects ``beforeLut <= 0`` explicitly (it would
    otherwise be silently equivalent to a full truncate on the wire),
    so callers that genuinely want a full truncate must omit the field
    or pass ``null``.
    """

    before_lut: int | None = Field(
        default=None,
        alias="beforeLut",
        description=("Nanosecond LUT cutoff. Omit / null to truncate every record in the set."),
    )

    model_config = {"populate_by_name": True}


@router.post(
    "/{conn_id}/{namespace}/{set_name}/truncate",
    status_code=200,
    response_model=MessageResponse,
    summary="Truncate a set",
    description=(
        "Drop every record in a namespace.set (or only records with LUT below "
        "``beforeLut`` when supplied). Destructive — gated by workspace ACL "
        "via the verified connection."
    ),
)
@limiter.limit("10/minute")
async def truncate_set(
    request: Request,
    client: AerospikeClient,
    conn_id: VerifiedConnId,
    body: TruncateSetRequest | None = None,
    namespace: str = Path(..., min_length=1, max_length=31),
    set_name: str = Path(..., min_length=1, max_length=63),
) -> MessageResponse:
    """Truncate a set, optionally bounded by ``beforeLut``.

    ``conn_id`` is unused inside the body — its sole job is to trigger
    the :data:`VerifiedConnId` ACL gate before we reach the destructive
    service call. Keep the parameter so FastAPI runs the dependency.

    Returns a small JSON ack so the caller can distinguish a successful
    no-op set from a server-side failure (a 204 would be ambiguous when
    the set was already empty).
    """
    _ = conn_id
    before_lut = body.before_lut if body is not None else None
    try:
        await records_service.truncate_set(client, namespace, set_name, before_lut=before_lut)
    except ValueError as exc:
        # Service rejects ``before_lut <= 0`` explicitly -- propagate as 400
        # so the caller can fix the request rather than re-trying.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    suffix = f" up to LUT {before_lut}" if before_lut is not None else ""
    return MessageResponse(message=f"Set '{namespace}/{set_name}' truncated{suffix}")
