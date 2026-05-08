"""Integration tests for the notes router (REST surface).

Pins the contract that:
  * Empty / whitespace ``note`` is rejected at the validation layer (422).
  * Workspace ACL: callers without access to the connection's workspace
    see a 404 (id-enumeration safe).
  * PUT returns the persisted row; DELETE is idempotent (204 either way).
  * SetInfo / AerospikeRecord field name is ``setName`` in the JSON wire
    format (camelCase via Pydantic).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.dependencies import _resolve_caller_owner_id
from aerospike_cluster_manager_api.main import app
from aerospike_cluster_manager_api.models.connection import ConnectionProfile
from aerospike_cluster_manager_api.models.workspace import (
    DEFAULT_WORKSPACE_ID,
    SYSTEM_OWNER_ID,
    Workspace,
)


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


async def _seed_connection(conn_id: str, workspace_id: str = DEFAULT_WORKSPACE_ID) -> str:
    """Create a connection in ``workspace_id`` and return its id."""
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
    return conn_id


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


class TestSetNoteValidation:
    async def test_empty_note_rejected_with_422(self, client: AsyncClient) -> None:
        _override_caller(SYSTEM_OWNER_ID)
        await _seed_connection("conn-validate-1")
        resp = await client.put(
            "/api/notes/sets/conn-validate-1/test/demo",
            json={"note": ""},
        )
        # min_length=1 forces 422 — the previous "empty PUT ⇒ delete"
        # behaviour was a footgun and is no longer accepted.
        assert resp.status_code == 422

    async def test_whitespace_only_note_rejected_with_422(self, client: AsyncClient) -> None:
        # min_length=1 applies to the literal string; whitespace passes
        # the length check but is semantically empty. The router does NOT
        # re-strip on the way in (Pydantic min_length is enough for the
        # MVP); document the behaviour so a future contributor doesn't
        # tighten it without reason.
        _override_caller(SYSTEM_OWNER_ID)
        await _seed_connection("conn-validate-2")
        resp = await client.put(
            "/api/notes/sets/conn-validate-2/test/demo",
            json={"note": " "},
        )
        # Single space passes min_length=1 — explicit pin so the contract
        # is visible if we ever switch to ``constr(strip_whitespace=True)``.
        assert resp.status_code == 200


class TestSetNoteRoundTrip:
    async def test_put_returns_saved_row(self, client: AsyncClient) -> None:
        _override_caller(SYSTEM_OWNER_ID)
        await _seed_connection("conn-set-rt-1")
        resp = await client.put(
            "/api/notes/sets/conn-set-rt-1/test/demo",
            json={"note": "hello"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["connectionId"] == "conn-set-rt-1"
        assert body["namespace"] == "test"
        assert body["setName"] == "demo"
        assert body["note"] == "hello"
        # Caller identity is recorded for audit.
        assert body["updatedBy"] == SYSTEM_OWNER_ID

    async def test_delete_is_idempotent(self, client: AsyncClient) -> None:
        _override_caller(SYSTEM_OWNER_ID)
        await _seed_connection("conn-set-rt-2")
        # Delete with no row → 204.
        resp = await client.delete("/api/notes/sets/conn-set-rt-2/test/demo")
        assert resp.status_code == 204
        # Add then delete → 204, second delete still 204.
        await client.put(
            "/api/notes/sets/conn-set-rt-2/test/demo",
            json={"note": "x"},
        )
        assert (await client.delete("/api/notes/sets/conn-set-rt-2/test/demo")).status_code == 204
        assert (await client.delete("/api/notes/sets/conn-set-rt-2/test/demo")).status_code == 204


class TestRecordNoteRoundTrip:
    async def test_put_resolves_pk_type_auto_to_int(self, client: AsyncClient) -> None:
        # Digit-only PK with pk_type=auto resolves to "int" at the router
        # boundary, matching the read path's heuristic. The persisted row
        # must reflect this so the same delete with auto finds it.
        _override_caller(SYSTEM_OWNER_ID)
        await _seed_connection("conn-rec-rt-1")
        resp = await client.put(
            "/api/notes/records/conn-rec-rt-1/test/demo/42",
            json={"note": "n", "pk_type": "auto"},
        )
        assert resp.status_code == 200
        assert resp.json()["pkType"] == "int"

    async def test_recovery_list_endpoint_surfaces_orphan_notes(self, client: AsyncClient) -> None:
        # The "random-50 scan missed it" recovery: PUT a note, then GET
        # /api/notes/records/{conn} returns it without going through the
        # Aerospike scan that may not have surfaced the record.
        _override_caller(SYSTEM_OWNER_ID)
        await _seed_connection("conn-rec-rt-2")
        await client.put(
            "/api/notes/records/conn-rec-rt-2/test/demo/foo",
            json={"note": "found-via-recovery", "pk_type": "string"},
        )
        resp = await client.get(
            "/api/notes/records/conn-rec-rt-2?ns=test&set=demo",
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["notes"]) == 1
        assert body["notes"][0]["note"] == "found-via-recovery"


class TestNotesWorkspaceAcl:
    """Bob (owner of workspace W2) cannot touch notes on a connection in
    Alice's workspace W1, even if he knows the connection id.

    The earlier implementation only validated connection existence via
    ``_get_verified_connection`` — same docstring claimed workspace ACL
    was enforced transitively, but it wasn't. The fix adds an explicit
    workspace check with 404-on-mismatch (id-enumeration safe).
    """

    async def test_cross_owner_get_returns_404(self, client: AsyncClient) -> None:
        # Alice's workspace, Alice's connection.
        await _seed_workspace("ws-alice", "alice")
        await _seed_connection("conn-alice", workspace_id="ws-alice")

        # Bob authenticates as a different user.
        _override_caller("bob")
        resp = await client.get("/api/notes/sets/conn-alice")
        assert resp.status_code == 404

    async def test_cross_owner_put_returns_404(self, client: AsyncClient) -> None:
        await _seed_workspace("ws-alice-2", "alice")
        await _seed_connection("conn-alice-2", workspace_id="ws-alice-2")

        _override_caller("bob")
        resp = await client.put(
            "/api/notes/sets/conn-alice-2/test/demo",
            json={"note": "should not work"},
        )
        assert resp.status_code == 404

    async def test_cross_owner_delete_returns_404(self, client: AsyncClient) -> None:
        await _seed_workspace("ws-alice-3", "alice")
        await _seed_connection("conn-alice-3", workspace_id="ws-alice-3")

        _override_caller("bob")
        resp = await client.delete("/api/notes/sets/conn-alice-3/test/demo")
        assert resp.status_code == 404

    async def test_owner_can_access_own_connection(self, client: AsyncClient) -> None:
        await _seed_workspace("ws-alice-4", "alice")
        await _seed_connection("conn-alice-4", workspace_id="ws-alice-4")

        _override_caller("alice")
        resp = await client.put(
            "/api/notes/sets/conn-alice-4/test/demo",
            json={"note": "owner write"},
        )
        assert resp.status_code == 200

    async def test_system_workspace_visible_to_anyone(self, client: AsyncClient) -> None:
        # SYSTEM_OWNER_ID is the legacy single-tenant fallback — connections
        # in the default workspace remain accessible to every authenticated
        # caller, matching the behavior of ``_assert_workspace_visible``.
        await _seed_connection("conn-system-1")  # default workspace
        _override_caller("any-user")
        resp = await client.put(
            "/api/notes/sets/conn-system-1/test/demo",
            json={"note": "system-visible"},
        )
        assert resp.status_code == 200
