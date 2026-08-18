"""The K8s cluster ACL fails CLOSED on unlabelled CRs (#471).

``_assert_caller_owns_k8s_cluster`` used to return an unlabelled
``AerospikeCluster`` CR to any caller. Unlabelled is the *normal* case —
anything applied with ``kubectl``, by an operator's own manifests, or by
another team carries no ACM workspace label — and that gate guards the get,
scale, and delete paths. An authenticated tenant could therefore read, scale,
and delete another tenant's production cluster.

``_assert_template_visible``, in the same file, has always had the
system-only rule; its docstring calls the permissive version "the pre-fix
gap". These tests pin the same rule for clusters, on every path the gate
guards, plus the list filter (which leaked cluster metadata by the same
mechanism) and the create path (which is what stops NEW unlabelled ACM CRs
appearing).
"""

from __future__ import annotations

import importlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.models.workspace import SYSTEM_OWNER_ID

_TENANT = "user-tenant-a"


@asynccontextmanager
async def _noop_lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


def _cr(name: str = "demo", namespace: str = "aerospike", workspace: str | None = None) -> dict[str, Any]:
    """Build an AerospikeCluster CR, with or without the ACM workspace label."""
    metadata: dict[str, Any] = {"name": name, "namespace": namespace}
    if workspace is not None:
        metadata["labels"] = {"acm.aerospike.com/workspace": workspace}
    return {
        "apiVersion": "acko.io/v1alpha1",
        "kind": "AerospikeCluster",
        "metadata": metadata,
        "spec": {"size": 2, "image": "aerospike/aerospike-server:7.0.0.0"},
        "status": {"phase": "Running", "size": 2},
    }


UNLABELLED_CR = _cr()
"""What `kubectl apply -f cluster.yaml` produces — no ACM label."""


@pytest.fixture()
def k8s_app():
    """Reload the router with K8S_MANAGEMENT_ENABLED=True and yield the app."""
    with patch("aerospike_cluster_manager_api.config.K8S_MANAGEMENT_ENABLED", True):
        import aerospike_cluster_manager_api.main as main_mod
        import aerospike_cluster_manager_api.routers.k8s_clusters as k8s_mod

        importlib.reload(k8s_mod)
        importlib.reload(main_mod)
        yield main_mod.app, k8s_mod


@pytest.fixture()
async def make_client(k8s_app):
    """Return a factory building a client that authenticates as ``owner_id``."""
    test_app, _ = k8s_app

    @asynccontextmanager
    async def _build(owner_id: str) -> AsyncIterator[AsyncClient]:
        from aerospike_cluster_manager_api.dependencies import _resolve_caller_owner_id

        original_lifespan = test_app.router.lifespan_context
        test_app.router.lifespan_context = _noop_lifespan
        test_app.state.limiter.enabled = False
        test_app.dependency_overrides[_resolve_caller_owner_id] = lambda: owner_id
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            try:
                yield ac
            finally:
                test_app.dependency_overrides.pop(_resolve_caller_owner_id, None)
                test_app.state.limiter.enabled = True
                test_app.router.lifespan_context = original_lifespan

    return _build


class TestUnlabelledClusterIsInvisibleToTenants:
    """The three routes ``_assert_caller_owns_k8s_cluster`` guards."""

    @pytest.mark.parametrize(
        ("method", "path", "json_body"),
        [
            ("get", "/api/k8s/clusters/aerospike/demo", None),
            ("post", "/api/k8s/clusters/aerospike/demo/scale", {"size": 5}),
            ("delete", "/api/k8s/clusters/aerospike/demo", None),
        ],
    )
    async def test_tenant_gets_404(self, k8s_app, make_client, method: str, path: str, json_body):
        _, k8s_mod = k8s_app

        mock_get = AsyncMock(return_value=UNLABELLED_CR)
        mock_patch = AsyncMock(return_value=UNLABELLED_CR)
        mock_delete = AsyncMock(return_value={})

        with (
            patch.object(k8s_mod.k8s_client, "get_cluster", mock_get),
            patch.object(k8s_mod.k8s_client, "patch_cluster", mock_patch),
            patch.object(k8s_mod.k8s_client, "delete_cluster", mock_delete),
        ):
            async with make_client(_TENANT) as client:
                resp = await client.request(method.upper(), path, json=json_body)

        assert resp.status_code == 404, resp.text
        # Identity-404: the same wire shape as a genuinely missing cluster, so
        # a probing tenant cannot tell "not yours" from "does not exist".
        assert resp.json()["detail"] == "Cluster 'aerospike/demo' not found"
        # And the destructive calls never happened.
        mock_patch.assert_not_awaited()
        mock_delete.assert_not_awaited()

    async def test_system_caller_still_succeeds(self, k8s_app, make_client):
        """Cluster admins keep their access — the gate is per-tenant, not a wall."""
        _, k8s_mod = k8s_app

        with (
            patch.object(k8s_mod.k8s_client, "get_cluster", AsyncMock(return_value=UNLABELLED_CR)),
            patch.object(k8s_mod.k8s_client, "list_pods", AsyncMock(return_value=[])),
        ):
            async with make_client(SYSTEM_OWNER_ID) as client:
                resp = await client.get("/api/k8s/clusters/aerospike/demo")

        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == "demo"

    async def test_system_caller_can_still_delete(self, k8s_app, make_client):
        _, k8s_mod = k8s_app

        mock_delete = AsyncMock(return_value={})
        with (
            patch.object(k8s_mod.k8s_client, "get_cluster", AsyncMock(return_value=UNLABELLED_CR)),
            patch.object(k8s_mod.k8s_client, "delete_cluster", mock_delete),
        ):
            async with make_client(SYSTEM_OWNER_ID) as client:
                resp = await client.delete("/api/k8s/clusters/aerospike/demo")

        assert resp.status_code == 202, resp.text
        mock_delete.assert_awaited_once()

    async def test_labelled_cr_owned_by_the_caller_still_succeeds(self, k8s_app, make_client):
        """The fix must not break the path it is protecting."""
        _, k8s_mod = k8s_app

        labelled = _cr(workspace="ws-tenant-a")
        with (
            patch.object(k8s_mod.k8s_client, "get_cluster", AsyncMock(return_value=labelled)),
            patch.object(k8s_mod.k8s_client, "list_pods", AsyncMock(return_value=[])),
            patch.object(k8s_mod, "_is_workspace_visible", AsyncMock(return_value=True)),
        ):
            async with make_client(_TENANT) as client:
                resp = await client.get("/api/k8s/clusters/aerospike/demo")

        assert resp.status_code == 200, resp.text

    async def test_labelled_cr_owned_by_someone_else_still_404s(self, k8s_app, make_client):
        """Pre-existing behaviour for labelled CRs is unchanged."""
        _, k8s_mod = k8s_app

        labelled = _cr(workspace="ws-tenant-b")
        with (
            patch.object(k8s_mod.k8s_client, "get_cluster", AsyncMock(return_value=labelled)),
            patch.object(k8s_mod, "_is_workspace_visible", AsyncMock(return_value=False)),
        ):
            async with make_client(_TENANT) as client:
                resp = await client.get("/api/k8s/clusters/aerospike/demo")

        assert resp.status_code == 404, resp.text


class TestListFilterMatchesThePerCrGate:
    """The list path leaked the same CRs, by the same mechanism.

    Leaving it permissive while the per-CR gate fails closed would both leak
    name/namespace/size/status of other teams' clusters AND produce a list
    whose entries 404 on click.
    """

    async def test_unlabelled_cr_hidden_from_a_tenant(self, k8s_app, make_client):
        _, k8s_mod = k8s_app

        items = [_cr(name="kubectl-applied"), _cr(name="acm-made", workspace="ws-tenant-a")]
        with (
            patch.object(k8s_mod.k8s_client, "list_clusters", AsyncMock(return_value=(items, None))),
            patch.object(k8s_mod, "_is_workspace_visible", AsyncMock(return_value=True)),
            patch.object(k8s_mod.db, "get_all_connections", AsyncMock(return_value=[])),
            patch.object(k8s_mod.db, "get_all_workspaces", AsyncMock(return_value=[])),
        ):
            async with make_client(_TENANT) as client:
                resp = await client.get("/api/k8s/clusters?namespace=aerospike")

        assert resp.status_code == 200, resp.text
        names = [c["name"] for c in resp.json()["items"]]
        assert names == ["acm-made"]

    async def test_unlabelled_cr_visible_to_the_system_caller(self, k8s_app, make_client):
        _, k8s_mod = k8s_app

        items = [_cr(name="kubectl-applied")]
        with (
            patch.object(k8s_mod.k8s_client, "list_clusters", AsyncMock(return_value=(items, None))),
            patch.object(k8s_mod.db, "get_all_connections", AsyncMock(return_value=[])),
            patch.object(k8s_mod.db, "get_all_workspaces", AsyncMock(return_value=[])),
        ):
            async with make_client(SYSTEM_OWNER_ID) as client:
                resp = await client.get("/api/k8s/clusters?namespace=aerospike")

        assert resp.status_code == 200, resp.text
        assert [c["name"] for c in resp.json()["items"]] == ["kubectl-applied"]


class TestCreateAlwaysStampsTheWorkspaceLabel:
    """ACM must stop producing unlabelled cluster CRs.

    This is what makes the gate above safe to tighten: after this change an
    unlabelled CR unambiguously means "ACM did not create this".
    """

    async def test_stamps_the_named_workspace(self, k8s_app, make_client):
        _, k8s_mod = k8s_app

        mock_create = AsyncMock(side_effect=lambda _ns, cr: cr)
        with (
            patch.object(k8s_mod.k8s_client, "list_namespaces", AsyncMock(return_value=["aerospike"])),
            patch.object(k8s_mod.k8s_client, "create_cluster", mock_create),
            patch.object(k8s_mod, "_is_workspace_visible", AsyncMock(return_value=True)),
        ):
            async with make_client(_TENANT) as client:
                resp = await client.post(
                    "/api/k8s/clusters",
                    json={"name": "demo", "namespace": "aerospike", "size": 2, "workspaceId": "ws-tenant-a"},
                )

        assert resp.status_code == 201, resp.text
        _, sent_cr = mock_create.call_args.args
        assert sent_cr["metadata"]["labels"]["acm.aerospike.com/workspace"] == "ws-tenant-a"

    async def test_stamps_the_default_when_no_workspace_named(self, k8s_app, make_client):
        """Previously this left the CR unlabelled — the source of the ambiguity.

        ``ws-default`` is system-owned and therefore shared, so a cluster
        created without naming a workspace stays exactly as visible as before.
        """
        from aerospike_cluster_manager_api.models.workspace import DEFAULT_WORKSPACE_ID

        _, k8s_mod = k8s_app

        mock_create = AsyncMock(side_effect=lambda _ns, cr: cr)
        with (
            patch.object(k8s_mod.k8s_client, "list_namespaces", AsyncMock(return_value=["aerospike"])),
            patch.object(k8s_mod.k8s_client, "create_cluster", mock_create),
        ):
            async with make_client(_TENANT) as client:
                resp = await client.post(
                    "/api/k8s/clusters",
                    json={"name": "demo", "namespace": "aerospike", "size": 2},
                )

        assert resp.status_code == 201, resp.text
        _, sent_cr = mock_create.call_args.args
        assert sent_cr["metadata"]["labels"]["acm.aerospike.com/workspace"] == DEFAULT_WORKSPACE_ID
