"""Integration tests for the /api/workspaces router."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.main import app


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
