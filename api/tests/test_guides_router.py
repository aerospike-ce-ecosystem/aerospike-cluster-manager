"""Integration tests for the guides router (REST surface).

Pins the contract that:
  * A workspace holds at most one data-plane and one control-plane guide;
    PUT registers on first write and edits in place afterwards.
  * ``createdAt`` is preserved across edits; ``updatedAt`` moves forward.
  * Empty ``title`` / ``content`` is rejected at the validation layer (422).
  * An unknown ``guide_type`` path segment is rejected with 422.
  * Workspace ACL: callers without access to the workspace see a 404
    (id-enumeration safe), and GET of an unregistered guide is a 404.
  * DELETE is idempotent (204 whether or not the guide existed).
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


async def _seed_workspace(ws_id: str, owner_id: str) -> str:
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
    return ws_id


_DATA_PLANE_BODY = {
    "title": "Data-plane policy",
    "content": "# Data-plane\n\nThrowaway test data: TTL <= 7 days.",
}
_CONTROL_PLANE_BODY = {
    "title": "Control-plane policy",
    "content": "# Control-plane\n\nTest clusters: in-memory only.",
}


class TestGuideUpsertAndGet:
    async def test_put_registers_then_get_returns_it(self, client: AsyncClient) -> None:
        _override_caller(SYSTEM_OWNER_ID)
        resp = await client.put(
            f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/data-plane",
            json=_DATA_PLANE_BODY,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["workspaceId"] == DEFAULT_WORKSPACE_ID
        assert body["guideType"] == "data-plane"
        assert body["title"] == "Data-plane policy"
        assert body["content"] == _DATA_PLANE_BODY["content"]
        assert body["updatedBy"] == SYSTEM_OWNER_ID

        got = await client.get(f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/data-plane")
        assert got.status_code == 200
        assert got.json() == body

    async def test_put_twice_edits_in_place_and_preserves_created_at(self, client: AsyncClient) -> None:
        _override_caller(SYSTEM_OWNER_ID)
        first = await client.put(
            f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/control-plane",
            json=_CONTROL_PLANE_BODY,
        )
        assert first.status_code == 200
        created_at = first.json()["createdAt"]

        second = await client.put(
            f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/control-plane",
            json={"title": "Control-plane v2", "content": "# v2\n\nupdated"},
        )
        assert second.status_code == 200
        edited = second.json()
        assert edited["createdAt"] == created_at  # preserved across edits
        assert edited["updatedAt"] >= created_at
        assert edited["title"] == "Control-plane v2"
        assert edited["content"] == "# v2\n\nupdated"

    async def test_get_unregistered_guide_returns_404(self, client: AsyncClient) -> None:
        _override_caller(SYSTEM_OWNER_ID)
        resp = await client.get(f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/data-plane")
        assert resp.status_code == 404


class TestGuideList:
    async def test_list_empty_then_populated(self, client: AsyncClient) -> None:
        _override_caller(SYSTEM_OWNER_ID)
        empty = await client.get(f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}")
        assert empty.status_code == 200
        assert empty.json() == {"guides": []}

        await client.put(f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/data-plane", json=_DATA_PLANE_BODY)
        await client.put(f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/control-plane", json=_CONTROL_PLANE_BODY)

        listed = await client.get(f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}")
        assert listed.status_code == 200
        kinds = sorted(g["guideType"] for g in listed.json()["guides"])
        assert kinds == ["control-plane", "data-plane"]


class TestGuideValidation:
    async def test_empty_content_rejected_with_422(self, client: AsyncClient) -> None:
        _override_caller(SYSTEM_OWNER_ID)
        resp = await client.put(
            f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/data-plane",
            json={"title": "t", "content": ""},
        )
        assert resp.status_code == 422

    async def test_empty_title_rejected_with_422(self, client: AsyncClient) -> None:
        _override_caller(SYSTEM_OWNER_ID)
        resp = await client.put(
            f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/data-plane",
            json={"title": "", "content": "x"},
        )
        assert resp.status_code == 422

    async def test_unknown_guide_type_rejected_with_422(self, client: AsyncClient) -> None:
        _override_caller(SYSTEM_OWNER_ID)
        resp = await client.put(
            f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/bogus-plane",
            json=_DATA_PLANE_BODY,
        )
        assert resp.status_code == 422


class TestGuideDelete:
    async def test_delete_is_idempotent(self, client: AsyncClient) -> None:
        _override_caller(SYSTEM_OWNER_ID)
        # Delete before register — still 204.
        missing = await client.delete(f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/data-plane")
        assert missing.status_code == 204

        await client.put(f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/data-plane", json=_DATA_PLANE_BODY)
        deleted = await client.delete(f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/data-plane")
        assert deleted.status_code == 204

        gone = await client.get(f"/api/v1/guides/{DEFAULT_WORKSPACE_ID}/data-plane")
        assert gone.status_code == 404


class TestGuideWorkspaceAcl:
    async def test_caller_without_workspace_access_gets_404(self, client: AsyncClient) -> None:
        await _seed_workspace("ws-team-a", owner_id="owner-a")

        # owner-b cannot see ws-team-a — every guide verb 404s.
        _override_caller("owner-b")
        assert (await client.get("/api/v1/guides/ws-team-a")).status_code == 404
        assert (await client.get("/api/v1/guides/ws-team-a/data-plane")).status_code == 404
        put_resp = await client.put("/api/v1/guides/ws-team-a/data-plane", json=_DATA_PLANE_BODY)
        assert put_resp.status_code == 404
        assert (await client.delete("/api/v1/guides/ws-team-a/data-plane")).status_code == 404

    async def test_owner_can_manage_their_workspace_guide(self, client: AsyncClient) -> None:
        await _seed_workspace("ws-team-a", owner_id="owner-a")
        _override_caller("owner-a")
        put_resp = await client.put("/api/v1/guides/ws-team-a/data-plane", json=_DATA_PLANE_BODY)
        assert put_resp.status_code == 200
        assert put_resp.json()["updatedBy"] == "owner-a"
