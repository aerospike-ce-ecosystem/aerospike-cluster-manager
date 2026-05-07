"""Workspace gate -- Stream E.3 / GitHub issue #307.

The MCP registry decorator (``mcp/registry._assert_workspace_owns_arg``)
fires for tools whose call kwargs name a ``conn_id`` or ``workspace_id``
parameter. It compares the referenced workspace's owner against the
caller identity bridged in by :class:`mcp.user_context.MCPUserContextMiddleware`
(E.2) and raises ``MCPToolError(code="workspace_mismatch")`` on a
cross-tenant probe.

These tests pin down the gate's behavior by driving the contextvar
directly -- the same shortcut ``test_session_isolation.py`` uses for
the per-session cache. The HTTP-layer plumbing (middleware sets the
contextvar) is covered by ``test_user_context.py``; here we focus on
the gate's allow/deny matrix.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from aerospike_cluster_manager_api.mcp.errors import MCPToolError
from aerospike_cluster_manager_api.mcp.registry import _assert_workspace_owns_arg
from aerospike_cluster_manager_api.mcp.user_context import _CLAIMS_CTXVAR
from aerospike_cluster_manager_api.models.connection import ConnectionProfile
from aerospike_cluster_manager_api.models.workspace import (
    DEFAULT_WORKSPACE_ID,
    SYSTEM_OWNER_ID,
    Workspace,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _workspace(workspace_id: str, owner_id: str, *, is_default: bool = False) -> Workspace:
    now = datetime.now(UTC).isoformat()
    return Workspace(
        id=workspace_id,
        name=f"ws-{workspace_id}",
        color="#6366F1",
        description=None,
        isDefault=is_default,
        ownerId=owner_id,
        createdAt=now,
        updatedAt=now,
    )


def _connection(conn_id: str, workspace_id: str) -> ConnectionProfile:
    now = datetime.now(UTC).isoformat()
    return ConnectionProfile(
        id=conn_id,
        name=f"conn-{conn_id}",
        hosts=["localhost"],
        port=3000,
        clusterName="cluster",
        username=None,
        password=None,
        color="#0097D3",
        workspaceId=workspace_id,
        createdAt=now,
        updatedAt=now,
    )


@pytest.fixture()
def mock_db():
    """Patch ``mcp.registry.db`` so the gate's lookups are hermetic.

    Tests configure ``mock_db.get_workspace`` and ``mock_db.get_connection``
    return values per-case. The gate calls ``await db.get_workspace(id)``
    and ``await db.get_connection(id)`` so we use ``AsyncMock``.
    """
    with patch("aerospike_cluster_manager_api.mcp.registry.db") as mock_db:
        mock_db.get_workspace = AsyncMock()
        mock_db.get_connection = AsyncMock()
        yield mock_db


@pytest.fixture()
def in_oidc_session():
    """Bridge an OIDC user_claims dict into the contextvar for the test.

    Yields a callable so tests can switch between caller identities
    inside a single function. After the test we set the var back to
    ``None`` rather than reset()ing -- pytest-asyncio's setup and
    teardown can run in different :class:`contextvars.Context`s,
    which would invalidate the saved token. Setting to ``None`` is
    semantically equivalent (the default) and works across contexts.
    """

    def _set(claims: dict | None) -> None:
        _CLAIMS_CTXVAR.set(claims)

    yield _set

    _CLAIMS_CTXVAR.set(None)


# ---------------------------------------------------------------------------
# conn_id-based gate
# ---------------------------------------------------------------------------


class TestConnIdOwnershipGate:
    async def test_caller_owns_workspace_passes(self, mock_db, in_oidc_session) -> None:
        in_oidc_session({"sub": "alice"})
        mock_db.get_connection.return_value = _connection("conn-x", "ws-alice")
        mock_db.get_workspace.return_value = _workspace("ws-alice", owner_id="alice")

        # No exception -- the call would proceed to the tool body.
        await _assert_workspace_owns_arg(ctx=None, tool_name="get_record", kwargs={"conn_id": "conn-x"})

    async def test_default_workspace_accessible_to_any_caller(self, mock_db, in_oidc_session) -> None:
        # ``ws-default`` is owned by SYSTEM_OWNER_ID; the gate allows it
        # regardless of the caller's identity. This preserves Phase 1
        # behavior for connections placed in the default workspace.
        in_oidc_session({"sub": "bob"})
        mock_db.get_connection.return_value = _connection("conn-y", DEFAULT_WORKSPACE_ID)
        mock_db.get_workspace.return_value = _workspace(DEFAULT_WORKSPACE_ID, SYSTEM_OWNER_ID, is_default=True)

        await _assert_workspace_owns_arg(ctx=None, tool_name="get_record", kwargs={"conn_id": "conn-y"})

    async def test_cross_owner_conn_id_rejected_with_workspace_mismatch(self, mock_db, in_oidc_session) -> None:
        in_oidc_session({"sub": "alice"})
        mock_db.get_connection.return_value = _connection("conn-z", "ws-bob")
        mock_db.get_workspace.return_value = _workspace("ws-bob", owner_id="bob")

        with pytest.raises(MCPToolError) as exc:
            await _assert_workspace_owns_arg(ctx=None, tool_name="get_record", kwargs={"conn_id": "conn-z"})

        assert exc.value.code == "workspace_mismatch"
        # The wire message must NOT name the workspace -- a probing
        # caller should not be able to enumerate other tenants' ids.
        assert "ws-bob" not in str(exc.value)

    async def test_missing_conn_id_falls_through_to_tool_body(self, mock_db, in_oidc_session) -> None:
        # When the conn_id doesn't resolve, the gate is silent so the
        # tool body's normal "not found" path runs and the caller sees
        # ``code="not_found"`` -- not ``workspace_mismatch`` (would leak
        # existence by side channel).
        in_oidc_session({"sub": "alice"})
        mock_db.get_connection.return_value = None  # not found

        await _assert_workspace_owns_arg(ctx=None, tool_name="get_record", kwargs={"conn_id": "ghost"})
        mock_db.get_workspace.assert_not_called()


# ---------------------------------------------------------------------------
# workspace_id-based gate (K8s tools, etc.)
# ---------------------------------------------------------------------------


class TestWorkspaceIdOwnershipGate:
    async def test_caller_owns_workspace_id_passes(self, mock_db, in_oidc_session) -> None:
        in_oidc_session({"sub": "alice"})
        mock_db.get_workspace.return_value = _workspace("ws-alice", owner_id="alice")

        await _assert_workspace_owns_arg(
            ctx=None,
            tool_name="list_k8s_clusters",
            kwargs={"workspace_id": "ws-alice"},
        )
        mock_db.get_connection.assert_not_called()  # short-circuits to direct workspace lookup

    async def test_cross_owner_workspace_id_rejected(self, mock_db, in_oidc_session) -> None:
        in_oidc_session({"sub": "alice"})
        mock_db.get_workspace.return_value = _workspace("ws-bob", owner_id="bob")

        with pytest.raises(MCPToolError) as exc:
            await _assert_workspace_owns_arg(
                ctx=None,
                tool_name="list_k8s_clusters",
                kwargs={"workspace_id": "ws-bob"},
            )
        assert exc.value.code == "workspace_mismatch"

    async def test_missing_workspace_id_falls_through(self, mock_db, in_oidc_session) -> None:
        in_oidc_session({"sub": "alice"})
        mock_db.get_workspace.return_value = None

        await _assert_workspace_owns_arg(
            ctx=None,
            tool_name="list_k8s_clusters",
            kwargs={"workspace_id": "ghost"},
        )

    async def test_default_workspace_id_accessible_to_any_caller(self, mock_db, in_oidc_session) -> None:
        in_oidc_session({"sub": "bob"})
        mock_db.get_workspace.return_value = _workspace(DEFAULT_WORKSPACE_ID, SYSTEM_OWNER_ID, is_default=True)

        await _assert_workspace_owns_arg(
            ctx=None,
            tool_name="list_k8s_clusters",
            kwargs={"workspace_id": DEFAULT_WORKSPACE_ID},
        )


# ---------------------------------------------------------------------------
# Bypass paths
# ---------------------------------------------------------------------------


class TestBypassPaths:
    async def test_bearer_sentinel_bypasses_gate(self, mock_db, in_oidc_session) -> None:
        # MCPBearerTokenMiddleware sets this exact sentinel on a successful
        # bearer match. Bearer mode is single-tenant so the gate is moot.
        in_oidc_session({"sub": "mcp-bearer", "_mcp_bearer": True})

        # Even with a "cross-owner" conn_id, the gate must NOT touch the DB.
        await _assert_workspace_owns_arg(ctx=None, tool_name="get_record", kwargs={"conn_id": "conn-anywhere"})
        mock_db.get_connection.assert_not_called()
        mock_db.get_workspace.assert_not_called()

    async def test_no_claims_bypasses_gate(self, mock_db) -> None:
        # No OIDC middleware ran (anonymous deployment, OIDC_ENABLED=false).
        # The gate falls back to Phase 1 single-tenant behavior. Same
        # path also covers direct unit-test invocations of tool bodies
        # outside the HTTP layer.
        await _assert_workspace_owns_arg(ctx=None, tool_name="get_record", kwargs={"conn_id": "conn-anywhere"})
        mock_db.get_connection.assert_not_called()

    async def test_missing_sub_claim_bypasses_gate(self, mock_db, in_oidc_session) -> None:
        # A misconfigured IdP that does not emit ``sub`` would otherwise
        # lock the caller out of every workspace. Match the
        # ``dependencies._resolve_caller_owner_id`` behavior on the REST
        # side -- degrade to "no caller identity, single tenant".
        in_oidc_session({"iss": "https://idp.example", "aud": "acm"})

        await _assert_workspace_owns_arg(ctx=None, tool_name="get_record", kwargs={"conn_id": "conn-anywhere"})
        mock_db.get_connection.assert_not_called()

    async def test_tool_with_neither_conn_id_nor_workspace_id_bypasses_gate(self, mock_db, in_oidc_session) -> None:
        # ``test_connection`` takes ``hosts`` / ``port`` -- no ownership
        # to check.
        in_oidc_session({"sub": "alice"})

        await _assert_workspace_owns_arg(
            ctx=None,
            tool_name="test_connection",
            kwargs={"hosts": ["localhost"], "port": 3000},
        )
        mock_db.get_connection.assert_not_called()
        mock_db.get_workspace.assert_not_called()


# ---------------------------------------------------------------------------
# Custom claim configuration
# ---------------------------------------------------------------------------


class TestClaimConfiguration:
    async def test_custom_acm_oidc_owner_claim(self, mock_db, in_oidc_session) -> None:
        # Some IdPs emit ``sub`` with an opaque uuid and expose the
        # human-meaningful identity in ``preferred_username``. The
        # ``ACM_OIDC_OWNER_CLAIM`` config knob (PR #314) lets operators
        # pick which claim to use; the gate honours it.
        in_oidc_session({"sub": "uuid-1234", "preferred_username": "alice"})
        mock_db.get_connection.return_value = _connection("conn-x", "ws-alice")
        mock_db.get_workspace.return_value = _workspace("ws-alice", owner_id="alice")

        with patch(
            "aerospike_cluster_manager_api.mcp.registry.config.ACM_OIDC_OWNER_CLAIM",
            "preferred_username",
        ):
            await _assert_workspace_owns_arg(
                ctx=None,
                tool_name="get_record",
                kwargs={"conn_id": "conn-x"},
            )
