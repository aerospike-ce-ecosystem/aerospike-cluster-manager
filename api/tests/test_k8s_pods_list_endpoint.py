"""Tests for the GET /k8s/clusters/{ns}/{name}/pods endpoint.

This endpoint surfaces the same data as the pods slice of
``GET /k8s/clusters/{ns}/{name}`` but as a dedicated, lighter-weight
response. Added so ackoctl reaches full parity with the MCP
``get_k8s_pods`` tool.
"""

from __future__ import annotations

import importlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.k8s_client import K8sApiError


@asynccontextmanager
async def _noop_lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


SAMPLE_CR: dict = {
    "apiVersion": "acko.io/v1alpha1",
    "kind": "AerospikeCluster",
    "metadata": {
        "name": "demo",
        "namespace": "aerospike",
    },
    "spec": {"size": 2, "image": "aerospike/aerospike-server:7.0.0.0"},
    "status": {"phase": "Running", "size": 2},
}

# Two pods with every camelCase field K8sPodStatus exposes set so a regression
# that drops a field is caught. The list_pods raw dict already uses the same
# camelCase keys -- ``k8s_service._extract_pod_fields`` is responsible for
# producing the alignment.
SAMPLE_PODS_RAW: list[dict] = [
    {
        "name": "demo-0",
        "podIP": "10.0.0.1",
        "hostIP": "192.168.0.10",
        "isReady": True,
        "phase": "Running",
        "image": "aerospike/aerospike-server:7.0.0.0",
        "dynamicConfigStatus": "Synced",
        "nodeId": "BB9000000000000",
        "rackId": 1,
        "configHash": "abc",
        "podSpecHash": "def",
        "accessEndpoints": ["10.0.0.1:3000"],
        "servicePort": 3000,
        "podPort": 3000,
    },
    {
        "name": "demo-1",
        "podIP": "10.0.0.2",
        "hostIP": "192.168.0.11",
        "isReady": False,
        "phase": "Pending",
        "image": "aerospike/aerospike-server:7.0.0.0",
        "rackId": 2,
        "accessEndpoints": ["10.0.0.2:3000"],
        "servicePort": 3000,
        "podPort": 3000,
    },
]


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


class TestListPodsHappyPath:
    async def test_returns_pod_list(self, client: AsyncClient):
        mock_get = AsyncMock(return_value=SAMPLE_CR)
        mock_list = AsyncMock(return_value=SAMPLE_PODS_RAW)

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_pods", mock_list),
        ):
            response = await client.get("/api/k8s/clusters/aerospike/demo/pods")

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert len(body) == 2
        assert body[0]["name"] == "demo-0"
        assert body[0]["isReady"] is True
        assert body[0]["podIP"] == "10.0.0.1"
        assert body[0]["rackId"] == 1
        assert body[0]["servicePort"] == 3000
        assert body[1]["name"] == "demo-1"
        assert body[1]["isReady"] is False

    async def test_v1_route_works(self, client: AsyncClient):
        mock_get = AsyncMock(return_value=SAMPLE_CR)
        mock_list = AsyncMock(return_value=SAMPLE_PODS_RAW)

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_pods", mock_list),
        ):
            response = await client.get("/api/v1/k8s/clusters/aerospike/demo/pods")

        assert response.status_code == 200

    async def test_label_selector_passed_through(self, client: AsyncClient):
        """The list_pods call must use the same label selector the detail
        endpoint uses so a pod from another workload that happens to share
        ``app.kubernetes.io/instance`` cannot leak through."""
        mock_get = AsyncMock(return_value=SAMPLE_CR)
        mock_list = AsyncMock(return_value=SAMPLE_PODS_RAW)

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_pods", mock_list),
        ):
            await client.get("/api/k8s/clusters/aerospike/demo/pods")

        mock_list.assert_awaited_once_with(
            "aerospike",
            "app.kubernetes.io/name=aerospike-cluster,app.kubernetes.io/instance=demo",
        )


class TestListPodsNotFound:
    async def test_returns_404_when_cluster_missing(self, client: AsyncClient):
        mock_get = AsyncMock(side_effect=K8sApiError(404, "Not Found", "missing"))

        with patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get):
            response = await client.get("/api/k8s/clusters/aerospike/missing/pods")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


class TestListPodsK8sDisabled:
    async def test_returns_404_when_k8s_management_disabled(self):
        """With K8S_MANAGEMENT_ENABLED=False the entire k8s router is gone."""
        with patch("aerospike_cluster_manager_api.config.K8S_MANAGEMENT_ENABLED", False):
            import aerospike_cluster_manager_api.main as main_mod

            importlib.reload(main_mod)
            test_app = main_mod.app

            original_lifespan = test_app.router.lifespan_context
            test_app.router.lifespan_context = _noop_lifespan
            test_app.state.limiter.enabled = False

            transport = ASGITransport(app=test_app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                response = await ac.get("/api/k8s/clusters/aerospike/demo/pods")

            test_app.state.limiter.enabled = True
            test_app.router.lifespan_context = original_lifespan

        assert response.status_code == 404
