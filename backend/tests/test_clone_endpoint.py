"""Tests for the POST /k8s/clusters/{namespace}/{name}/clone endpoint."""

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


# ---------------------------------------------------------------------------
# Sample CRs used across tests
# ---------------------------------------------------------------------------

SAMPLE_SOURCE_CR: dict = {
    "apiVersion": "acko.io/v1alpha1",
    "kind": "AerospikeCluster",
    "metadata": {
        "name": "source-cluster",
        "namespace": "aerospike",
        "uid": "abc-123",
        "resourceVersion": "999",
        "creationTimestamp": "2025-01-01T00:00:00Z",
    },
    "spec": {
        "size": 3,
        "image": "aerospike/aerospike-server:7.0.0.0",
        "aerospikeConfig": {
            "namespaces": [{"name": "test", "replicationFactor": 2}],
        },
        "operations": [{"kind": "quickRestart", "id": "op-1"}],
        "paused": True,
        "storage": {"volumes": [{"name": "data", "size": "10Gi"}]},
    },
    "status": {
        "phase": "Running",
        "size": 3,
    },
}

SAMPLE_CREATED_CR: dict = {
    "apiVersion": "acko.io/v1alpha1",
    "kind": "AerospikeCluster",
    "metadata": {
        "name": "cloned-cluster",
        "namespace": "aerospike",
        "uid": "new-uid-456",
        "resourceVersion": "1000",
        "creationTimestamp": "2025-06-01T00:00:00Z",
    },
    "spec": {
        "size": 3,
        "image": "aerospike/aerospike-server:7.0.0.0",
        "aerospikeConfig": {
            "namespaces": [{"name": "test", "replicationFactor": 2}],
        },
        "storage": {"volumes": [{"name": "data", "size": "10Gi"}]},
    },
    "status": {
        "phase": "Pending",
        "size": 3,
    },
}

AVAILABLE_NAMESPACES = ["aerospike", "default", "production", "kube-system"]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
async def client():
    """httpx AsyncClient wired to the FastAPI app with K8S_MANAGEMENT_ENABLED=True."""
    with patch("aerospike_cluster_manager_api.config.K8S_MANAGEMENT_ENABLED", True):
        # Reload the router and main modules so the patched config takes effect
        # and the k8s router is registered.
        import aerospike_cluster_manager_api.routers.k8s_clusters as k8s_mod
        import aerospike_cluster_manager_api.main as main_mod

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


# ---------------------------------------------------------------------------
# Tests: Successful clone
# ---------------------------------------------------------------------------


class TestCloneSuccess:
    """Happy-path tests for the clone endpoint."""

    async def test_clone_returns_201(self, client: AsyncClient):
        """A valid clone request should return 201 with the new cluster summary."""
        mock_get = AsyncMock(return_value=SAMPLE_SOURCE_CR)
        mock_create = AsyncMock(return_value=SAMPLE_CREATED_CR)
        mock_ns = AsyncMock(return_value=AVAILABLE_NAMESPACES)

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.create_cluster", mock_create),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_namespaces", mock_ns),
        ):
            response = await client.post(
                "/api/k8s/clusters/aerospike/source-cluster/clone",
                json={"name": "cloned-cluster"},
            )

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "cloned-cluster"
        assert body["namespace"] == "aerospike"

    async def test_clone_strips_operations_and_paused(self, client: AsyncClient):
        """The cloned spec must not contain 'operations' or 'paused' keys."""
        mock_get = AsyncMock(return_value=SAMPLE_SOURCE_CR)
        created_cr = None

        async def capture_create(ns, body):
            nonlocal created_cr
            created_cr = body
            return SAMPLE_CREATED_CR

        mock_create = AsyncMock(side_effect=capture_create)
        mock_ns = AsyncMock(return_value=AVAILABLE_NAMESPACES)

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.create_cluster", mock_create),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_namespaces", mock_ns),
        ):
            await client.post(
                "/api/k8s/clusters/aerospike/source-cluster/clone",
                json={"name": "cloned-cluster"},
            )

        assert created_cr is not None
        assert "operations" not in created_cr["spec"]
        assert "paused" not in created_cr["spec"]

    async def test_clone_preserves_other_spec_fields(self, client: AsyncClient):
        """Fields other than operations/paused should be preserved in the clone."""
        mock_get = AsyncMock(return_value=SAMPLE_SOURCE_CR)
        created_cr = None

        async def capture_create(ns, body):
            nonlocal created_cr
            created_cr = body
            return SAMPLE_CREATED_CR

        mock_create = AsyncMock(side_effect=capture_create)
        mock_ns = AsyncMock(return_value=AVAILABLE_NAMESPACES)

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.create_cluster", mock_create),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_namespaces", mock_ns),
        ):
            await client.post(
                "/api/k8s/clusters/aerospike/source-cluster/clone",
                json={"name": "cloned-cluster"},
            )

        spec = created_cr["spec"]
        assert spec["size"] == 3
        assert spec["image"] == "aerospike/aerospike-server:7.0.0.0"
        assert spec["aerospikeConfig"] == {
            "namespaces": [{"name": "test", "replicationFactor": 2}],
        }
        assert spec["storage"] == {"volumes": [{"name": "data", "size": "10Gi"}]}

    async def test_clone_does_not_mutate_source(self, client: AsyncClient):
        """Deep copy must be used so the original source CR dict is not modified."""
        import copy as copy_mod

        source_snapshot = copy_mod.deepcopy(SAMPLE_SOURCE_CR)
        mock_get = AsyncMock(return_value=SAMPLE_SOURCE_CR)
        mock_create = AsyncMock(return_value=SAMPLE_CREATED_CR)
        mock_ns = AsyncMock(return_value=AVAILABLE_NAMESPACES)

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.create_cluster", mock_create),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_namespaces", mock_ns),
        ):
            await client.post(
                "/api/k8s/clusters/aerospike/source-cluster/clone",
                json={"name": "cloned-cluster"},
            )

        # The source CR should still have operations and paused
        assert SAMPLE_SOURCE_CR["spec"]["operations"] == source_snapshot["spec"]["operations"]
        assert SAMPLE_SOURCE_CR["spec"]["paused"] == source_snapshot["spec"]["paused"]

    async def test_clone_sets_correct_metadata(self, client: AsyncClient):
        """The cloned CR metadata must have the new name and correct apiVersion/kind."""
        mock_get = AsyncMock(return_value=SAMPLE_SOURCE_CR)
        created_cr = None

        async def capture_create(ns, body):
            nonlocal created_cr
            created_cr = body
            return SAMPLE_CREATED_CR

        mock_create = AsyncMock(side_effect=capture_create)
        mock_ns = AsyncMock(return_value=AVAILABLE_NAMESPACES)

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.create_cluster", mock_create),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_namespaces", mock_ns),
        ):
            await client.post(
                "/api/k8s/clusters/aerospike/source-cluster/clone",
                json={"name": "my-clone"},
            )

        assert created_cr["apiVersion"] == "acko.io/v1alpha1"
        assert created_cr["kind"] == "AerospikeCluster"
        assert created_cr["metadata"]["name"] == "my-clone"
        assert created_cr["metadata"]["namespace"] == "aerospike"


# ---------------------------------------------------------------------------
# Tests: Clone to same namespace vs different namespace
# ---------------------------------------------------------------------------


class TestCloneNamespace:
    """Tests for cloning to the same or a different namespace."""

    async def test_clone_to_same_namespace(self, client: AsyncClient):
        """When namespace is omitted, the clone uses the source namespace."""
        mock_get = AsyncMock(return_value=SAMPLE_SOURCE_CR)
        created_cr = None

        async def capture_create(ns, body):
            nonlocal created_cr
            created_cr = body
            return SAMPLE_CREATED_CR

        mock_create = AsyncMock(side_effect=capture_create)
        mock_ns = AsyncMock(return_value=AVAILABLE_NAMESPACES)

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.create_cluster", mock_create),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_namespaces", mock_ns),
        ):
            await client.post(
                "/api/k8s/clusters/aerospike/source-cluster/clone",
                json={"name": "cloned-cluster"},
            )

        assert created_cr["metadata"]["namespace"] == "aerospike"
        mock_create.assert_awaited_once()
        call_args = mock_create.call_args
        assert call_args[0][0] == "aerospike"

    async def test_clone_to_different_namespace(self, client: AsyncClient):
        """When namespace is provided, the clone is created in that namespace."""
        mock_get = AsyncMock(return_value=SAMPLE_SOURCE_CR)

        different_ns_cr = {
            **SAMPLE_CREATED_CR,
            "metadata": {**SAMPLE_CREATED_CR["metadata"], "namespace": "production"},
        }
        created_cr = None

        async def capture_create(ns, body):
            nonlocal created_cr
            created_cr = body
            return different_ns_cr

        mock_create = AsyncMock(side_effect=capture_create)
        mock_ns = AsyncMock(return_value=AVAILABLE_NAMESPACES)

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.create_cluster", mock_create),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_namespaces", mock_ns),
        ):
            response = await client.post(
                "/api/k8s/clusters/aerospike/source-cluster/clone",
                json={"name": "cloned-cluster", "namespace": "production"},
            )

        assert response.status_code == 201
        assert created_cr["metadata"]["namespace"] == "production"
        call_args = mock_create.call_args
        assert call_args[0][0] == "production"

    async def test_clone_to_nonexistent_namespace_returns_400(self, client: AsyncClient):
        """Cloning to a namespace that does not exist should return 400."""
        mock_get = AsyncMock(return_value=SAMPLE_SOURCE_CR)
        mock_ns = AsyncMock(return_value=["aerospike", "default"])

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_namespaces", mock_ns),
        ):
            response = await client.post(
                "/api/k8s/clusters/aerospike/source-cluster/clone",
                json={"name": "cloned-cluster", "namespace": "nonexistent"},
            )

        assert response.status_code == 400
        assert "nonexistent" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Tests: DNS label validation on name field
# ---------------------------------------------------------------------------


class TestCloneDnsValidation:
    """Tests for DNS label validation on the 'name' field via Pydantic constraints."""

    @pytest.mark.parametrize(
        "valid_name",
        [
            "my-cluster",
            "a",
            "cluster-1",
            "a1b2c3",
            "test",
            "a" * 63,
            "x-y-z",
            "abc-def-123",
            "a0",
            "0a",
        ],
    )
    async def test_valid_dns_names(self, client: AsyncClient, valid_name: str):
        """Valid DNS label names should be accepted (201)."""
        created = {
            **SAMPLE_CREATED_CR,
            "metadata": {**SAMPLE_CREATED_CR["metadata"], "name": valid_name},
        }
        mock_get = AsyncMock(return_value=SAMPLE_SOURCE_CR)
        mock_create = AsyncMock(return_value=created)
        mock_ns = AsyncMock(return_value=AVAILABLE_NAMESPACES)

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.create_cluster", mock_create),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_namespaces", mock_ns),
        ):
            response = await client.post(
                "/api/k8s/clusters/aerospike/source-cluster/clone",
                json={"name": valid_name},
            )

        assert response.status_code == 201, (
            f"Expected 201 for name '{valid_name}', got {response.status_code}: {response.json()}"
        )

    @pytest.mark.parametrize(
        "invalid_name,reason",
        [
            ("My-Cluster", "uppercase letters"),
            ("ALLCAPS", "all uppercase"),
            ("-starts-with-hyphen", "starts with hyphen"),
            ("ends-with-hyphen-", "ends with hyphen"),
            ("has spaces", "contains spaces"),
            ("has_underscore", "contains underscore"),
            ("has.dot", "contains dot"),
            ("a" * 64, "exceeds 63 characters"),
            ("Capital", "starts with uppercase"),
            ("hello!", "contains special character"),
            ("name@cluster", "contains @"),
        ],
    )
    async def test_invalid_dns_names(self, client: AsyncClient, invalid_name: str, reason: str):
        """Invalid DNS label names should be rejected with 422."""
        response = await client.post(
            "/api/k8s/clusters/aerospike/source-cluster/clone",
            json={"name": invalid_name},
        )

        assert response.status_code == 422, (
            f"Expected 422 for name '{invalid_name}' ({reason}), got {response.status_code}"
        )


# ---------------------------------------------------------------------------
# Tests: Source cluster not found (404)
# ---------------------------------------------------------------------------


class TestCloneSourceNotFound:
    """Tests for when the source cluster does not exist."""

    async def test_source_not_found_returns_404(self, client: AsyncClient):
        """Cloning a non-existent source cluster should return 404."""
        mock_get = AsyncMock(
            side_effect=K8sApiError(status=404, reason="NotFound", message="cluster not found"),
        )

        with patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get):
            response = await client.post(
                "/api/k8s/clusters/aerospike/nonexistent/clone",
                json={"name": "cloned-cluster"},
            )

        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Tests: Name conflict (409)
# ---------------------------------------------------------------------------


class TestCloneNameConflict:
    """Tests for when a cluster with the target name already exists."""

    async def test_name_conflict_returns_409(self, client: AsyncClient):
        """Cloning to a name that already exists should return 409 (from K8s API)."""
        mock_get = AsyncMock(return_value=SAMPLE_SOURCE_CR)
        mock_create = AsyncMock(
            side_effect=K8sApiError(
                status=409,
                reason="AlreadyExists",
                message="cluster already exists",
            ),
        )
        mock_ns = AsyncMock(return_value=AVAILABLE_NAMESPACES)

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.create_cluster", mock_create),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_namespaces", mock_ns),
        ):
            response = await client.post(
                "/api/k8s/clusters/aerospike/source-cluster/clone",
                json={"name": "existing-cluster"},
            )

        assert response.status_code == 409


# ---------------------------------------------------------------------------
# Tests: Edge cases
# ---------------------------------------------------------------------------


class TestCloneEdgeCases:
    """Edge-case tests for the clone endpoint."""

    async def test_clone_source_without_operations_or_paused(self, client: AsyncClient):
        """Cloning a source that has no operations or paused field should succeed."""
        source_without_ops = {
            **SAMPLE_SOURCE_CR,
            "spec": {
                "size": 2,
                "image": "aerospike/aerospike-server:7.0.0.0",
            },
        }
        created_cr = None

        async def capture_create(ns, body):
            nonlocal created_cr
            created_cr = body
            return SAMPLE_CREATED_CR

        mock_get = AsyncMock(return_value=source_without_ops)
        mock_create = AsyncMock(side_effect=capture_create)
        mock_ns = AsyncMock(return_value=AVAILABLE_NAMESPACES)

        with (
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.create_cluster", mock_create),
            patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.list_namespaces", mock_ns),
        ):
            response = await client.post(
                "/api/k8s/clusters/aerospike/source-cluster/clone",
                json={"name": "cloned-cluster"},
            )

        assert response.status_code == 201
        assert "operations" not in created_cr["spec"]
        assert "paused" not in created_cr["spec"]
        assert created_cr["spec"]["size"] == 2

    async def test_clone_k8s_server_error_returns_500(self, client: AsyncClient):
        """An unexpected K8s API error during get_cluster should return 500."""
        mock_get = AsyncMock(
            side_effect=K8sApiError(
                status=500,
                reason="InternalError",
                message="something went wrong",
            ),
        )

        with patch("aerospike_cluster_manager_api.routers.k8s_clusters.k8s_client.get_cluster", mock_get):
            response = await client.post(
                "/api/k8s/clusters/aerospike/source-cluster/clone",
                json={"name": "cloned-cluster"},
            )

        assert response.status_code == 500

    async def test_clone_missing_name_returns_422(self, client: AsyncClient):
        """Omitting the 'name' field should fail with 422 (Pydantic validation)."""
        response = await client.post(
            "/api/k8s/clusters/aerospike/source-cluster/clone",
            json={},
        )

        assert response.status_code == 422

    async def test_clone_empty_body_returns_422(self, client: AsyncClient):
        """Sending no JSON body at all should fail with 422."""
        response = await client.post(
            "/api/k8s/clusters/aerospike/source-cluster/clone",
        )

        assert response.status_code == 422
