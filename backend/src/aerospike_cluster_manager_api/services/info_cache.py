"""TTL-based in-memory cache for Aerospike info command results.

Caches semi-static info results (build, edition, namespace list) to avoid
redundant network round-trips on frequently polled endpoints.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

from aerospike_cluster_manager_api.constants import INFO_CACHE_TTL_STATIC, INFO_CACHE_TTL_VOLATILE


class _CacheEntry:
    __slots__ = ("expires_at", "value")

    def __init__(self, value: Any, ttl: float) -> None:
        self.value = value
        self.expires_at = time.monotonic() + ttl


class InfoCache:
    """Async-safe TTL cache keyed by ``(conn_id, command)``."""

    def __init__(self) -> None:
        self._store: dict[tuple[str, str], _CacheEntry] = {}
        self._locks: dict[tuple[str, str], asyncio.Lock] = {}
        self._global_lock = asyncio.Lock()

    async def _get_lock(self, key: tuple[str, str]) -> asyncio.Lock:
        async with self._global_lock:
            if key not in self._locks:
                self._locks[key] = asyncio.Lock()
            return self._locks[key]

    async def get_or_fetch(
        self,
        conn_id: str,
        command: str,
        fetcher: Callable[[], Awaitable[Any]],
        ttl: float | None = None,
    ) -> Any:
        """Return cached value or call *fetcher* and cache the result.

        Args:
            conn_id: Connection identifier.
            command: Info command string used as cache key.
            fetcher: Async callable that produces the value on cache miss.
            ttl: Cache lifetime in seconds.  Defaults to
                ``INFO_CACHE_TTL_STATIC`` for build/edition commands and
                ``INFO_CACHE_TTL_VOLATILE`` for everything else.
        """
        key = (conn_id, command)

        # Fast path — check without lock
        entry = self._store.get(key)
        if entry is not None and time.monotonic() < entry.expires_at:
            return entry.value

        lock = await self._get_lock(key)
        async with lock:
            # Re-check after acquiring lock
            entry = self._store.get(key)
            if entry is not None and time.monotonic() < entry.expires_at:
                return entry.value

            value = await fetcher()
            if ttl is None:
                ttl = _default_ttl(command)
            self._store[key] = _CacheEntry(value, ttl)
            return value

    def invalidate_connection(self, conn_id: str) -> None:
        """Remove all cached entries for *conn_id*."""
        keys_to_remove = [k for k in self._store if k[0] == conn_id]
        for k in keys_to_remove:
            self._store.pop(k, None)
            self._locks.pop(k, None)

    def clear(self) -> None:
        """Drop the entire cache."""
        self._store.clear()
        self._locks.clear()


_STATIC_COMMANDS = frozenset({"build", "edition"})


def _default_ttl(command: str) -> float:
    if command in _STATIC_COMMANDS:
        return INFO_CACHE_TTL_STATIC
    return INFO_CACHE_TTL_VOLATILE


info_cache = InfoCache()
