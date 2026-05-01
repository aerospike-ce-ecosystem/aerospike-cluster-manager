"""Aerospike async client pool manager.

Manages one AsyncClient per connection-id, with per-connection asyncio.Lock()
for safe concurrent access without global serialization.
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any

import aerospike_py
from aerospike_py.exception import AerospikeError
from opentelemetry import trace

from aerospike_cluster_manager_api import config, db
from aerospike_cluster_manager_api.observability import make_instruments
from aerospike_cluster_manager_api.services.info_cache import info_cache
from aerospike_cluster_manager_api.utils import parse_host_port

_tracer = trace.get_tracer("aerospike_cluster_manager_api.client_manager")


class ClientManager:
    def __init__(self) -> None:
        self._clients: dict[str, aerospike_py.AsyncClient] = {}
        self._global_lock = asyncio.Lock()
        self._conn_locks: dict[str, asyncio.Lock] = {}
        # Instruments are NoOps when OTel is disabled — safe to bind eagerly.
        self._instruments = make_instruments()

    async def _get_conn_lock(self, conn_id: str) -> asyncio.Lock:
        """Return the per-connection lock, creating one if needed."""
        async with self._global_lock:
            if conn_id not in self._conn_locks:
                self._conn_locks[conn_id] = asyncio.Lock()
            return self._conn_locks[conn_id]

    async def get_client(self, conn_id: str) -> aerospike_py.AsyncClient:
        conn_lock = await self._get_conn_lock(conn_id)
        async with conn_lock:
            client = self._clients.get(conn_id)
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
                },
            ):
                client = aerospike_py.AsyncClient(as_config)
                await client.connect()

            old = self._clients.get(conn_id)
            if old is not None:
                with contextlib.suppress(AerospikeError, OSError):
                    await old.close()
            self._clients[conn_id] = client
            self._instruments["active_aerospike_connections"].add(1, attributes={"asm.connection.id": conn_id})

            return client

    async def close_client(self, conn_id: str) -> None:
        conn_lock = await self._get_conn_lock(conn_id)
        async with conn_lock:
            client = self._clients.pop(conn_id, None)
            info_cache.invalidate_connection(conn_id)
            async with self._global_lock:
                self._conn_locks.pop(conn_id, None)
            if client is not None:
                with (
                    _tracer.start_as_current_span(
                        "asm.aerospike.client.close",
                        attributes={"asm.connection.id": conn_id},
                    ),
                    contextlib.suppress(AerospikeError, OSError),
                ):
                    await client.close()
                self._instruments["active_aerospike_connections"].add(-1, attributes={"asm.connection.id": conn_id})

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
