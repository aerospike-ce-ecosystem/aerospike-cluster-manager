"""SSE streaming endpoint.

Clients connect to ``GET /api/v1/events/stream`` and receive a continuous
stream of server-sent events.  An optional ``types`` query parameter
filters which event types are delivered.

When OIDC is enabled, browser clients first mint a single-use ticket via
``POST /api/v1/events/ticket`` (Authorization header) and connect with
``?ticket=<opaque>`` — the JWT itself is never placed in the URL (issue
#345). See :mod:`aerospike_cluster_manager_api.events.tickets`.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from aerospike_cluster_manager_api import config
from aerospike_cluster_manager_api.dependencies import _resolve_caller_owner_id
from aerospike_cluster_manager_api.events.broker import broker
from aerospike_cluster_manager_api.events.tickets import TicketCapacityError, ticket_store
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.workspace_acl import is_cr_visible

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])


class SSETicketResponse(BaseModel):
    """Single-use handshake ticket for the SSE stream (issue #345)."""

    ticket: str
    expires_in: int


# Event families that carry per-tenant Kubernetes objects and therefore need
# the same workspace ACL the REST routes apply. Matched by prefix so a new
# ``k8s.cluster.<something>`` event is filtered by default rather than
# shipping unfiltered until someone notices — which is how #496 happened.
_OWNER_SCOPED_EVENT_PREFIX = "k8s.cluster."


async def _is_event_visible(event: dict, caller_owner_id: str) -> bool:
    """Return True iff this event may be delivered to ``caller_owner_id``.

    Non-K8s events (``cluster.metrics``, ``connection.health``) are unchanged.
    They are scoped by connection rather than workspace, and are separately
    gated off by default via ``CM_SSE_BROADCAST_PER_CONNECTION`` for the same
    tenant-isolation reason — out of scope here, still open.

    ``k8s.cluster.*`` events carry the CR's workspace on the envelope, stamped
    by the collector. ``strict=True``: this channel has never had a filter, so
    there is no legacy behaviour to preserve and it fails closed. An event
    published without attribution is treated as unlabelled — visible to the
    system caller only.
    """
    if not str(event.get("event", "")).startswith(_OWNER_SCOPED_EVENT_PREFIX):
        return True
    return await is_cr_visible(event.get("workspaceId"), caller_owner_id, strict=True)


async def _event_generator(
    request: Request,
    subscriber_id: str,
    queue: asyncio.Queue,
    caller_owner_id: str,
) -> AsyncGenerator[dict]:
    """Async generator that yields SSE-formatted dicts from the broker queue.

    Sends a ``:ping`` comment every ``SSE_HEARTBEAT_INTERVAL`` seconds to
    keep the connection alive through proxies.

    Applies the workspace ACL per event (#496). The broker fans one event out
    to every subscriber, so the filter has to live here, where the connection's
    identity is: filtering in the broker would need a per-subscriber predicate,
    and filtering in the collector cannot work at all because it has no caller.
    """
    heartbeat_interval = config.SSE_HEARTBEAT_INTERVAL
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=heartbeat_interval)
                if not await _is_event_visible(event, caller_owner_id):
                    # Dropped, not errored: the subscriber simply never learns
                    # this object exists, matching the REST identity-404.
                    continue
                yield {
                    "event": event.get("event", "message"),
                    "data": json.dumps(event.get("data", {})),
                    "id": event.get("id"),
                    "retry": 5000,
                }
            except TimeoutError:
                # Heartbeat — SSE comment to keep connection alive
                yield {"comment": f"ping {int(time.time() * 1000)}"}
    finally:
        await broker.unsubscribe(subscriber_id)


@router.post(
    "/ticket",
    summary="Mint a single-use SSE stream ticket",
    description="Exchange a normal Authorization-header credential for a "
    "short-lived, single-use opaque ticket. Native EventSource cannot send "
    "headers, so the stream is opened with `?ticket=<value>` instead of ever "
    "placing the JWT in the URL. The ticket is burned on first use.",
    response_model=SSETicketResponse,
)
async def mint_stream_ticket(request: Request) -> SSETicketResponse | JSONResponse:
    """Mint a single-use ticket for ``GET /events/stream``.

    Authentication is enforced by ``OIDCAuthMiddleware`` (Authorization
    header only — this path never accepts query-string credentials). The
    verified claims are carried over to the ticket so the stream request
    inherits the same identity and role checks.
    """
    if not config.SSE_ENABLED:
        return JSONResponse(status_code=404, content={"detail": "SSE streaming is disabled"})

    claims = getattr(request.state, "user_claims", None) or {}
    try:
        ticket, expires_in = ticket_store.issue(claims)
    except TicketCapacityError:
        return JSONResponse(status_code=429, content={"detail": "Too many pending SSE tickets"})
    return SSETicketResponse(ticket=ticket, expires_in=expires_in)


@router.get(
    "/stream",
    summary="SSE event stream",
    description="Server-Sent Events stream for real-time updates. "
    "Use the `types` parameter to filter events (comma-separated).",
    response_model=None,
)
# SSE streams are long-lived (one HTTP request held open for minutes/hours).
# The global default rate limit would let only the first connection through
# and 429 every reconnect attempt for the rest of the window — exempt the
# stream so the broker's own ``SSE_MAX_CONNECTIONS`` cap (HTTP 429 with
# detail "Too many SSE connections") owns the throttling decision.
@limiter.exempt
async def event_stream(
    request: Request,
    types: str | None = Query(None, description="Comma-separated event types to subscribe to"),
) -> EventSourceResponse | JSONResponse:
    """Stream server-sent events to the client."""
    if not config.SSE_ENABLED:
        return JSONResponse(status_code=404, content={"detail": "SSE streaming is disabled"})

    event_types: set[str] | None = None
    if types:
        event_types = {t.strip() for t in types.split(",") if t.strip()}

    # The identity was already in hand and unused: OIDCAuthMiddleware redeems
    # the ticket and populates ``request.state.user_claims`` before this runs.
    # Resolved with the same helper every REST route uses, so the stream and
    # the pull path agree on who the caller is.
    caller_owner_id = _resolve_caller_owner_id(request)

    try:
        subscriber_id, queue = await broker.subscribe(event_types)
    except ConnectionError:
        return JSONResponse(status_code=429, content={"detail": "Too many SSE connections"})

    return EventSourceResponse(
        _event_generator(request, subscriber_id, queue, caller_owner_id),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
