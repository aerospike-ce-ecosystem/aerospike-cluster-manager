"""Unit tests for the clusters service layer.

These tests exercise ``services.clusters_service`` directly — without going
through FastAPI — so the service contract stays stable independent of the
REST router. The router-layer regression net lives in ``test_cluster_batch.py``
and friends.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, Mock

import pytest

from aerospike_cluster_manager_api.models.cluster import (
    ClusterInfo,
    ClusterNode,
    CreateNamespaceRequest,
    NamespaceInfo,
    SetInfo,
)
from aerospike_cluster_manager_api.services import clusters_service
from aerospike_cluster_manager_api.services.clusters_service import (
    NamespaceConfigError,
    NamespaceNotFoundError,
    NodeNotFoundError,
)
from aerospike_cluster_manager_api.services.info_cache import info_cache


def _info_all_result(name: str, resp: str) -> tuple[str, int | None, str]:
    return (name, None, resp)


@pytest.fixture(autouse=True)
async def _clear_info_cache():
    """Ensure the info cache is clean for each test in this module."""
    await info_cache.clear()
    yield
    await info_cache.clear()


def _make_mock_client() -> AsyncMock:
    """Build a mock AsyncClient that returns realistic Aerospike info data."""
    mock = AsyncMock()
    mock.get_node_names = Mock(return_value=["node1", "node2"])
    mock.is_connected.return_value = True

    node_stats = "cluster_size=2;uptime=3600;client_connections=10;stat_read_reqs=1000;stat_write_reqs=500"

    ns_stats = (
        "objects=200;tombstones=0;memory_used_bytes=1024;"
        "memory-size=4096;device_used_bytes=0;device-total-bytes=0;"
        "replication-factor=2;stop_writes=false;hwm_breached=false;"
        "high-water-memory-pct=60;high-water-disk-pct=50;"
        "nsup-period=120;default-ttl=0;allow-ttl-without-nsup=false"
    )

    def info_all_side_effect(cmd: str):
        if cmd == "statistics":
            return [
                _info_all_result("node1", node_stats),
                _info_all_result("node2", node_stats),
            ]
        if cmd == "build":
            return [
                _info_all_result("node1", "6.4.0"),
                _info_all_result("node2", "6.4.0"),
            ]
        if cmd == "edition":
            return [
                _info_all_result("node1", "Community"),
                _info_all_result("node2", "Community"),
            ]
        if cmd == "service":
            return [
                _info_all_result("node1", "10.0.0.1:3000"),
                _info_all_result("node2", "10.0.0.2:3000"),
            ]
        if cmd.startswith("namespace/"):
            return [
                _info_all_result("node1", ns_stats),
                _info_all_result("node2", ns_stats),
            ]
        if cmd.startswith("sets/"):
            return [
                _info_all_result(
                    "node1", "set=myset:objects=100:tombstones=0:memory_data_bytes=500:stop-writes-count=0"
                ),
                _info_all_result(
                    "node2", "set=myset:objects=100:tombstones=0:memory_data_bytes=500:stop-writes-count=0"
                ),
            ]
        return []

    mock.info_all.side_effect = info_all_side_effect
    mock.info_random_node.return_value = "test"

    return mock


# ---------------------------------------------------------------------------
# list_namespaces
# ---------------------------------------------------------------------------


class TestListNamespaces:
    async def test_returns_parsed_list(self):
        client = _make_mock_client()
        client.info_random_node.return_value = "test;bar"
        result = await clusters_service.list_namespaces(client)
        assert result == ["test", "bar"]

    async def test_returns_empty_list_when_no_namespaces(self):
        client = _make_mock_client()
        client.info_random_node.return_value = ""
        result = await clusters_service.list_namespaces(client)
        assert result == []

    async def test_calls_info_namespaces_command(self):
        client = _make_mock_client()
        await clusters_service.list_namespaces(client)
        client.info_random_node.assert_awaited_with("namespaces")


# ---------------------------------------------------------------------------
# list_sets
# ---------------------------------------------------------------------------


class TestListSets:
    async def test_returns_set_info_list(self):
        client = _make_mock_client()
        result = await clusters_service.list_sets(client, "test")
        assert isinstance(result, list)
        assert all(isinstance(s, SetInfo) for s in result)
        assert len(result) == 1
        assert result[0].name == "myset"
        assert result[0].namespace == "test"

    async def test_uses_namespace_replication_factor_for_object_dedup(self):
        client = _make_mock_client()
        result = await clusters_service.list_sets(client, "test")
        # Each node reports 100 objects; rf=2 -> unique 100
        assert result[0].objects == 100

    async def test_aggregates_total_nodes_count(self):
        client = _make_mock_client()
        result = await clusters_service.list_sets(client, "test")
        assert result[0].totalNodes == 2

    async def test_unknown_namespace_raises(self):
        client = _make_mock_client()
        # Override info_random_node so namespaces list is empty for the lookup
        client.info_random_node.return_value = ""
        with pytest.raises(NamespaceNotFoundError):
            await clusters_service.list_sets(client, "missing")


# ---------------------------------------------------------------------------
# get_nodes
# ---------------------------------------------------------------------------


class TestGetNodes:
    async def test_returns_cluster_node_list(self):
        client = _make_mock_client()
        result = await clusters_service.get_nodes(client, "conn-test-1")
        assert isinstance(result, list)
        assert len(result) == 2
        assert all(isinstance(n, ClusterNode) for n in result)

    async def test_node_carries_build_and_edition(self):
        client = _make_mock_client()
        result = await clusters_service.get_nodes(client, "conn-test-1")
        assert result[0].build == "6.4.0"
        assert result[0].edition == "Community"

    async def test_node_address_split_from_service(self):
        client = _make_mock_client()
        result = await clusters_service.get_nodes(client, "conn-test-1")
        addresses = sorted(n.address for n in result)
        assert addresses == ["10.0.0.1", "10.0.0.2"]
        assert all(n.port == 3000 for n in result)

    async def test_caches_static_info_per_conn_id(self):
        client = _make_mock_client()
        await clusters_service.get_nodes(client, "conn-test-cache")
        # The build/edition fetcher was invoked once via info_all
        first_build_calls = sum(1 for c in client.info_all.call_args_list if c.args and c.args[0] == "build")
        await clusters_service.get_nodes(client, "conn-test-cache")
        second_build_calls = sum(1 for c in client.info_all.call_args_list if c.args and c.args[0] == "build")
        # Second call should not re-invoke build because info_cache served it
        assert second_build_calls == first_build_calls


# ---------------------------------------------------------------------------
# execute_info
# ---------------------------------------------------------------------------


class TestExecuteInfo:
    async def test_returns_per_node_results_for_info_all(self):
        client = _make_mock_client()
        result = await clusters_service.execute_info(client, "statistics")
        assert isinstance(result, list)
        assert len(result) == 2
        assert all(isinstance(r, tuple) and len(r) == 3 for r in result)
        # Each tuple is (node_name, err, response)
        names = sorted(r[0] for r in result)
        assert names == ["node1", "node2"]

    async def test_passes_command_through(self):
        client = _make_mock_client()
        await clusters_service.execute_info(client, "edition")
        client.info_all.assert_any_call("edition")


# ---------------------------------------------------------------------------
# execute_info_on_node
# ---------------------------------------------------------------------------


class TestExecuteInfoOnNode:
    async def test_returns_response_string_for_known_node(self):
        client = _make_mock_client()
        result = await clusters_service.execute_info_on_node(client, "statistics", "node1")
        assert isinstance(result, str)
        assert "cluster_size=2" in result

    async def test_unknown_node_raises(self):
        client = _make_mock_client()
        with pytest.raises(NodeNotFoundError):
            await clusters_service.execute_info_on_node(client, "statistics", "unknown-node")

    async def test_propagates_node_error(self):
        client = _make_mock_client()

        def err_side_effect(cmd: str):
            return [("node1", 1, "")]

        client.info_all.side_effect = err_side_effect
        # An err code on the targeted node should still raise NodeNotFoundError
        # because we treat an error response as "no usable response from this node".
        with pytest.raises(NodeNotFoundError):
            await clusters_service.execute_info_on_node(client, "statistics", "node1")


# ---------------------------------------------------------------------------
# execute_info_read_only
# ---------------------------------------------------------------------------


class TestExecuteInfoReadOnly:
    """Service-layer tests for the read-only asinfo entry point.

    The whitelist gate is the security-critical primitive — these tests
    pin both the happy paths and the "no wire round-trip on rejection"
    invariant.
    """

    @staticmethod
    def _client_with_distinct_node_responses() -> AsyncMock:
        """Build a mock where node1 and node2 return distinct payloads.

        Tests that filter by ``node_name`` MUST use this helper rather
        than ``_make_mock_client`` — the shared mock returns identical
        responses for both nodes, which would let a "always returns first
        result" bug pass the filter assertion silently.
        """
        client = _make_mock_client()

        def info_all_side_effect(cmd: str):
            if cmd == "statistics":
                return [
                    _info_all_result("node1", "node1_marker;cluster_size=2"),
                    _info_all_result("node2", "node2_marker;cluster_size=2"),
                ]
            if cmd == "namespaces":
                return [
                    _info_all_result("node1", "test;bar"),
                    _info_all_result("node2", "test;bar"),
                ]
            return []

        client.info_all.side_effect = info_all_side_effect
        return client

    async def test_random_node_path_returns_real_node_name(self):
        # ``node_name=None`` fans out via info_all and returns the FIRST
        # non-error response — the returned node name is a real cluster
        # node, so a follow-up call can target it.
        client = self._client_with_distinct_node_responses()
        node, response = await clusters_service.execute_info_read_only(client, "statistics")
        assert node == "node1"
        assert "node1_marker" in response
        assert "node2_marker" not in response
        client.info_all.assert_awaited_with("statistics")
        # info_random_node is no longer used for the read-only tool —
        # the change buys real node names back at the cost of one extra
        # round-trip per call.
        client.info_random_node.assert_not_called()

    async def test_random_node_path_skips_error_nodes(self):
        # First node errored — service must skip and return node2.
        client = _make_mock_client()
        client.info_all.side_effect = lambda cmd: [
            ("node1", 1, ""),
            ("node2", None, "ok"),
        ]
        node, response = await clusters_service.execute_info_read_only(client, "namespaces")
        assert node == "node2"
        assert response == "ok"

    async def test_specific_node_filters_info_all(self):
        # Distinct per-node markers prove the FILTER works (not just a
        # "returns results[0]" accident).
        client = self._client_with_distinct_node_responses()
        node, response = await clusters_service.execute_info_read_only(client, "statistics", node_name="node2")
        assert node == "node2"
        assert "node2_marker" in response
        assert "node1_marker" not in response

    async def test_unknown_node_raises(self):
        client = self._client_with_distinct_node_responses()
        with pytest.raises(NodeNotFoundError):
            await clusters_service.execute_info_read_only(client, "namespaces", node_name="ghost")

    async def test_no_responding_nodes_raises(self):
        # Every node returned an error — random-node path has nothing to
        # surface, must raise.
        client = _make_mock_client()
        client.info_all.side_effect = lambda cmd: [
            ("node1", 1, ""),
            ("node2", 1, ""),
        ]
        with pytest.raises(NodeNotFoundError):
            await clusters_service.execute_info_read_only(client, "namespaces")

    async def test_unwhitelisted_verb_raises_before_client_call(self):
        from aerospike_cluster_manager_api.info_verbs import InfoVerbNotAllowed

        client = _make_mock_client()
        with pytest.raises(InfoVerbNotAllowed) as exc:
            await clusters_service.execute_info_read_only(client, "set-config:context=service;migrate-threads=2")
        assert exc.value.verb == "set-config"
        # Wire message guides the caller to retry with a valid verb.
        assert "set-config" in str(exc.value)
        assert "read-only asinfo whitelist" in str(exc.value)
        # Critical: the wire was NOT touched. The whitelist gate fires
        # before any client call so a malicious verb can't even establish
        # an info round-trip.
        client.info_random_node.assert_not_called()
        client.info_all.assert_not_called()

    async def test_empty_command_raises(self):
        from aerospike_cluster_manager_api.info_verbs import InfoVerbNotAllowed

        client = _make_mock_client()
        with pytest.raises(InfoVerbNotAllowed):
            await clusters_service.execute_info_read_only(client, "")
        client.info_all.assert_not_called()


# ---------------------------------------------------------------------------
# get_cluster_info (full composition)
# ---------------------------------------------------------------------------


class TestGetClusterInfo:
    async def test_returns_cluster_info_model(self):
        client = _make_mock_client()
        result = await clusters_service.get_cluster_info(client, "conn-test-1")
        assert isinstance(result, ClusterInfo)
        assert result.connectionId == "conn-test-1"
        assert len(result.nodes) == 2
        assert len(result.namespaces) == 1
        assert isinstance(result.namespaces[0], NamespaceInfo)

    async def test_handles_empty_namespace_list(self):
        client = _make_mock_client()
        client.info_random_node.return_value = ""
        result = await clusters_service.get_cluster_info(client, "conn-test-1")
        assert result.namespaces == []
        assert len(result.nodes) == 2


# ---------------------------------------------------------------------------
# configure_namespace
# ---------------------------------------------------------------------------


class TestConfigureNamespace:
    async def test_success_returns_message(self):
        client = _make_mock_client()
        # info_random_node is shared between the existence check (returns "test")
        # and the set-config call (must return "ok"). Sequence them.
        client.info_random_node = AsyncMock(side_effect=["test", "ok"])
        body = CreateNamespaceRequest(name="test", memorySize=2_000_000_000, replicationFactor=2)
        result = await clusters_service.configure_namespace(client, body)
        assert "test" in result
        assert "configured" in result.lower()

    async def test_unknown_namespace_raises(self):
        client = _make_mock_client()
        client.info_random_node = AsyncMock(return_value="")  # empty namespace list
        body = CreateNamespaceRequest(name="missing", memorySize=2_000_000_000, replicationFactor=2)
        with pytest.raises(NamespaceNotFoundError):
            await clusters_service.configure_namespace(client, body)

    async def test_failed_set_config_raises(self):
        client = _make_mock_client()
        client.info_random_node = AsyncMock(side_effect=["test", "error: bad"])
        body = CreateNamespaceRequest(name="test", memorySize=2_000_000_000, replicationFactor=2)
        with pytest.raises(NamespaceConfigError):
            await clusters_service.configure_namespace(client, body)

    async def test_set_config_command_includes_params(self):
        client = _make_mock_client()
        client.info_random_node = AsyncMock(side_effect=["test", "ok"])
        body = CreateNamespaceRequest(name="test", memorySize=4_000_000_000, replicationFactor=3)
        await clusters_service.configure_namespace(client, body)
        # Second invocation is the set-config call.
        second_call = client.info_random_node.await_args_list[1]
        cmd = second_call.args[0]
        assert cmd.startswith("set-config:")
        assert "id=test" in cmd
        assert "memory-size=4000000000" in cmd
        assert "replication-factor=3" in cmd


# ---------------------------------------------------------------------------
# Cross-module guarantees
# ---------------------------------------------------------------------------


class TestServiceModuleHasNoFastAPI:
    def test_no_fastapi_import(self):
        import aerospike_cluster_manager_api.services.clusters_service as mod

        # The service module must not depend on FastAPI shaping.
        assert "fastapi" not in mod.__dict__
        # And no fastapi.* names leak through.
        for attr in dir(mod):
            value = getattr(mod, attr)
            module_name = getattr(value, "__module__", "") or ""
            assert not module_name.startswith("fastapi"), f"{attr} originates in {module_name}"
