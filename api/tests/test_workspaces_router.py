"""Integration tests for the /api/workspaces router."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.dependencies import _resolve_caller_owner_id
from aerospike_cluster_manager_api.main import app
from aerospike_cluster_manager_api.models.workspace import SYSTEM_OWNER_ID


@asynccontextmanager
async def _noop_lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


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


def _override_caller(owner_id: str) -> None:
    """Pin the caller-owner-id dependency to ``owner_id`` for ACL tests.

    The router reads it via :func:`dependencies._resolve_caller_owner_id`
    which inspects ``request.state.user_claims``. Plumbing real claims
    through the OIDC middleware in tests would require a Keycloak fixture;
    overriding the dependency is the surgical way to drive the ACL.
    """
    app.dependency_overrides[_resolve_caller_owner_id] = lambda: owner_id


def _clear_caller_override() -> None:
    app.dependency_overrides.pop(_resolve_caller_owner_id, None)


@pytest.fixture()
def as_owner_a():
    _override_caller("user-a")
    yield "user-a"
    _clear_caller_override()


@pytest.fixture()
def as_owner_b():
    _override_caller("user-b")
    yield "user-b"
    _clear_caller_override()


CREATE_PAYLOAD = {
    "name": "team-a",
    "color": "#FF8800",
    "description": "Team A workspace",
}


class TestListWorkspaces:
    async def test_default_workspace_seeded(self, client: AsyncClient):
        response = await client.get("/api/workspaces")
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        # init_test_db's init_db() should have created the built-in default.
        assert any(w["id"] == "ws-default" and w["isDefault"] for w in body)

    async def test_default_sorts_first(self, client: AsyncClient):
        await client.post("/api/workspaces", json=CREATE_PAYLOAD)
        response = await client.get("/api/workspaces")
        body = response.json()
        assert body[0]["id"] == "ws-default"


class TestCreateWorkspace:
    async def test_returns_201(self, client: AsyncClient):
        response = await client.post("/api/workspaces", json=CREATE_PAYLOAD)
        assert response.status_code == 201
        body = response.json()
        assert body["id"].startswith("ws-")
        assert body["id"] != "ws-default"
        assert body["name"] == "team-a"
        assert body["color"] == "#FF8800"
        assert body["isDefault"] is False
        assert body["description"] == "Team A workspace"

    async def test_minimal_payload(self, client: AsyncClient):
        response = await client.post("/api/workspaces", json={"name": "minimal"})
        assert response.status_code == 201
        body = response.json()
        assert body["color"] == "#6366F1"
        assert body["description"] is None

    async def test_invalid_color(self, client: AsyncClient):
        response = await client.post("/api/workspaces", json={"name": "x", "color": "not-a-color"})
        assert response.status_code == 422

    async def test_empty_name(self, client: AsyncClient):
        response = await client.post("/api/workspaces", json={"name": ""})
        assert response.status_code == 422


class TestGetWorkspace:
    async def test_get_default(self, client: AsyncClient):
        response = await client.get("/api/workspaces/ws-default")
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == "ws-default"
        assert body["isDefault"] is True

    async def test_not_found(self, client: AsyncClient):
        response = await client.get("/api/workspaces/ws-missing")
        assert response.status_code == 404


class TestUpdateWorkspace:
    async def test_rename_default_allowed(self, client: AsyncClient):
        response = await client.put("/api/workspaces/ws-default", json={"name": "Production"})
        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Production"
        # Default flag must remain on after rename — we never let it flip.
        assert body["isDefault"] is True

    async def test_update_color(self, client: AsyncClient):
        create = await client.post("/api/workspaces", json=CREATE_PAYLOAD)
        ws_id = create.json()["id"]
        response = await client.put(f"/api/workspaces/{ws_id}", json={"color": "#00FF00"})
        assert response.status_code == 200
        assert response.json()["color"] == "#00FF00"

    async def test_partial_update_preserves_other_fields(self, client: AsyncClient):
        create = await client.post("/api/workspaces", json=CREATE_PAYLOAD)
        ws_id = create.json()["id"]
        response = await client.put(f"/api/workspaces/{ws_id}", json={"name": "renamed"})
        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "renamed"
        assert body["color"] == CREATE_PAYLOAD["color"]
        assert body["description"] == CREATE_PAYLOAD["description"]


class TestDeleteWorkspace:
    async def test_delete_empty_workspace(self, client: AsyncClient):
        create = await client.post("/api/workspaces", json=CREATE_PAYLOAD)
        ws_id = create.json()["id"]
        response = await client.delete(f"/api/workspaces/{ws_id}")
        assert response.status_code == 204
        # Confirm gone.
        assert (await client.get(f"/api/workspaces/{ws_id}")).status_code == 404

    async def test_delete_default_rejected(self, client: AsyncClient):
        response = await client.delete("/api/workspaces/ws-default")
        assert response.status_code == 400
        assert "default" in response.json()["detail"].lower()

    async def test_delete_with_connections_rejected(self, client: AsyncClient):
        ws_id = (await client.post("/api/workspaces", json=CREATE_PAYLOAD)).json()["id"]
        # Attach a connection
        conn_payload = {
            "name": "c1",
            "hosts": ["10.0.0.1"],
            "port": 3000,
            "color": "#FF5500",
            "workspaceId": ws_id,
        }
        await client.post("/api/connections", json=conn_payload)

        response = await client.delete(f"/api/workspaces/{ws_id}")
        assert response.status_code == 409
        assert "connection" in response.json()["detail"].lower()

    async def test_delete_not_found(self, client: AsyncClient):
        response = await client.delete("/api/workspaces/ws-missing")
        assert response.status_code == 404


class TestDeleteWorkspaceDbGuard:
    """Defense-in-depth: even direct db.delete_workspace() must not delete the default."""

    async def test_db_layer_refuses_to_delete_default(self, init_test_db):
        from aerospike_cluster_manager_api import db

        deleted = await db.delete_workspace("ws-default")
        assert deleted is False
        # The default workspace must still exist after the failed delete.
        ws = await db.get_workspace("ws-default")
        assert ws is not None
        assert ws.isDefault is True


class TestOwnerIdResponseShape:
    """The wire response always includes ``ownerId``."""

    async def test_create_response_carries_owner_id(self, client: AsyncClient):
        response = await client.post("/api/workspaces", json=CREATE_PAYLOAD)
        assert response.status_code == 201
        body = response.json()
        # Anonymous test client → SYSTEM_OWNER_ID.
        assert body["ownerId"] == SYSTEM_OWNER_ID

    async def test_create_request_owner_id_is_ignored(self, client: AsyncClient):
        """Even if a client sneaks ``ownerId`` into the create payload, the
        request schema rejects unknown fields. ``populate_by_name`` is true
        but extras are not allowed by default — assert behaviour is stable
        either way (server-side ownerId)."""
        payload = {**CREATE_PAYLOAD, "ownerId": "evil"}
        response = await client.post("/api/workspaces", json=payload)
        assert response.status_code == 201
        body = response.json()
        assert body["ownerId"] != "evil"

    async def test_get_default_workspace_owner_is_system(self, client: AsyncClient):
        response = await client.get("/api/workspaces/ws-default")
        assert response.status_code == 200
        assert response.json()["ownerId"] == SYSTEM_OWNER_ID


class TestOwnerScopedListing:
    """Phase 2 ACL — ``GET /api/workspaces`` is filtered to caller's own
    workspaces plus the synthetic ``system``-owned rows."""

    async def test_owner_a_does_not_see_owner_b_workspaces(self, client: AsyncClient, as_owner_a):
        # Owner A creates a workspace, then we switch to owner B and assert
        # the row is not returned.
        create = await client.post("/api/workspaces", json={**CREATE_PAYLOAD, "name": "a-only"})
        assert create.status_code == 201
        a_id = create.json()["id"]

        _override_caller("user-b")
        try:
            response = await client.get("/api/workspaces")
            assert response.status_code == 200
            ids = {w["id"] for w in response.json()}
            assert a_id not in ids
            # Default is owned by system → still visible to user-b.
            assert "ws-default" in ids
        finally:
            _override_caller("user-a")

    async def test_default_visible_to_every_caller(self, client: AsyncClient, as_owner_a):
        response = await client.get("/api/workspaces")
        assert response.status_code == 200
        ids = {w["id"] for w in response.json()}
        assert "ws-default" in ids


class TestOwnerScopedAccess:
    """Phase 2 ACL — cross-owner read/update/delete returns 404 (not 403)
    so id enumeration cannot leak workspace existence."""

    async def test_get_cross_owner_returns_404(self, client: AsyncClient, as_owner_a):
        create = await client.post("/api/workspaces", json={**CREATE_PAYLOAD, "name": "a-only"})
        a_id = create.json()["id"]

        _override_caller("user-b")
        try:
            response = await client.get(f"/api/workspaces/{a_id}")
            assert response.status_code == 404
        finally:
            _override_caller("user-a")

    async def test_put_cross_owner_returns_404(self, client: AsyncClient, as_owner_a):
        create = await client.post("/api/workspaces", json={**CREATE_PAYLOAD, "name": "a-only"})
        a_id = create.json()["id"]

        _override_caller("user-b")
        try:
            response = await client.put(f"/api/workspaces/{a_id}", json={"name": "hijacked"})
            assert response.status_code == 404
        finally:
            _override_caller("user-a")

    async def test_delete_cross_owner_returns_404(self, client: AsyncClient, as_owner_a):
        create = await client.post("/api/workspaces", json={**CREATE_PAYLOAD, "name": "a-only"})
        a_id = create.json()["id"]

        _override_caller("user-b")
        try:
            response = await client.delete(f"/api/workspaces/{a_id}")
            assert response.status_code == 404
        finally:
            _override_caller("user-a")

    async def test_owner_id_field_is_not_patchable(self, client: AsyncClient, as_owner_a):
        """Even passing ``ownerId`` in the PATCH body is silently ignored —
        the request model strips it and the service+DB layer enforces the
        invariant a second time."""
        create = await client.post("/api/workspaces", json=CREATE_PAYLOAD)
        a_id = create.json()["id"]

        response = await client.put(
            f"/api/workspaces/{a_id}",
            json={"name": "renamed", "ownerId": "user-b"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "renamed"
        assert body["ownerId"] == "user-a"
