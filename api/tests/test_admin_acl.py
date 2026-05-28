"""Workspace ACL coverage for the admin_users / admin_roles routers.

P0 regression guard: before this fix the admin endpoints accepted
``conn_id`` in the path but never resolved it through
:data:`VerifiedConnId`, so a caller who knew (or guessed) a foreign
connection id could read/mutate users and roles on a cluster owned by
a different workspace — cross-tenant privilege escalation.

These tests pin the contract by seeding a connection inside Alice's
workspace and then issuing admin requests as Bob; every endpoint must
404 (identity-404, not 403, matching the wire shape used by every
other ACL-gated router so id enumeration stays impossible).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.dependencies import _resolve_caller_owner_id
from aerospike_cluster_manager_api.main import app
from aerospike_cluster_manager_api.models.connection import ConnectionProfile
from aerospike_cluster_manager_api.models.workspace import Workspace


@asynccontextmanager
async def _noop_lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


def _override_caller(owner_id: str) -> None:
    app.dependency_overrides[_resolve_caller_owner_id] = lambda: owner_id


def _clear_caller_override() -> None:
    app.dependency_overrides.pop(_resolve_caller_owner_id, None)


@pytest.fixture()
async def client(init_test_db):
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = _noop_lifespan

    app.state.limiter.enabled = False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.state.limiter.enabled = True
    app.router.lifespan_context = original_lifespan
    _clear_caller_override()


async def _seed_workspace(ws_id: str, owner_id: str) -> None:
    now = datetime.now(UTC).isoformat()
    await db.create_workspace(
        Workspace(
            id=ws_id,
            name=f"ws-{ws_id}",
            color="#6366F1",
            description=None,
            isDefault=False,
            ownerId=owner_id,
            createdAt=now,
            updatedAt=now,
        )
    )


async def _seed_connection(conn_id: str, workspace_id: str) -> None:
    now = datetime.now(UTC).isoformat()
    await db.create_connection(
        ConnectionProfile(
            id=conn_id,
            name=f"test-{conn_id}",
            hosts=["localhost"],
            port=3000,
            color="#0097D3",
            workspaceId=workspace_id,
            createdAt=now,
            updatedAt=now,
        )
    )


def _no_aerospike_client():
    """Patch the aerospike client factory so it never actually runs.

    The ACL gate (``_get_verified_connection``) runs BEFORE the
    aerospike client is built. If the ACL correctly rejects the request
    we never reach this mock; if it doesn't, the mock keeps the test
    from accidentally talking to a real Aerospike cluster.
    """
    return patch(
        "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
        AsyncMock(return_value=AsyncMock()),
    )


class TestAdminUsersWorkspaceAcl:
    """Bob must not be able to list / create / change / delete users on
    Alice's connection."""

    async def test_cross_owner_list_users_returns_404(self, client: AsyncClient) -> None:
        await _seed_workspace("ws-alice-u1", "alice")
        await _seed_connection("conn-alice-u1", workspace_id="ws-alice-u1")

        _override_caller("bob")
        with _no_aerospike_client():
            resp = await client.get("/api/admin/conn-alice-u1/users")

        assert resp.status_code == 404, resp.text

    async def test_cross_owner_create_user_returns_404(self, client: AsyncClient) -> None:
        await _seed_workspace("ws-alice-u2", "alice")
        await _seed_connection("conn-alice-u2", workspace_id="ws-alice-u2")

        _override_caller("bob")
        with _no_aerospike_client():
            resp = await client.post(
                "/api/admin/conn-alice-u2/users",
                json={"username": "evil", "password": "evil-pw", "roles": ["read"]},
            )

        assert resp.status_code == 404, resp.text

    async def test_cross_owner_change_password_returns_404(self, client: AsyncClient) -> None:
        await _seed_workspace("ws-alice-u3", "alice")
        await _seed_connection("conn-alice-u3", workspace_id="ws-alice-u3")

        _override_caller("bob")
        with _no_aerospike_client():
            resp = await client.patch(
                "/api/admin/conn-alice-u3/users",
                json={"username": "alice", "password": "stolen"},
            )

        assert resp.status_code == 404, resp.text

    async def test_cross_owner_delete_user_returns_404(self, client: AsyncClient) -> None:
        await _seed_workspace("ws-alice-u4", "alice")
        await _seed_connection("conn-alice-u4", workspace_id="ws-alice-u4")

        _override_caller("bob")
        with _no_aerospike_client():
            resp = await client.delete("/api/admin/conn-alice-u4/users?username=alice")

        assert resp.status_code == 404, resp.text

    async def test_owner_can_list_own_users(self, client: AsyncClient) -> None:
        """Sanity: the gate must not break access for the rightful owner."""
        await _seed_workspace("ws-alice-u5", "alice")
        await _seed_connection("conn-alice-u5", workspace_id="ws-alice-u5")

        mock_client = AsyncMock()
        mock_client.admin_query_users_info = AsyncMock(return_value=[])

        _override_caller("alice")
        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            AsyncMock(return_value=mock_client),
        ):
            resp = await client.get("/api/admin/conn-alice-u5/users")

        assert resp.status_code == 200, resp.text
        assert resp.json() == []


class TestAdminRolesWorkspaceAcl:
    """Bob must not be able to list / create / delete roles on Alice's
    connection."""

    async def test_cross_owner_list_roles_returns_404(self, client: AsyncClient) -> None:
        await _seed_workspace("ws-alice-r1", "alice")
        await _seed_connection("conn-alice-r1", workspace_id="ws-alice-r1")

        _override_caller("bob")
        with _no_aerospike_client():
            resp = await client.get("/api/admin/conn-alice-r1/roles")

        assert resp.status_code == 404, resp.text

    async def test_cross_owner_create_role_returns_404(self, client: AsyncClient) -> None:
        await _seed_workspace("ws-alice-r2", "alice")
        await _seed_connection("conn-alice-r2", workspace_id="ws-alice-r2")

        _override_caller("bob")
        with _no_aerospike_client():
            resp = await client.post(
                "/api/admin/conn-alice-r2/roles",
                json={
                    "name": "evil_role",
                    "privileges": [{"code": "read-write", "namespace": "test", "set": ""}],
                },
            )

        assert resp.status_code == 404, resp.text

    async def test_cross_owner_delete_role_returns_404(self, client: AsyncClient) -> None:
        await _seed_workspace("ws-alice-r3", "alice")
        await _seed_connection("conn-alice-r3", workspace_id="ws-alice-r3")

        _override_caller("bob")
        with _no_aerospike_client():
            resp = await client.delete("/api/admin/conn-alice-r3/roles?name=admin")

        assert resp.status_code == 404, resp.text

    async def test_owner_can_list_own_roles(self, client: AsyncClient) -> None:
        """Sanity: the gate must not break access for the rightful owner."""
        await _seed_workspace("ws-alice-r4", "alice")
        await _seed_connection("conn-alice-r4", workspace_id="ws-alice-r4")

        mock_client = AsyncMock()
        mock_client.admin_query_roles = AsyncMock(return_value=[])

        _override_caller("alice")
        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            AsyncMock(return_value=mock_client),
        ):
            resp = await client.get("/api/admin/conn-alice-r4/roles")

        assert resp.status_code == 200, resp.text
        assert resp.json() == []
