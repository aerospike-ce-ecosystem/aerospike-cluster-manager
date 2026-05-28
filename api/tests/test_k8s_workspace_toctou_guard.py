"""Tests that the two TOCTOU-vulnerable K8s mutation paths now thread
``expected_workspace_id`` through to ``k8s_client``.

The two paths are:

* ``POST /k8s/clusters/{ns}/{name}/circuit-breaker/reset`` —
  ``reset_circuit_breaker`` patches the status subresource via
  ``k8s_client.patch_cluster_status``.
* ``PATCH /k8s/templates/{name}`` — ``update_k8s_template`` patches the
  template spec via ``k8s_client.patch_template``.

Without the guard, a concurrent re-labelling between the router's ACL
check and the apply lets a caller mutate a CR they no longer own. The
guard mirrors the pre-existing ``_patch_cluster_sync`` verify pattern.
"""

from __future__ import annotations

import importlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient


@asynccontextmanager
async def _noop_lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


SAMPLE_CR: dict = {
    "apiVersion": "acko.io/v1alpha1",
    "kind": "AerospikeCluster",
    "metadata": {
        "name": "demo",
        "namespace": "aerospike",
        "labels": {"acm.aerospike.com/workspace": "ws-abc"},
    },
    "spec": {"size": 2, "image": "aerospike/aerospike-server:7.0.0.0"},
    "status": {"phase": "Running", "size": 2},
}


SAMPLE_TEMPLATE: dict = {
    "apiVersion": "acko.io/v1alpha1",
    "kind": "AerospikeClusterTemplate",
    "metadata": {
        "name": "ce-template",
        "labels": {"acm.aerospike.com/workspace": "ws-xyz"},
    },
    "spec": {"image": "aerospike/aerospike-server:7.0.0.0"},
}


@pytest.fixture()
async def client():
    """httpx AsyncClient wired to the FastAPI app with K8S_MANAGEMENT_ENABLED=True."""
    with patch("aerospike_cluster_manager_api.config.K8S_MANAGEMENT_ENABLED", True):
        import aerospike_cluster_manager_api.main as main_mod
        import aerospike_cluster_manager_api.routers.k8s_clusters as k8s_mod

        importlib.reload(k8s_mod)
        importlib.reload(main_mod)
        test_app = main_mod.app

        original_lifespan = test_app.router.lifespan_context
        test_app.router.lifespan_context = _noop_lifespan
        test_app.state.limiter.enabled = False

        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

        test_app.state.limiter.enabled = True
        test_app.router.lifespan_context = original_lifespan


class TestResetCircuitBreakerForwardsExpectedWorkspaceId:
    async def test_status_patch_threads_workspace_id(self, client: AsyncClient):
        """``patch_cluster_status`` must receive ``expected_workspace_id``
        matching the CR loaded by the ACL gate so a concurrent re-label
        is rejected at apply time, not silently honoured.
        """
        mock_assert = AsyncMock(return_value=SAMPLE_CR)
        mock_patch_status = AsyncMock(return_value=SAMPLE_CR)
        mock_patch_cluster = AsyncMock(return_value=SAMPLE_CR)

        with (
            patch(
                "aerospike_cluster_manager_api.routers.k8s_clusters._assert_caller_owns_k8s_cluster",
                mock_assert,
            ),
            patch(
                "aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.patch_cluster_status",
                mock_patch_status,
            ),
            patch(
                "aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.patch_cluster",
                mock_patch_cluster,
            ),
        ):
            response = await client.post("/api/k8s/clusters/aerospike/demo/reset-circuit-breaker")

        assert response.status_code == 200
        mock_patch_status.assert_awaited_once()
        _, kwargs = mock_patch_status.call_args
        assert kwargs.get("expected_workspace_id") == "ws-abc"


class TestUpdateK8sTemplateForwardsExpectedWorkspaceId:
    async def test_template_patch_threads_workspace_id(self, client: AsyncClient):
        """``patch_template`` must receive ``expected_workspace_id``
        matching the template loaded by ``_assert_template_visible`` so a
        concurrent re-label is rejected at apply time.
        """
        mock_assert = AsyncMock(return_value=SAMPLE_TEMPLATE)
        mock_patch = AsyncMock(return_value=SAMPLE_TEMPLATE)

        with (
            patch(
                "aerospike_cluster_manager_api.routers.k8s_clusters._assert_template_visible",
                mock_assert,
            ),
            patch(
                "aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.patch_template",
                mock_patch,
            ),
        ):
            response = await client.patch(
                "/api/k8s/templates/ce-template",
                json={"image": "aerospike/aerospike-server:7.0.0.1"},
            )

        assert response.status_code == 200
        mock_patch.assert_awaited_once()
        _, kwargs = mock_patch.call_args
        assert kwargs.get("expected_workspace_id") == "ws-xyz"
