"""Tests for the GET /k8s/clusters/{ns}/{name}/pods/{pod}/logs endpoint.

Focus: the pod-membership guard built from ``k8s_client.list_pods`` must
tolerate a raw pod dict that is missing the ``name`` key. Kubernetes pod
objects normally always carry a name, but ``list_pods`` returns plain
dicts assembled from the API response, and the rest of this router reads
the ``name`` field defensively via ``.get(...)`` (see the PVC handlers).
A bare ``p["name"]`` here turned malformed/partial pod data into an
opaque 500 ("Failed to get pod logs") instead of a clean 404.
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
    "metadata": {"name": "demo", "namespace": "aerospike"},
    "spec": {"size": 2, "image": "aerospike/aerospike-server:7.0.0.0"},
    "status": {"phase": "Running", "size": 2},
}


@pytest.fixture()
async def client():
    """httpx AsyncClient wired to the app with K8S_MANAGEMENT_ENABLED=True."""
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


_LOGS_PATH = "/api/k8s/clusters/aerospike/demo/pods/demo-0/logs"


class TestGetPodLogs:
    async def test_returns_logs_for_known_pod(self, client: AsyncClient):
        with (
            patch(
                "aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster",
                AsyncMock(return_value=SAMPLE_CR),
            ),
            patch(
                "aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_pods",
                AsyncMock(return_value=[{"name": "demo-0"}, {"name": "demo-1"}]),
            ),
            patch(
                "aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.read_pod_log",
                AsyncMock(return_value="line1\nline2"),
            ),
        ):
            response = await client.get(_LOGS_PATH)

        assert response.status_code == 200
        body = response.json()
        assert body["pod"] == "demo-0"
        assert body["logs"] == "line1\nline2"

    async def test_unknown_pod_returns_404(self, client: AsyncClient):
        with (
            patch(
                "aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster",
                AsyncMock(return_value=SAMPLE_CR),
            ),
            patch(
                "aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_pods",
                AsyncMock(return_value=[{"name": "demo-1"}]),
            ),
        ):
            response = await client.get(_LOGS_PATH)

        assert response.status_code == 404
        assert "does not belong" in response.json()["detail"]

    async def test_pod_dict_without_name_does_not_500(self, client: AsyncClient):
        """A raw pod entry missing the ``name`` key must not crash the guard.

        Regression for the unguarded ``{p["name"] for p in cluster_pods}``
        membership-set comprehension. With a nameless entry mixed in, the
        requested pod is simply not found -> a clean 404, never a KeyError
        mapped to an opaque 500 by the ``@_k8s_endpoint`` wrapper.
        """
        with (
            patch(
                "aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster",
                AsyncMock(return_value=SAMPLE_CR),
            ),
            patch(
                "aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_pods",
                AsyncMock(return_value=[{"phase": "Pending"}, {"name": "demo-1"}]),
            ),
        ):
            response = await client.get(_LOGS_PATH)

        # demo-0 is not present; the nameless entry is tolerated -> 404, not 500.
        assert response.status_code == 404
        assert response.status_code != 500
        assert "does not belong" in response.json()["detail"]
