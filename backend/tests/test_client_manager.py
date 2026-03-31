"""Unit tests for ClientManager — verifies tend_interval and per-connection lock concurrency."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from aerospike_cluster_manager_api.client_manager import ClientManager


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

    async def test_close_client_cleans_up_lock(self, mock_db_profile):
        """close_client() should remove the per-connection lock entry."""
        mock_client = AsyncMock()
        mock_client.is_connected.return_value = True

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            return_value=mock_client,
        ):
            mgr = ClientManager()
            await mgr.get_client("conn-1")
            assert "conn-1" in mgr._conn_locks

            await mgr.close_client("conn-1")
            assert "conn-1" not in mgr._conn_locks
            assert "conn-1" not in mgr._clients
