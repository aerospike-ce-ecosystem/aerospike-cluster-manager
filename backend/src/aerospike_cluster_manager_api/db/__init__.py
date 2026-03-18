"""Database persistence layer.

Dispatches to SQLite (default) or PostgreSQL (when ENABLE_POSTGRES=true).
Backend selection happens at init_db() call time, allowing tests to patch
config before initialization.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from aerospike_cluster_manager_api import config

if TYPE_CHECKING:
    from aerospike_cluster_manager_api.db import _postgres, _sqlite
    from aerospike_cluster_manager_api.models.connection import ConnectionProfile

_backend: _postgres | _sqlite | None = None  # type: ignore[valid-type]


def _get_backend():
    if _backend is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _backend


async def init_db() -> None:
    global _backend
    if config.ENABLE_POSTGRES:
        from aerospike_cluster_manager_api.db import _postgres as backend
    else:
        from aerospike_cluster_manager_api.db import _sqlite as backend
    await backend.init_db()
    _backend = backend


async def close_db() -> None:
    global _backend
    if _backend is not None:
        await _backend.close_db()
        _backend = None


async def check_health() -> bool:
    return await _get_backend().check_health()


async def get_all_connections() -> list[ConnectionProfile]:
    return await _get_backend().get_all_connections()


async def get_connection(conn_id: str) -> ConnectionProfile | None:
    return await _get_backend().get_connection(conn_id)


async def create_connection(conn: ConnectionProfile) -> None:
    await _get_backend().create_connection(conn)


async def update_connection(conn_id: str, data: dict) -> ConnectionProfile | None:
    return await _get_backend().update_connection(conn_id, data)


async def delete_connection(conn_id: str) -> bool:
    return await _get_backend().delete_connection(conn_id)
