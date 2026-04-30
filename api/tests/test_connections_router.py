"""Integration tests for the connections router.

Uses httpx.AsyncClient with ASGITransport to test the /api/connections
endpoints against a real PostgreSQL database (via testcontainers).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.main import app


@asynccontextmanager
async def _noop_lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """No-op lifespan — the database is managed by the init_test_db fixture."""
    yield


@pytest.fixture()
async def client(init_test_db):
    """Provide an httpx AsyncClient wired to the FastAPI app.

    The ``init_test_db`` fixture ensures the database is up and seeded
    before requests are made.  We swap out the real lifespan (which
    calls ``db.init_db()`` / ``db.close_db()``) with a no-op so the
    fixture controls the pool lifecycle.  The SlowAPI rate limiter is
    also disabled to avoid throttling.
    """
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = _noop_lifespan

    app.state.limiter.enabled = False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.state.limiter.enabled = True
    app.router.lifespan_context = original_lifespan


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

CREATE_PAYLOAD = {
    "name": "Integration Test Conn",
    "hosts": ["10.0.0.1"],
    "port": 3000,
    "clusterName": "int-test",
    "username": "admin",
    "password": "supersecret",
    "color": "#FF5500",
}


def assert_no_password(data: dict) -> None:
    """Assert that the response dict does not contain a password field."""
    assert "password" not in data, f"Response should not contain 'password', got: {data.keys()}"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestListConnections:
    async def test_returns_list(self, client: AsyncClient):
        response = await client.get("/api/connections")
        assert response.status_code == 200

        body = response.json()
        assert isinstance(body, list)

    async def test_no_password_in_response(self, client: AsyncClient):
        response = await client.get("/api/connections")
        assert response.status_code == 200

        for item in response.json():
            assert_no_password(item)


class TestCreateConnection:
    async def test_create_returns_201(self, client: AsyncClient):
        response = await client.post("/api/connections", json=CREATE_PAYLOAD)
        assert response.status_code == 201

        body = response.json()
        assert body["name"] == CREATE_PAYLOAD["name"]
        assert body["hosts"] == CREATE_PAYLOAD["hosts"]
        assert body["port"] == CREATE_PAYLOAD["port"]
        assert body["clusterName"] == CREATE_PAYLOAD["clusterName"]
        assert body["color"] == CREATE_PAYLOAD["color"]
        assert body["id"].startswith("conn-")
        assert "createdAt" in body
        assert "updatedAt" in body

    async def test_no_password_in_response(self, client: AsyncClient):
        response = await client.post("/api/connections", json=CREATE_PAYLOAD)
        assert response.status_code == 201
        assert_no_password(response.json())

    async def test_create_minimal_payload(self, client: AsyncClient):
        """Creating with only required defaults should succeed."""
        response = await client.post("/api/connections", json={})
        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "New Connection"
        assert body["hosts"] == ["localhost"]
        assert body["port"] == 3000


class TestGetConnection:
    async def test_get_existing(self, client: AsyncClient):
        # Create first
        create_resp = await client.post("/api/connections", json=CREATE_PAYLOAD)
        conn_id = create_resp.json()["id"]

        response = await client.get(f"/api/connections/{conn_id}")
        assert response.status_code == 200

        body = response.json()
        assert body["id"] == conn_id
        assert body["name"] == CREATE_PAYLOAD["name"]

    async def test_no_password_in_response(self, client: AsyncClient):
        create_resp = await client.post("/api/connections", json=CREATE_PAYLOAD)
        conn_id = create_resp.json()["id"]

        response = await client.get(f"/api/connections/{conn_id}")
        assert response.status_code == 200
        assert_no_password(response.json())

    async def test_get_not_found(self, client: AsyncClient):
        response = await client.get("/api/connections/conn-nonexistent")
        assert response.status_code == 404


class TestConnectionLabels:
    async def test_create_without_labels_returns_env_default(self, client: AsyncClient):
        response = await client.post("/api/connections", json=CREATE_PAYLOAD)
        assert response.status_code == 201
        assert response.json()["labels"] == {"env": "default"}

    async def test_create_with_labels_persists_and_normalizes_env(self, client: AsyncClient):
        payload = {**CREATE_PAYLOAD, "labels": {"env": "prod", "idc": "평촌"}}
        response = await client.post("/api/connections", json=payload)
        assert response.status_code == 201
        assert response.json()["labels"] == {"env": "prod", "idc": "평촌"}

    async def test_create_without_env_key_auto_injects(self, client: AsyncClient):
        payload = {**CREATE_PAYLOAD, "labels": {"team": "ads"}}
        response = await client.post("/api/connections", json=payload)
        assert response.status_code == 201
        labels = response.json()["labels"]
        assert labels["team"] == "ads"
        assert labels["env"] == "default"

    async def test_update_replaces_labels(self, client: AsyncClient):
        create = await client.post("/api/connections", json=CREATE_PAYLOAD)
        conn_id = create.json()["id"]
        update = await client.put(f"/api/connections/{conn_id}", json={"labels": {"env": "stage"}})
        assert update.status_code == 200
        assert update.json()["labels"] == {"env": "stage"}

    async def test_update_without_labels_preserves(self, client: AsyncClient):
        create = await client.post("/api/connections", json={**CREATE_PAYLOAD, "labels": {"env": "prod"}})
        conn_id = create.json()["id"]
        update = await client.put(f"/api/connections/{conn_id}", json={"name": "Renamed"})
        assert update.status_code == 200
        assert update.json()["labels"] == {"env": "prod"}


class TestUpdateConnection:
    async def test_update_fields(self, client: AsyncClient):
        # Create first
        create_resp = await client.post("/api/connections", json=CREATE_PAYLOAD)
        conn_id = create_resp.json()["id"]

        update_payload = {"name": "Updated Name", "port": 4000, "color": "#00FF00"}
        response = await client.put(f"/api/connections/{conn_id}", json=update_payload)
        assert response.status_code == 200

        body = response.json()
        assert body["name"] == "Updated Name"
        assert body["port"] == 4000
        assert body["color"] == "#00FF00"
        # Unchanged fields should be preserved
        assert body["hosts"] == CREATE_PAYLOAD["hosts"]

    async def test_no_password_in_response(self, client: AsyncClient):
        create_resp = await client.post("/api/connections", json=CREATE_PAYLOAD)
        conn_id = create_resp.json()["id"]

        response = await client.put(f"/api/connections/{conn_id}", json={"name": "X"})
        assert response.status_code == 200
        assert_no_password(response.json())

    async def test_update_not_found(self, client: AsyncClient):
        response = await client.put("/api/connections/conn-nonexistent", json={"name": "X"})
        assert response.status_code == 404


class TestDeleteConnection:
    async def test_delete_returns_204(self, client: AsyncClient):
        create_resp = await client.post("/api/connections", json=CREATE_PAYLOAD)
        conn_id = create_resp.json()["id"]

        response = await client.delete(f"/api/connections/{conn_id}")
        assert response.status_code == 204

    async def test_get_after_delete_returns_404(self, client: AsyncClient):
        create_resp = await client.post("/api/connections", json=CREATE_PAYLOAD)
        conn_id = create_resp.json()["id"]

        delete_resp = await client.delete(f"/api/connections/{conn_id}")
        assert delete_resp.status_code == 204

        get_resp = await client.get(f"/api/connections/{conn_id}")
        assert get_resp.status_code == 404


class TestTestConnection:
    async def test_success(self, client: AsyncClient):
        """Test connection endpoint with a mocked aerospike client."""
        mock_client = AsyncMock()
        mock_client.connect = AsyncMock()
        mock_client.is_connected = lambda: True
        mock_client.close = AsyncMock()

        with patch(
            "aerospike_cluster_manager_api.routers.connections.aerospike_py.AsyncClient", return_value=mock_client
        ):
            response = await client.post(
                "/api/connections/test",
                json={"hosts": ["localhost"], "port": 3000},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["message"] == "Connected successfully"

    async def test_failure(self, client: AsyncClient):
        """Test connection endpoint when connection fails."""
        with patch(
            "aerospike_cluster_manager_api.routers.connections.aerospike_py.AsyncClient",
            side_effect=Exception("Connection refused"),
        ):
            response = await client.post(
                "/api/connections/test",
                json={"hosts": ["unreachable"], "port": 3000},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is False
        assert "Connection refused" in body["message"]

    async def test_not_connected(self, client: AsyncClient):
        """Test connection endpoint when client connects but is_connected returns False."""
        mock_client = AsyncMock()
        mock_client.connect = AsyncMock()
        mock_client.is_connected = lambda: False
        mock_client.close = AsyncMock()

        with patch(
            "aerospike_cluster_manager_api.routers.connections.aerospike_py.AsyncClient", return_value=mock_client
        ):
            response = await client.post(
                "/api/connections/test",
                json={"hosts": ["localhost"], "port": 3000},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is False
        assert "Failed to connect" in body["message"]

    async def test_with_credentials(self, client: AsyncClient):
        """Test connection endpoint passes credentials correctly."""
        mock_client = AsyncMock()
        mock_client.connect = AsyncMock()
        mock_client.is_connected = lambda: True
        mock_client.close = AsyncMock()

        with patch(
            "aerospike_cluster_manager_api.routers.connections.aerospike_py.AsyncClient", return_value=mock_client
        ) as mock_cls:
            response = await client.post(
                "/api/connections/test",
                json={
                    "hosts": ["localhost"],
                    "port": 3000,
                    "username": "admin",
                    "password": "secret",
                },
            )

        assert response.status_code == 200
        assert response.json()["success"] is True
        # Verify the client was constructed with credentials
        call_args = mock_cls.call_args[0][0]
        assert call_args["user"] == "admin"
        assert call_args["password"] == "secret"
