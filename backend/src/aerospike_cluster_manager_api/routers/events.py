"""SSE streaming endpoint.

Clients connect to ``GET /api/v1/events/stream`` and receive a continuous
stream of server-sent events.  An optional ``types`` query parameter
filters which event types are delivered.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from aerospike_cluster_manager_api import config
from aerospike_cluster_manager_api.events.broker import broker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])


async def _event_generator(
    request: Request,
    subscriber_id: str,
    queue: asyncio.Queue,
) -> AsyncGenerator[dict]:
    """Async generator that yields SSE-formatted dicts from the broker queue.

    Sends a ``:ping`` comment every ``SSE_HEARTBEAT_INTERVAL`` seconds to
    keep the connection alive through proxies.
    """
    heartbeat_interval = config.SSE_HEARTBEAT_INTERVAL
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=heartbeat_interval)
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


@router.get(
    "/stream",
    summary="SSE event stream",
    description="Server-Sent Events stream for real-time updates. "
    "Use the `types` parameter to filter events (comma-separated).",
    response_model=None,
)
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

    try:
        subscriber_id, queue = await broker.subscribe(event_types)
    except ConnectionError:
        return JSONResponse(status_code=429, content={"detail": "Too many SSE connections"})

    return EventSourceResponse(
        _event_generator(request, subscriber_id, queue),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
