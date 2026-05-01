"""In-process async event broker (pub/sub with asyncio.Queue per subscriber)."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
import uuid

from opentelemetry import trace

from aerospike_cluster_manager_api.observability import make_instruments

logger = logging.getLogger(__name__)

_tracer = trace.get_tracer("aerospike_cluster_manager_api.events.broker")
_instruments = make_instruments()


class EventBroker:
    """Fan-out event broker.

    Each subscriber gets a bounded ``asyncio.Queue``.  When the queue is
    full the oldest item is silently dropped so a slow consumer never
    blocks publishers.
    """

    def __init__(self, max_connections: int = 50, queue_size: int = 256) -> None:
        self._max_connections = max_connections
        self._queue_size = queue_size
        # subscriber_id → (queue, set_of_event_types)
        self._subscribers: dict[str, tuple[asyncio.Queue, set[str] | None]] = {}
        self._lock = asyncio.Lock()

    @property
    def max_connections(self) -> int:
        return self._max_connections

    @max_connections.setter
    def max_connections(self, value: int) -> None:
        self._max_connections = value

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    async def subscribe(self, event_types: set[str] | None = None) -> tuple[str, asyncio.Queue]:
        """Register a new subscriber.

        Args:
            event_types: If provided, only events whose ``event`` field
                matches one of these strings will be delivered.  ``None``
                means "all events".

        Returns:
            ``(subscriber_id, queue)`` — the caller reads from the queue.

        Raises:
            ConnectionError: If ``max_connections`` has been reached.
        """
        async with self._lock:
            if len(self._subscribers) >= self._max_connections:
                raise ConnectionError("SSE max connections reached")
            sub_id = uuid.uuid4().hex
            queue: asyncio.Queue = asyncio.Queue(maxsize=self._queue_size)
            self._subscribers[sub_id] = (queue, event_types)
            logger.debug("SSE subscriber %s registered (total: %d)", sub_id, len(self._subscribers))
        _instruments["active_sse_subscribers"].add(1)
        return sub_id, queue

    async def unsubscribe(self, subscriber_id: str) -> None:
        removed = False
        async with self._lock:
            removed = self._subscribers.pop(subscriber_id, None) is not None
            logger.debug("SSE subscriber %s removed (total: %d)", subscriber_id, len(self._subscribers))
        if removed:
            _instruments["active_sse_subscribers"].add(-1)

    async def publish(self, event: dict) -> None:
        """Publish *event* to all matching subscribers.

        ``event`` must contain an ``"event"`` key used for type filtering.
        """
        event_type = event.get("event", "")
        async with self._lock:
            subscribers = list(self._subscribers.items())

        with _tracer.start_as_current_span(
            "asm.events.broadcast",
            attributes={
                "asm.event.type": event_type,
                "asm.event.subscribers": len(subscribers),
            },
        ):
            start = time.monotonic()
            for _sub_id, (queue, types) in subscribers:
                if types and event_type not in types:
                    continue
                if queue.full():
                    with contextlib.suppress(asyncio.QueueEmpty):
                        queue.get_nowait()  # drop oldest
                with contextlib.suppress(asyncio.QueueFull):
                    queue.put_nowait(event)
            _instruments["event_broadcast_duration_ms"].record(
                (time.monotonic() - start) * 1000,
                attributes={"asm.event.type": event_type},
            )


# Module-level singleton
broker = EventBroker()
