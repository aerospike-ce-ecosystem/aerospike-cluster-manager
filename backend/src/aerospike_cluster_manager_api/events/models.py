"""Pydantic models for SSE event payloads.

Frontend counterpart: ``frontend/src/lib/api/types/events.ts``
"""

from __future__ import annotations

from pydantic import BaseModel

from aerospike_cluster_manager_api.models.metrics import ClusterMetrics


class ConnectionHealthPayload(BaseModel):
    """Payload for ``connection.health`` events."""

    connectionId: str
    connected: bool
    nodeCount: int
    namespaceCount: int
    build: str | None = None
    edition: str | None = None
    memoryUsed: int | None = None
    memoryTotal: int | None = None
    diskUsed: int | None = None
    diskTotal: int | None = None


class SSEEvent(BaseModel):
    """Envelope sent over the SSE stream.

    Serialized as a JSON object in the ``data:`` field of the SSE frame.
    The ``event`` field is also duplicated as the SSE ``event:`` line so
    clients can use ``EventSource.addEventListener()``.
    """

    event: str
    data: dict
    id: str | None = None
    timestamp: int


# Re-export ClusterMetrics so collectors can build it without extra imports.
__all__ = [
    "ClusterMetrics",
    "ConnectionHealthPayload",
    "SSEEvent",
]
