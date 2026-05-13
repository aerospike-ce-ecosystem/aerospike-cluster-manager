"""Unit tests for ClientManager -- verifies tend_interval and per-connection lock concurrency."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from aerospike_cluster_manager_api.client_manager import (
    _SESSION_CTXVAR,
    ClientManager,
)


@pytest.fixture()
def mock_db_profile(sample_connection):
    """Patch db.get_connection to return the sample profile."""
    with patch("aerospike_cluster_manager_api.client_manager.db") as mock_db:
        mock_db.get_connection = AsyncMock(return_value=sample_connection)
        yield mock_db


class TestClientManagerTendInterval:
    async def test_tend_interval_in_config(self, mock_db_profile):
        """AsyncClient should receive tend_interval from config."""
        mock_client = AsyncMock()
        mock_client.is_connected.return_value = True

        with (
            patch("aerospike_cluster_manager_api.client_manager.config.AS_TEND_INTERVAL", 2000),
            patch(
                "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
                return_value=mock_client,
            ) as mock_cls,
        ):
            mgr = ClientManager()
            await mgr.get_client("conn-test-1")

            call_args = mock_cls.call_args[0][0]
            assert call_args["tend_interval"] == 2000

    async def test_tend_interval_default(self, mock_db_profile):
        """AsyncClient should use default tend_interval of 1000."""
        mock_client = AsyncMock()
        mock_client.is_connected.return_value = True

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            return_value=mock_client,
        ) as mock_cls:
            mgr = ClientManager()
            await mgr.get_client("conn-test-1")

            call_args = mock_cls.call_args[0][0]
            assert call_args["tend_interval"] == 1000


class TestClientManagerConcurrency:
    async def test_concurrent_get_client_same_conn_creates_one_client(self, mock_db_profile):
        """Concurrent get_client() for the same conn_id should create only one AsyncClient."""
        mock_client = AsyncMock()
        mock_client.is_connected.return_value = True

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            return_value=mock_client,
        ) as mock_cls:
            mgr = ClientManager()
            results = await asyncio.gather(*[mgr.get_client("conn-1") for _ in range(10)])

            mock_cls.assert_called_once()
            assert all(r is mock_client for r in results)

    async def test_concurrent_get_client_different_conns_run_in_parallel(self, mock_db_profile):
        """Concurrent get_client() for different conn_ids should not block each other."""
        entered = asyncio.Event()
        proceed = asyncio.Event()

        async def slow_connect():
            entered.set()
            await proceed.wait()

        slow_client = AsyncMock()
        slow_client.is_connected.return_value = True
        slow_client.connect = slow_connect

        fast_client = AsyncMock()
        fast_client.is_connected.return_value = True

        call_count = 0

        def client_factory(cfg):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return slow_client
            return fast_client

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            side_effect=client_factory,
        ):
            mgr = ClientManager()

            # Start slow connection for conn-1
            task_slow = asyncio.create_task(mgr.get_client("conn-slow"))
            await entered.wait()

            # conn-fast should complete while conn-slow is blocked
            result_fast = await mgr.get_client("conn-fast")
            assert result_fast is fast_client

            # Release slow connection
            proceed.set()
            result_slow = await task_slow
            assert result_slow is slow_client

    async def test_close_client_evicts_cached_client(self, mock_db_profile):
        """close_client() removes the cached client; the per-conn lock
        entry is intentionally left in place.

        Holding the lock across ``client.close()`` is what makes the
        eviction race-safe (Phase 1B / B4). Popping the lock would let
        a concurrent ``get_client()`` install a fresh lock + new client
        while we're still closing the old one. ``close_all`` /
        ``close_session`` clear ``_conn_locks`` wholesale.

        REST callers have ``session_id=None`` so the cache key is
        ``(None, conn_id)`` -- see #303 for the per-session keying
        rationale.
        """
        mock_client = AsyncMock()
        mock_client.is_connected.return_value = True

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            return_value=mock_client,
        ):
            mgr = ClientManager()
            await mgr.get_client("conn-1")
            assert (None, "conn-1") in mgr._conn_locks

            await mgr.close_client("conn-1")
            assert (None, "conn-1") not in mgr._clients
            # Lock entry is intentionally retained (Phase 1B / B4).
            assert (None, "conn-1") in mgr._conn_locks


class TestClientManagerSessionKeying:
    """Per-session cache keying -- Stream B / #303.

    Callers may stash a session id on ``_SESSION_CTXVAR`` before the
    request body runs. The same conn_id seen from two different sessions
    must produce two separate cached AsyncClient instances; closing one
    must not evict the other.

    The REST API path (``session_id=None``) is the regression check --
    every existing test in this file implicitly exercises it, but we
    add an explicit assertion here so a future refactor can't quietly
    repurpose the ``None`` slot.
    """

    async def test_two_sessions_same_conn_get_separate_clients(self, mock_db_profile):
        clients = [AsyncMock(name="client-A"), AsyncMock(name="client-B")]
        for c in clients:
            c.is_connected.return_value = True

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            side_effect=clients,
        ):
            mgr = ClientManager()

            token_a = _SESSION_CTXVAR.set("session-A")
            try:
                client_a = await mgr.get_client("conn-1")
            finally:
                _SESSION_CTXVAR.reset(token_a)

            token_b = _SESSION_CTXVAR.set("session-B")
            try:
                client_b = await mgr.get_client("conn-1")
            finally:
                _SESSION_CTXVAR.reset(token_b)

            assert client_a is not client_b
            assert ("session-A", "conn-1") in mgr._clients
            assert ("session-B", "conn-1") in mgr._clients

    async def test_close_client_only_evicts_callers_own_session(self, mock_db_profile):
        clients = [AsyncMock(name="client-A"), AsyncMock(name="client-B")]
        for c in clients:
            c.is_connected.return_value = True

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            side_effect=clients,
        ):
            mgr = ClientManager()

            token_a = _SESSION_CTXVAR.set("session-A")
            try:
                await mgr.get_client("conn-1")
            finally:
                _SESSION_CTXVAR.reset(token_a)

            token_b = _SESSION_CTXVAR.set("session-B")
            try:
                await mgr.get_client("conn-1")
                # Session B disconnects -- must not touch session A's slot.
                await mgr.close_client("conn-1")
            finally:
                _SESSION_CTXVAR.reset(token_b)

            assert ("session-A", "conn-1") in mgr._clients
            assert ("session-B", "conn-1") not in mgr._clients

    async def test_rest_path_session_id_none_shares_one_slot(self, mock_db_profile):
        """Two REST callers (both session_id=None) share one cache slot.

        Regression net for the existing REST routers -- Phase 1 behaviour
        must be preserved when the contextvar is at its default.
        """
        mock_client = AsyncMock()
        mock_client.is_connected.return_value = True

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            return_value=mock_client,
        ) as mock_cls:
            mgr = ClientManager()
            # ``_SESSION_CTXVAR`` defaults to None -- no set() needed.
            r1 = await mgr.get_client("conn-rest")
            r2 = await mgr.get_client("conn-rest")

            mock_cls.assert_called_once()
            assert r1 is r2
            assert (None, "conn-rest") in mgr._clients

    async def test_close_session_evicts_only_that_session(self, mock_db_profile):
        clients = [AsyncMock(name=f"c-{i}") for i in range(3)]
        for c in clients:
            c.is_connected.return_value = True

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            side_effect=clients,
        ):
            mgr = ClientManager()

            for sid in ("session-A", "session-B"):
                token = _SESSION_CTXVAR.set(sid)
                try:
                    await mgr.get_client("conn-shared")
                finally:
                    _SESSION_CTXVAR.reset(token)

            # REST path has its own slot.
            await mgr.get_client("conn-shared")

            await mgr.close_session("session-A")

            assert ("session-A", "conn-shared") not in mgr._clients
            assert ("session-B", "conn-shared") in mgr._clients
            assert (None, "conn-shared") in mgr._clients

    async def test_close_session_rejects_none(self):
        mgr = ClientManager()
        with pytest.raises(ValueError, match="non-None session id"):
            await mgr.close_session(None)  # type: ignore[arg-type]
