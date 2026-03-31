"""Tests for aerospike_cluster_manager_api.services.info_cache module."""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest

from aerospike_cluster_manager_api.services.info_cache import InfoCache


@pytest.fixture()
def cache() -> InfoCache:
    return InfoCache()


class TestInfoCache:
    @pytest.mark.asyncio
    async def test_cache_hit(self, cache: InfoCache):
        """Second call should return cached value without calling fetcher."""
        fetcher = AsyncMock(return_value="result1")

        v1 = await cache.get_or_fetch("conn-1", "build", fetcher, ttl=10.0)
        v2 = await cache.get_or_fetch("conn-1", "build", fetcher, ttl=10.0)

        assert v1 == "result1"
        assert v2 == "result1"
        assert fetcher.await_count == 1

    @pytest.mark.asyncio
    async def test_cache_miss_different_keys(self, cache: InfoCache):
        """Different commands should each call the fetcher."""
        fetcher_build = AsyncMock(return_value="6.4")
        fetcher_edition = AsyncMock(return_value="CE")

        v1 = await cache.get_or_fetch("conn-1", "build", fetcher_build, ttl=10.0)
        v2 = await cache.get_or_fetch("conn-1", "edition", fetcher_edition, ttl=10.0)

        assert v1 == "6.4"
        assert v2 == "CE"
        fetcher_build.assert_awaited_once()
        fetcher_edition.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_cache_miss_different_connections(self, cache: InfoCache):
        """Same command for different connections should each call fetcher."""
        fetcher = AsyncMock(side_effect=["result-a", "result-b"])

        v1 = await cache.get_or_fetch("conn-1", "build", fetcher, ttl=10.0)
        v2 = await cache.get_or_fetch("conn-2", "build", fetcher, ttl=10.0)

        assert v1 == "result-a"
        assert v2 == "result-b"
        assert fetcher.await_count == 2

    @pytest.mark.asyncio
    async def test_ttl_expiry(self, cache: InfoCache):
        """Expired entries should trigger a new fetch."""
        fetcher = AsyncMock(side_effect=["old", "new"])

        await cache.get_or_fetch("conn-1", "stats", fetcher, ttl=0.1)

        # Simulate time passing beyond TTL
        with patch("aerospike_cluster_manager_api.services.info_cache.time") as mock_time:
            mock_time.monotonic.return_value = time.monotonic() + 1.0
            v2 = await cache.get_or_fetch("conn-1", "stats", fetcher, ttl=0.1)

        assert v2 == "new"
        assert fetcher.await_count == 2

    @pytest.mark.asyncio
    async def test_invalidate_connection(self, cache: InfoCache):
        """Invalidating a connection should clear all its entries."""
        fetcher = AsyncMock(side_effect=["v1", "v2", "v3", "v4"])

        await cache.get_or_fetch("conn-1", "build", fetcher, ttl=60.0)
        await cache.get_or_fetch("conn-1", "edition", fetcher, ttl=60.0)

        cache.invalidate_connection("conn-1")

        v3 = await cache.get_or_fetch("conn-1", "build", fetcher, ttl=60.0)
        assert v3 == "v3"
        assert fetcher.await_count == 3

    @pytest.mark.asyncio
    async def test_invalidate_does_not_affect_other_connections(self, cache: InfoCache):
        """Invalidating conn-1 should not affect conn-2."""
        fetcher = AsyncMock(side_effect=["a", "b", "c"])

        await cache.get_or_fetch("conn-1", "build", fetcher, ttl=60.0)
        await cache.get_or_fetch("conn-2", "build", fetcher, ttl=60.0)

        cache.invalidate_connection("conn-1")

        v3 = await cache.get_or_fetch("conn-2", "build", fetcher, ttl=60.0)
        assert v3 == "b"  # Still cached
        assert fetcher.await_count == 2

    @pytest.mark.asyncio
    async def test_clear(self, cache: InfoCache):
        """Clear should remove all entries."""
        fetcher = AsyncMock(side_effect=["v1", "v2"])

        await cache.get_or_fetch("conn-1", "build", fetcher, ttl=60.0)
        cache.clear()

        v2 = await cache.get_or_fetch("conn-1", "build", fetcher, ttl=60.0)
        assert v2 == "v2"
        assert fetcher.await_count == 2

    @pytest.mark.asyncio
    async def test_concurrent_access(self, cache: InfoCache):
        """Concurrent fetches for the same key should only call fetcher once."""
        call_count = 0

        async def slow_fetcher():
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.05)
            return "result"

        results = await asyncio.gather(
            cache.get_or_fetch("conn-1", "build", slow_fetcher, ttl=10.0),
            cache.get_or_fetch("conn-1", "build", slow_fetcher, ttl=10.0),
            cache.get_or_fetch("conn-1", "build", slow_fetcher, ttl=10.0),
        )

        assert all(r == "result" for r in results)
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_default_ttl_static(self, cache: InfoCache):
        """Build/edition commands should use static TTL by default."""
        fetcher = AsyncMock(return_value="6.4")
        await cache.get_or_fetch("conn-1", "build", fetcher)

        entry = cache._store[("conn-1", "build")]
        # Static TTL is 60s — entry should expire ~60s from now
        assert entry.expires_at > time.monotonic() + 50

    @pytest.mark.asyncio
    async def test_default_ttl_volatile(self, cache: InfoCache):
        """Non-static commands should use volatile TTL by default."""
        fetcher = AsyncMock(return_value="stats-data")
        await cache.get_or_fetch("conn-1", "statistics", fetcher)

        entry = cache._store[("conn-1", "statistics")]
        # Volatile TTL is 5s — entry should expire < 10s from now
        assert entry.expires_at < time.monotonic() + 10
