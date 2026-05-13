"""Unit tests for the workspaces service layer.

Exercise ``services.workspaces_service`` directly so the same functions can
be reused by additional REST API consumers without touching the router
layer. The router-layer regression net lives in ``test_workspaces_router.py``.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.models.workspace import (
    DEFAULT_WORKSPACE_ID,
    SYSTEM_OWNER_ID,
    CreateWorkspaceRequest,
    UpdateWorkspaceRequest,
    Workspace,
    WorkspaceResponse,
)
from aerospike_cluster_manager_api.services import workspaces_service
from aerospike_cluster_manager_api.services.connections_service import (
    WorkspaceNotFoundError,
)
from aerospike_cluster_manager_api.services.workspaces_service import (
    WorkspaceHasConnectionsError,
    WorkspaceIsDefaultError,
)

OWNER_A = "user-a"
OWNER_B = "user-b"


def _create_payload(name: str = "team-svc") -> CreateWorkspaceRequest:
    return CreateWorkspaceRequest(name=name, color="#123456")


# ---------------------------------------------------------------------------
# create_workspace
# ---------------------------------------------------------------------------


class TestCreateWorkspace:
    async def test_populates_owner_id_from_caller(self, init_test_db):
        result = await workspaces_service.create_workspace(_create_payload(), OWNER_A)
        assert isinstance(result, WorkspaceResponse)
        assert result.ownerId == OWNER_A
        assert result.id.startswith("ws-")
        assert result.id != DEFAULT_WORKSPACE_ID

    async def test_persisted_can_be_retrieved(self, init_test_db):
        created = await workspaces_service.create_workspace(_create_payload(), OWNER_A)
        fetched = await workspaces_service.get_workspace(created.id, OWNER_A)
        assert fetched.id == created.id
        assert fetched.ownerId == OWNER_A


# ---------------------------------------------------------------------------
# list_workspaces
# ---------------------------------------------------------------------------


class TestListWorkspaces:
    async def test_default_visible_to_any_owner(self, init_test_db):
        rows = await workspaces_service.list_workspaces(OWNER_A)
        assert any(w.id == DEFAULT_WORKSPACE_ID for w in rows)

    async def test_filters_by_owner(self, init_test_db):
        await workspaces_service.create_workspace(_create_payload("team-a-1"), OWNER_A)
        await workspaces_service.create_workspace(_create_payload("team-b-1"), OWNER_B)

        rows_a = await workspaces_service.list_workspaces(OWNER_A)
        rows_b = await workspaces_service.list_workspaces(OWNER_B)

        names_a = {w.name for w in rows_a}
        names_b = {w.name for w in rows_b}

        assert "team-a-1" in names_a
        assert "team-a-1" not in names_b
        assert "team-b-1" in names_b
        assert "team-b-1" not in names_a
        # Default is visible to both because its owner is the system sentinel.
        assert any(w.id == DEFAULT_WORKSPACE_ID for w in rows_a)
        assert any(w.id == DEFAULT_WORKSPACE_ID for w in rows_b)


# ---------------------------------------------------------------------------
# get_workspace
# ---------------------------------------------------------------------------


class TestGetWorkspace:
    async def test_owner_can_read(self, init_test_db):
        created = await workspaces_service.create_workspace(_create_payload(), OWNER_A)
        result = await workspaces_service.get_workspace(created.id, OWNER_A)
        assert result.id == created.id

    async def test_default_visible_to_any_caller(self, init_test_db):
        result = await workspaces_service.get_workspace(DEFAULT_WORKSPACE_ID, OWNER_A)
        assert result.id == DEFAULT_WORKSPACE_ID

    async def test_cross_owner_returns_not_found(self, init_test_db):
        created = await workspaces_service.create_workspace(_create_payload(), OWNER_A)
        with pytest.raises(WorkspaceNotFoundError):
            await workspaces_service.get_workspace(created.id, OWNER_B)

    async def test_truly_missing_returns_not_found(self, init_test_db):
        with pytest.raises(WorkspaceNotFoundError):
            await workspaces_service.get_workspace("ws-missing", OWNER_A)


# ---------------------------------------------------------------------------
# update_workspace
# ---------------------------------------------------------------------------


class TestUpdateWorkspace:
    async def test_owner_can_update(self, init_test_db):
        created = await workspaces_service.create_workspace(_create_payload(), OWNER_A)
        result = await workspaces_service.update_workspace(created.id, UpdateWorkspaceRequest(name="renamed"), OWNER_A)
        assert result.name == "renamed"
        # ownerId is read-only — cannot change via update.
        assert result.ownerId == OWNER_A

    async def test_cross_owner_rejected(self, init_test_db):
        created = await workspaces_service.create_workspace(_create_payload(), OWNER_A)
        with pytest.raises(WorkspaceNotFoundError):
            await workspaces_service.update_workspace(created.id, UpdateWorkspaceRequest(name="hijacked"), OWNER_B)

    async def test_non_system_caller_cannot_update_system_workspace(self, init_test_db):
        """Regression: visibility != ownership.

        ``ws-default`` is owned by ``SYSTEM_OWNER_ID`` and visible to every
        authenticated caller. Before the fix, any tenant could rename or
        recolor it because update_workspace gated on visibility alone.
        """
        with pytest.raises(WorkspaceNotFoundError):
            await workspaces_service.update_workspace(
                DEFAULT_WORKSPACE_ID,
                UpdateWorkspaceRequest(name="hijacked-default"),
                OWNER_A,
            )
        # The default must be intact afterwards.
        fetched = await workspaces_service.get_workspace(DEFAULT_WORKSPACE_ID, OWNER_A)
        assert fetched.name != "hijacked-default"

    async def test_system_caller_can_update_system_workspace(self, init_test_db):
        """SYSTEM caller (anonymous / single-tenant fallback) keeps the
        legacy permissive path so ``ws-default`` stays manageable."""
        result = await workspaces_service.update_workspace(
            DEFAULT_WORKSPACE_ID,
            UpdateWorkspaceRequest(name="System Renamed"),
            SYSTEM_OWNER_ID,
        )
        assert result.name == "System Renamed"

    async def test_owner_id_in_db_layer_not_mutated(self, init_test_db):
        """Defense-in-depth: even when a stale ``ownerId`` key reaches the
        DB merge helper, ``build_merged_workspace`` holds the field
        constant. Hits the persistence layer directly so the test does
        not depend on any router/middleware shape."""
        created = await workspaces_service.create_workspace(_create_payload(), OWNER_A)

        # Bypass the service and pass a sneaky ownerId directly to the DB.
        # The merge helper must drop it.
        merged = await db.update_workspace(created.id, {"name": "renamed", "ownerId": OWNER_B})
        assert merged is not None
        assert merged.name == "renamed"
        assert merged.ownerId == OWNER_A


# ---------------------------------------------------------------------------
# delete_workspace
# ---------------------------------------------------------------------------


class TestDeleteWorkspace:
    async def test_owner_can_delete(self, init_test_db):
        created = await workspaces_service.create_workspace(_create_payload(), OWNER_A)
        await workspaces_service.delete_workspace(created.id, OWNER_A)
        with pytest.raises(WorkspaceNotFoundError):
            await workspaces_service.get_workspace(created.id, OWNER_A)

    async def test_cross_owner_rejected(self, init_test_db):
        created = await workspaces_service.create_workspace(_create_payload(), OWNER_A)
        with pytest.raises(WorkspaceNotFoundError):
            await workspaces_service.delete_workspace(created.id, OWNER_B)

    async def test_default_rejected(self, init_test_db):
        # The non-system caller is now blocked by the ownership gate before
        # the "is default" guard fires (visibility allows the read, but
        # SYSTEM ownership rejects the mutation). Both surface the same
        # identity-404 wire shape.
        with pytest.raises(WorkspaceNotFoundError):
            await workspaces_service.delete_workspace(DEFAULT_WORKSPACE_ID, OWNER_A)
        # The system caller still hits the dedicated default-protection
        # error, preserving the legacy 400 response on the router.
        with pytest.raises(WorkspaceIsDefaultError):
            await workspaces_service.delete_workspace(DEFAULT_WORKSPACE_ID, SYSTEM_OWNER_ID)

    async def test_non_system_caller_cannot_delete_system_workspace(self, init_test_db):
        """Regression for P0-1: only the system caller can delete a
        SYSTEM-owned workspace. Prior to the fix, visibility alone gated
        the delete path so any tenant could attempt it (and the only
        thing stopping ``ws-default`` deletion was the dedicated
        ``WorkspaceIsDefaultError`` guard, which doesn't fire on
        non-default SYSTEM rows)."""
        # Seed a non-default SYSTEM-owned workspace via the DB to mimic a
        # legacy/pre-migration row.
        from aerospike_cluster_manager_api.models.workspace import Workspace

        now = datetime.now(UTC).isoformat()
        await db.create_workspace(
            Workspace(
                id="ws-system-extra",
                name="system-extra",
                color="#ABCDEF",
                ownerId=SYSTEM_OWNER_ID,
                createdAt=now,
                updatedAt=now,
            )
        )
        with pytest.raises(WorkspaceNotFoundError):
            await workspaces_service.delete_workspace("ws-system-extra", OWNER_A)
        # Still present.
        ws = await db.get_workspace("ws-system-extra")
        assert ws is not None

    async def test_with_connections_rejected(self, init_test_db):
        created = await workspaces_service.create_workspace(_create_payload(), OWNER_A)

        # Attach a connection directly so we don't pull in the connections
        # service test machinery (test isolation: failures here should point
        # at the workspace service, not the connection service).
        from aerospike_cluster_manager_api.models.connection import ConnectionProfile

        now = datetime.now(UTC).isoformat()
        await db.create_connection(
            ConnectionProfile(
                id="conn-attached",
                name="attached",
                hosts=["10.0.0.1"],
                port=3000,
                color="#0097D3",
                workspaceId=created.id,
                createdAt=now,
                updatedAt=now,
            )
        )

        with pytest.raises(WorkspaceHasConnectionsError):
            await workspaces_service.delete_workspace(created.id, OWNER_A)


# ---------------------------------------------------------------------------
# get_workspaces_owned_by — DB helper smoke test
# ---------------------------------------------------------------------------


class TestGetWorkspacesOwnedBy:
    """Lock the SQL filter shape so future refactors don't silently change
    the visibility semantics the workspaces service relies on."""

    async def test_includes_default_for_any_owner(self, init_test_db):
        rows = await db.get_workspaces_owned_by(OWNER_A)
        assert any(w.id == DEFAULT_WORKSPACE_ID and w.ownerId == SYSTEM_OWNER_ID for w in rows)

    async def test_excludes_other_owners(self, init_test_db):
        # Insert directly (bypassing the service) with an explicit owner.
        now = datetime.now(UTC).isoformat()
        ws = Workspace(
            id="ws-owned-b",
            name="b",
            color="#123456",
            ownerId=OWNER_B,
            createdAt=now,
            updatedAt=now,
        )
        await db.create_workspace(ws)

        rows = await db.get_workspaces_owned_by(OWNER_A)
        assert all(w.id != "ws-owned-b" for w in rows)
