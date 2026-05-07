"""Aerospike async client pool manager.

Manages one ``AsyncClient`` per ``(session_id, conn_id)`` pair, with a
per-pair :class:`asyncio.Lock` for safe concurrent access without global
serialization.

Phase 2 (#303) -- per-session scoping
-------------------------------------

Cached entries are keyed by ``(session_id, conn_id)`` rather than just
``conn_id`` so one MCP session's ``disconnect("X")`` cannot evict another
session's cached client for the same connection profile. The
``session_id`` is read transparently from a module-level
:class:`contextvars.ContextVar` (``_SESSION_CTXVAR``); the MCP registry
decorator stashes it before calling the tool body, and unsets it on the
way out so the contextvar never leaks across calls.

The REST API path has no MCP session -- the contextvar stays at its
default ``None`` and every REST caller therefore shares one cache slot
per ``conn_id`` (the Phase 1 behaviour the existing REST routers and
``test_client_manager.py`` rely on). ``close_client(conn_id)`` only
evicts the caller's *own* slot: an MCP session's disconnect cannot tear
down the REST cache, and the REST path's eviction does not touch any
MCP session.

If FastMCP exposes a session-cleanup hook in the future, call
:meth:`ClientManager.close_session` from it; until then the per-session
slots sit until process exit, which is acceptable for the short-lived
sessions FastMCP creates over StreamableHTTP.
"""

from __future__ import annotations

import asyncio
import contextlib
from contextvars import ContextVar
from typing import Any

import aerospike_py
from aerospike_py.exception import AerospikeError
from opentelemetry import trace

from aerospike_cluster_manager_api import config, db
from aerospike_cluster_manager_api.observability import make_instruments
from aerospike_cluster_manager_api.services.info_cache import info_cache
from aerospike_cluster_manager_api.utils import parse_host_port

_tracer = trace.get_tracer("aerospike_cluster_manager_api.client_manager")


# Per-call session id used to key the cache. The MCP registry decorator
# (mcp/registry.py) sets this before invoking a tool body and resets it
# on the way out. The REST API path leaves it at its default ``None``,
# which collapses to the Phase 1 single-cache-per-conn_id behaviour the
# REST routers expect.
_SESSION_CTXVAR: ContextVar[str | None] = ContextVar(
    "asm_mcp_session_id",
    default=None,
)

# Cache key: ``(session_id, conn_id)`` where ``session_id is None``
# represents the REST API path (no MCP session). Aliasing keeps the type
# annotations self-documenting in a few places below.
_CacheKey = tuple[str | None, str]


class ClientManager:
    def __init__(self) -> None:
        self._clients: dict[_CacheKey, aerospike_py.AsyncClient] = {}
        self._global_lock = asyncio.Lock()
        self._conn_locks: dict[_CacheKey, asyncio.Lock] = {}
        # Instruments are NoOps when OTel is disabled -- safe to bind eagerly.
        self._instruments = make_instruments()

    @staticmethod
    def _current_session_id() -> str | None:
        """Read the per-call session id stashed by the MCP registry decorator.

        Returns ``None`` for the REST API path. Exposed as a method so
        tests can monkey-patch it cleanly.
        """
        return _SESSION_CTXVAR.get()

    def _key(self, conn_id: str) -> _CacheKey:
        return (self._current_session_id(), conn_id)

    def _metric_attrs(self, conn_id: str) -> dict[str, str]:
        """OTel attributes for the ``active_aerospike_connections`` metric.

        Includes the session id when present so the metric is per-session
        in dashboards. The REST path emits ``asm.session.id="rest"`` so
        the dimension is always populated and queries don't have to
        special-case ``null``.
        """
        session_id = self._current_session_id()
        return {
            "asm.connection.id": conn_id,
            "asm.session.id": session_id if session_id is not None else "rest",
        }

    async def _get_conn_lock(self, key: _CacheKey) -> asyncio.Lock:
        """Return the per-(session,conn) lock, creating one if needed."""
        async with self._global_lock:
            if key not in self._conn_locks:
                self._conn_locks[key] = asyncio.Lock()
            return self._conn_locks[key]

    async def get_client(self, conn_id: str) -> aerospike_py.AsyncClient:
        key = self._key(conn_id)
        conn_lock = await self._get_conn_lock(key)
        async with conn_lock:
            client = self._clients.get(key)
            if client is not None and client.is_connected():
                return client

            profile = await db.get_connection(conn_id)
            if profile is None:
                raise ValueError(f"Connection profile '{conn_id}' not found")

            hosts = [parse_host_port(h, profile.port) for h in profile.hosts]
            as_config: dict[str, Any] = {"hosts": hosts, "tend_interval": config.AS_TEND_INTERVAL}
            if profile.username and profile.password:
                as_config["user"] = profile.username
                as_config["password"] = profile.password

            with _tracer.start_as_current_span(
                "asm.aerospike.client.connect",
                attributes={
                    "asm.connection.id": conn_id,
                    "asm.connection.host_count": len(hosts),
                    "asm.session.id": key[0] if key[0] is not None else "rest",
                },
            ):
                client = aerospike_py.AsyncClient(as_config)
                await client.connect()

            old = self._clients.get(key)
            if old is not None:
                with contextlib.suppress(AerospikeError, OSError):
                    await old.close()
            self._clients[key] = client
            self._instruments["active_aerospike_connections"].add(1, attributes=self._metric_attrs(conn_id))

            return client

    async def close_client(self, conn_id: str) -> None:
        """Evict the caller's *own* cached client for ``conn_id``.

        REST callers (``session_id=None``) only ever evict the REST slot.
        An MCP session evicts only its own slot, so disconnect from one
        session leaves other sessions' (and the REST path's) cached
        clients intact -- the core invariant of #303.
        """
        key = self._key(conn_id)
        conn_lock = await self._get_conn_lock(key)
        async with conn_lock:
            client = self._clients.pop(key, None)
            # info_cache is keyed by conn_id only -- invalidating cross-
            # session is the conservative choice since the underlying
            # cluster info doesn't depend on which MCP session asked.
            info_cache.invalidate_connection(conn_id)
            async with self._global_lock:
                self._conn_locks.pop(key, None)
            if client is not None:
                with (
                    _tracer.start_as_current_span(
                        "asm.aerospike.client.close",
                        attributes={
                            "asm.connection.id": conn_id,
                            "asm.session.id": key[0] if key[0] is not None else "rest",
                        },
                    ),
                    contextlib.suppress(AerospikeError, OSError),
                ):
                    await client.close()
                self._instruments["active_aerospike_connections"].add(-1, attributes=self._metric_attrs(conn_id))

    async def close_session(self, session_id: str) -> None:
        """Evict every cached client for the given MCP session.

        Intended to be called from a FastMCP session-cleanup hook when /
        if one becomes available. Until then it is best-effort: the
        cache entry sits until process exit, which is acceptable for the
        short-lived sessions FastMCP currently produces. Passing
        ``session_id=None`` would close the REST path's slots -- we
        forbid that to avoid REST-vs-MCP confusion.
        """
        if session_id is None:
            raise ValueError("close_session requires a non-None session id; use close_client/close_all instead")

        async with self._global_lock:
            keys = [k for k in self._clients if k[0] == session_id]
            clients = [self._clients.pop(k) for k in keys]
            for k in keys:
                self._conn_locks.pop(k, None)
        for key, client in zip(keys, clients, strict=True):
            conn_id = key[1]
            info_cache.invalidate_connection(conn_id)
            with (
                _tracer.start_as_current_span(
                    "asm.aerospike.client.close",
                    attributes={
                        "asm.connection.id": conn_id,
                        "asm.session.id": session_id,
                    },
                ),
                contextlib.suppress(AerospikeError, OSError),
            ):
                await client.close()
            self._instruments["active_aerospike_connections"].add(
                -1,
                attributes={"asm.connection.id": conn_id, "asm.session.id": session_id},
            )

    async def close_all(self) -> None:
        info_cache.clear()
        async with self._global_lock:
            clients = list(self._clients.values())
            count = len(clients)
            self._clients.clear()
            self._conn_locks.clear()
        for client in clients:
            with contextlib.suppress(AerospikeError, OSError):
                await client.close()
        if count:
            self._instruments["active_aerospike_connections"].add(-count)


client_manager = ClientManager()
