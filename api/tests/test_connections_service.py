"""Unit tests for the connections service layer.

These tests exercise ``services.connections_service`` directly — without going
through FastAPI — so the service contract stays stable independent of the
REST router. The router-layer regression net lives in ``test_connections_router.py``.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from aerospike_cluster_manager_api.models.connection import (
    ConnectionProfileResponse,
    CreateConnectionRequest,
    UpdateConnectionRequest,
)
from aerospike_cluster_manager_api.models.connection import (
    TestConnectionRequest as _TestConnectionRequest,
)
from aerospike_cluster_manager_api.services import connections_service
from aerospike_cluster_manager_api.services.connections_service import (
    ConnectionNotFoundError,
    WorkspaceNotFoundError,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_payload(**overrides) -> CreateConnectionRequest:
    base = {
        "name": "Service Test Conn",
        "hosts": ["10.0.0.1"],
        "port": 3000,
        "clusterName": "svc-test",
        "username": "admin",
        "password": "supersecret",
        "color": "#FF5500",
    }
    base.update(overrides)
    return CreateConnectionRequest(**base)


# ---------------------------------------------------------------------------
# list_connections
# ---------------------------------------------------------------------------


class TestListConnections:
    async def test_returns_list_for_default_workspace(self, init_test_db):
        result = await connections_service.list_connections(workspace_id="ws-default")
        assert isinstance(result, list)
        assert all(isinstance(item, ConnectionProfileResponse) for item in result)

    async def test_returns_list_for_no_workspace_filter(self, init_test_db):
        result = await connections_service.list_connections(workspace_id=None)
        assert isinstance(result, list)

    async def test_unknown_workspace_raises(self, init_test_db):
        with pytest.raises(WorkspaceNotFoundError):
            await connections_service.list_connections(workspace_id="ws-missing")

    async def test_filter_returns_only_matching_workspace(self, init_test_db):
        # Seed a second workspace via direct db insert
        from datetime import UTC, datetime

        from aerospike_cluster_manager_api import db
        from aerospike_cluster_manager_api.models.workspace import SYSTEM_OWNER_ID, Workspace

        now = datetime.now(UTC).isoformat()
        ws = Workspace(
            id="ws-team-svc",
            name="team-svc",
            color="#123456",
            ownerId=SYSTEM_OWNER_ID,
            createdAt=now,
            updatedAt=now,
        )
        await db.create_workspace(ws)

        await connections_service.create_connection(_create_payload(workspaceId="ws-default"))
        await connections_service.create_connection(_create_payload(workspaceId="ws-team-svc"))

        ws_default = await connections_service.list_connections(workspace_id="ws-default")
        ws_team = await connections_service.list_connections(workspace_id="ws-team-svc")

        assert all(item.workspaceId == "ws-default" for item in ws_default)
        assert all(item.workspaceId == "ws-team-svc" for item in ws_team)
        assert len(ws_team) >= 1

    async def test_caller_filter_hides_other_owner_workspaces(self, init_test_db):
        from datetime import UTC, datetime

        from aerospike_cluster_manager_api import db
        from aerospike_cluster_manager_api.models.workspace import Workspace

        now = datetime.now(UTC).isoformat()
        await db.create_workspace(
            Workspace(id="ws-alice", name="alice", color="#111111", ownerId="alice", createdAt=now, updatedAt=now)
        )
        await db.create_workspace(
            Workspace(id="ws-bob", name="bob", color="#222222", ownerId="bob", createdAt=now, updatedAt=now)
        )
        await connections_service.create_connection(
            _create_payload(name="alice-conn", workspaceId="ws-alice"), caller_owner_id="alice"
        )
        await connections_service.create_connection(
            _create_payload(name="bob-conn", workspaceId="ws-bob"), caller_owner_id="bob"
        )

        alice_view = await connections_service.list_connections(workspace_id=None, caller_owner_id="alice")
        bob_view = await connections_service.list_connections(workspace_id=None, caller_owner_id="bob")

        alice_names = {c.name for c in alice_view}
        bob_names = {c.name for c in bob_view}
        assert "alice-conn" in alice_names
        assert "bob-conn" not in alice_names
        assert "bob-conn" in bob_names
        assert "alice-conn" not in bob_names


# ---------------------------------------------------------------------------
# create_connection
# ---------------------------------------------------------------------------


class TestCreateConnection:
    async def test_returns_response_without_password(self, init_test_db):
        result = await connections_service.create_connection(_create_payload())
        assert isinstance(result, ConnectionProfileResponse)
        # ConnectionProfileResponse never contains a password field
        assert "password" not in result.model_dump()
        assert result.id.startswith("conn-")
        assert result.name == "Service Test Conn"

    async def test_default_workspace_when_none_provided(self, init_test_db):
        result = await connections_service.create_connection(_create_payload())
        assert result.workspaceId == "ws-default"

    async def test_unknown_workspace_raises(self, init_test_db):
        with pytest.raises(WorkspaceNotFoundError):
            await connections_service.create_connection(_create_payload(workspaceId="ws-missing"))

    async def test_persisted_can_be_retrieved(self, init_test_db):
        created = await connections_service.create_connection(_create_payload())
        fetched = await connections_service.get_connection(created.id, "system")
        assert fetched.id == created.id
        assert fetched.name == created.name


# ---------------------------------------------------------------------------
# get_connection
# ---------------------------------------------------------------------------


class TestGetConnection:
    async def test_returns_existing(self, init_test_db):
        created = await connections_service.create_connection(_create_payload())
        result = await connections_service.get_connection(created.id, "system")
        assert isinstance(result, ConnectionProfileResponse)
        assert result.id == created.id

    async def test_missing_raises(self, init_test_db):
        with pytest.raises(ConnectionNotFoundError):
            await connections_service.get_connection("conn-nonexistent", "system")

    async def test_cross_owner_returns_not_found(self, init_test_db):
        """P1-2 regression: get_connection now requires caller_owner_id and
        rejects cross-tenant probes with the same wire shape as missing."""
        from datetime import UTC, datetime

        from aerospike_cluster_manager_api import db
        from aerospike_cluster_manager_api.models.workspace import Workspace

        now = datetime.now(UTC).isoformat()
        await db.create_workspace(
            Workspace(id="ws-alice", name="alice", color="#111111", ownerId="alice", createdAt=now, updatedAt=now)
        )
        created = await connections_service.create_connection(
            _create_payload(name="alice-only", workspaceId="ws-alice"), caller_owner_id="alice"
        )
        with pytest.raises(ConnectionNotFoundError):
            await connections_service.get_connection(created.id, caller_owner_id="bob")


# ---------------------------------------------------------------------------
# update_connection
# ---------------------------------------------------------------------------


class TestUpdateConnection:
    async def test_updates_fields(self, init_test_db):
        created = await connections_service.create_connection(_create_payload())
        update = UpdateConnectionRequest(name="Renamed", port=4000, color="#00FF00")
        result = await connections_service.update_connection(created.id, update)
        assert result.name == "Renamed"
        assert result.port == 4000
        assert result.color == "#00FF00"
        # Untouched fields preserved
        assert result.hosts == ["10.0.0.1"]

    async def test_missing_raises(self, init_test_db):
        update = UpdateConnectionRequest(name="X")
        with pytest.raises(ConnectionNotFoundError):
            await connections_service.update_connection("conn-nonexistent", update)

    async def test_unknown_workspace_raises(self, init_test_db):
        created = await connections_service.create_connection(_create_payload())
        update = UpdateConnectionRequest(workspaceId="ws-missing")
        with pytest.raises(WorkspaceNotFoundError):
            await connections_service.update_connection(created.id, update)


# ---------------------------------------------------------------------------
# delete_connection
# ---------------------------------------------------------------------------


class TestDeleteConnection:
    async def test_deletes_existing(self, init_test_db):
        created = await connections_service.create_connection(_create_payload())
        await connections_service.delete_connection(created.id)
        with pytest.raises(ConnectionNotFoundError):
            await connections_service.get_connection(created.id, "system")

    async def test_idempotent_for_missing(self, init_test_db):
        # Delete twice — second call must not raise (idempotent).
        # The router already returns 204 unconditionally; service mirrors that.
        created = await connections_service.create_connection(_create_payload())
        await connections_service.delete_connection(created.id)
        await connections_service.delete_connection(created.id)

    async def test_cross_owner_delete_returns_not_found(self, init_test_db):
        """Defense-in-depth: a caller from another tenant must not be able
        to delete a connection in someone else's workspace, even if they
        somehow bypass ``_get_verified_connection``. Mirrors the
        ``get_connection`` cross-tenant probe contract."""
        from datetime import UTC, datetime

        from aerospike_cluster_manager_api import db
        from aerospike_cluster_manager_api.models.workspace import Workspace

        now = datetime.now(UTC).isoformat()
        await db.create_workspace(
            Workspace(id="ws-alice", name="alice", color="#111111", ownerId="alice", createdAt=now, updatedAt=now)
        )
        created = await connections_service.create_connection(
            _create_payload(name="alice-only", workspaceId="ws-alice"), caller_owner_id="alice"
        )
        with pytest.raises(ConnectionNotFoundError):
            await connections_service.delete_connection(created.id, caller_owner_id="bob")
        # The row must still exist — bob's cross-tenant attempt was rejected.
        assert await db.get_connection(created.id) is not None

    async def test_owner_delete_succeeds(self, init_test_db):
        """Owner of the workspace can still delete their own connection."""
        from datetime import UTC, datetime

        from aerospike_cluster_manager_api import db
        from aerospike_cluster_manager_api.models.workspace import Workspace

        now = datetime.now(UTC).isoformat()
        await db.create_workspace(
            Workspace(id="ws-alice2", name="alice2", color="#111111", ownerId="alice", createdAt=now, updatedAt=now)
        )
        created = await connections_service.create_connection(
            _create_payload(name="alice-deletable", workspaceId="ws-alice2"), caller_owner_id="alice"
        )
        await connections_service.delete_connection(created.id, caller_owner_id="alice")
        assert await db.get_connection(created.id) is None


# ---------------------------------------------------------------------------
# test_connection
# ---------------------------------------------------------------------------


class TestTestConnection:
    async def test_success(self, init_test_db):
        mock_client = AsyncMock()
        mock_client.connect = AsyncMock()
        mock_client.is_connected = lambda: True
        mock_client.close = AsyncMock()

        with patch(
            "aerospike_cluster_manager_api.services.connections_service.aerospike_py.AsyncClient",
            return_value=mock_client,
        ):
            result = await connections_service.test_connection(_TestConnectionRequest(hosts=["localhost"], port=3000))

        # Phase 1: result is now a TestConnectionResult NamedTuple, not a dict.
        assert result.success is True
        assert result.message == "Connected successfully"

    async def test_not_connected(self, init_test_db):
        mock_client = AsyncMock()
        mock_client.connect = AsyncMock()
        mock_client.is_connected = lambda: False
        mock_client.close = AsyncMock()

        with patch(
            "aerospike_cluster_manager_api.services.connections_service.aerospike_py.AsyncClient",
            return_value=mock_client,
        ):
            result = await connections_service.test_connection(_TestConnectionRequest(hosts=["localhost"], port=3000))

        assert result.success is False
        assert "Failed to connect" in result.message

    async def test_failure(self, init_test_db):
        with patch(
            "aerospike_cluster_manager_api.services.connections_service.aerospike_py.AsyncClient",
            side_effect=Exception("Connection refused"),
        ):
            result = await connections_service.test_connection(_TestConnectionRequest(hosts=["unreachable"], port=3000))

        assert result.success is False
        assert result.message == "connection failed"

    async def test_closes_client_when_connect_raises(self, init_test_db):
        """The constructed AsyncClient must be closed even when connect() fails.

        connect() can raise *after* the constructor allocated Rust-side
        resources. A close confined to a post-connect block would then leak
        one half-open native client per failed probe.
        """
        mock_client = AsyncMock()
        mock_client.connect = AsyncMock(side_effect=Exception("Connection refused"))
        mock_client.is_connected = lambda: False
        mock_client.close = AsyncMock()

        with patch(
            "aerospike_cluster_manager_api.services.connections_service.aerospike_py.AsyncClient",
            return_value=mock_client,
        ):
            result = await connections_service.test_connection(_TestConnectionRequest(hosts=["unreachable"], port=3000))

        assert result.success is False
        assert result.message == "connection failed"
        mock_client.close.assert_awaited_once()

    async def test_passes_credentials(self, init_test_db):
        mock_client = AsyncMock()
        mock_client.connect = AsyncMock()
        mock_client.is_connected = lambda: True
        mock_client.close = AsyncMock()

        with patch(
            "aerospike_cluster_manager_api.services.connections_service.aerospike_py.AsyncClient",
            return_value=mock_client,
        ) as mock_cls:
            await connections_service.test_connection(
                _TestConnectionRequest(hosts=["localhost"], port=3000, username="admin", password="secret")
            )

        call_args = mock_cls.call_args[0][0]
        assert call_args["user"] == "admin"
        assert call_args["password"] == "secret"
