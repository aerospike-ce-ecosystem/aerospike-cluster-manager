"""Per-session client cache isolation -- Stream B / GitHub issue #303.

The MCP registry decorator (``mcp/registry.py``) stashes a per-call
session id on ``client_manager._SESSION_CTXVAR`` so
``client_manager.get_client(conn_id)`` keys its cache by
``(session_id, conn_id)``. This test file pins down the invariants:

1. Two MCP sessions hitting the same ``conn_id`` get separate cached
   ``AsyncClient`` instances.
2. Session A's ``disconnect("X")`` (i.e. ``close_client``) does NOT
   evict session B's cached client for the same ``conn_id``.
3. The REST API path (``session_id=None``) preserves Phase 1 behaviour:
   one cache slot per ``conn_id``.

The tests drive the contextvar directly rather than spinning up a real
FastMCP request -- that keeps the assertions focused on the cache shape
without dragging the whole transport stack in. The wrapper-side
plumbing (decorator -> contextvar) is covered by ``test_registry.py``.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from aerospike_cluster_manager_api.client_manager import (
    _SESSION_CTXVAR,
    ClientManager,
)


@pytest.fixture()
def mock_db_profile(sample_connection):
    """Patch ``client_manager.db.get_connection`` to return a sample profile.

    Mirrors the fixture in ``tests/test_client_manager.py`` -- the
    underlying ``db`` module is the only collaborator we don't want to
    hit in unit tests.
    """
    with patch("aerospike_cluster_manager_api.client_manager.db") as mock_db:
        mock_db.get_connection = AsyncMock(return_value=sample_connection)
        yield mock_db


def _make_connected_client(name: str) -> AsyncMock:
    client = AsyncMock(name=name)
    client.is_connected.return_value = True
    return client


class TestTwoSessionsShareConnId:
    async def test_each_session_gets_its_own_async_client(self, mock_db_profile):
        a = _make_connected_client("client-A")
        b = _make_connected_client("client-B")

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            side_effect=[a, b],
        ):
            mgr = ClientManager()

            token = _SESSION_CTXVAR.set("session-A")
            try:
                got_a = await mgr.get_client("conn-1")
            finally:
                _SESSION_CTXVAR.reset(token)

            token = _SESSION_CTXVAR.set("session-B")
            try:
                got_b = await mgr.get_client("conn-1")
            finally:
                _SESSION_CTXVAR.reset(token)

            assert got_a is a
            assert got_b is b
            # Cache shape: one slot per (session, conn) pair.
            assert set(mgr._clients) == {("session-A", "conn-1"), ("session-B", "conn-1")}

    async def test_get_client_within_same_session_is_idempotent(self, mock_db_profile):
        a = _make_connected_client("client-A")

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            return_value=a,
        ) as mock_cls:
            mgr = ClientManager()
            token = _SESSION_CTXVAR.set("session-A")
            try:
                first = await mgr.get_client("conn-1")
                second = await mgr.get_client("conn-1")
            finally:
                _SESSION_CTXVAR.reset(token)

            mock_cls.assert_called_once()
            assert first is second is a


class TestDisconnectIsolation:
    async def test_session_a_disconnect_leaves_session_b_intact(self, mock_db_profile):
        a = _make_connected_client("client-A")
        b = _make_connected_client("client-B")

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            side_effect=[a, b],
        ):
            mgr = ClientManager()

            for sid, expected in (("session-A", a), ("session-B", b)):
                token = _SESSION_CTXVAR.set(sid)
                try:
                    got = await mgr.get_client("conn-1")
                finally:
                    _SESSION_CTXVAR.reset(token)
                assert got is expected

            # Session A disconnects.
            token = _SESSION_CTXVAR.set("session-A")
            try:
                await mgr.close_client("conn-1")
            finally:
                _SESSION_CTXVAR.reset(token)

            # Session A's slot is gone; session B's stays put.
            assert ("session-A", "conn-1") not in mgr._clients
            assert ("session-B", "conn-1") in mgr._clients

            # Session B can still reach its cached client without
            # rebuilding (no extra AsyncClient construction).
            token = _SESSION_CTXVAR.set("session-B")
            try:
                still_b = await mgr.get_client("conn-1")
            finally:
                _SESSION_CTXVAR.reset(token)
            assert still_b is b

    async def test_mcp_disconnect_does_not_evict_rest_slot(self, mock_db_profile):
        """REST cache must be invisible to MCP sessions and vice versa."""
        rest_client = _make_connected_client("rest")
        mcp_client = _make_connected_client("mcp")

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            side_effect=[rest_client, mcp_client],
        ):
            mgr = ClientManager()
            # REST caller (no contextvar set) populates the (None, _) slot.
            assert _SESSION_CTXVAR.get() is None
            await mgr.get_client("conn-1")

            token = _SESSION_CTXVAR.set("session-A")
            try:
                await mgr.get_client("conn-1")
                await mgr.close_client("conn-1")
            finally:
                _SESSION_CTXVAR.reset(token)

            assert ("session-A", "conn-1") not in mgr._clients
            assert (None, "conn-1") in mgr._clients


class TestRestPathPreserved:
    async def test_two_rest_calls_share_one_cached_client(self, mock_db_profile):
        """REST callers leave the contextvar at its default ``None``.

        Phase 1 behaviour: one cached AsyncClient per conn_id across
        all REST traffic. Regression net for ``test_client_manager.py``.
        """
        client = _make_connected_client("rest")

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            return_value=client,
        ) as mock_cls:
            mgr = ClientManager()

            first = await mgr.get_client("conn-rest")
            second = await mgr.get_client("conn-rest")

            mock_cls.assert_called_once()
            assert first is second is client
            assert set(mgr._clients) == {(None, "conn-rest")}

    async def test_rest_close_only_evicts_rest_slot(self, mock_db_profile):
        rest_client = _make_connected_client("rest")
        mcp_client = _make_connected_client("mcp")

        with patch(
            "aerospike_cluster_manager_api.client_manager.aerospike_py.AsyncClient",
            side_effect=[rest_client, mcp_client],
        ):
            mgr = ClientManager()
            await mgr.get_client("conn-1")  # REST

            token = _SESSION_CTXVAR.set("session-A")
            try:
                await mgr.get_client("conn-1")
            finally:
                _SESSION_CTXVAR.reset(token)

            await mgr.close_client("conn-1")  # REST close

            assert (None, "conn-1") not in mgr._clients
            assert ("session-A", "conn-1") in mgr._clients
