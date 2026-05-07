"""Tests for the MCP K8s tools (Phase 2 -- #305).

Direct callable invocation is enough to exercise the wrapping layer the
registry decorator applies (access profile gate, error mapping, the
``_assert_k8s_enabled`` guard, ``_parse_cluster_id`` validation, and bound
checks on ``since_minutes`` / ``since_seconds`` / ``tail_lines``).

The K8sClient surface is fully mocked -- service-layer tests already cover
the underlying helpers (``extract_summary``, ``categorize_event``).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from aerospike_cluster_manager_api import config as app_config
from aerospike_cluster_manager_api.k8s_client import K8sApiError
from aerospike_cluster_manager_api.mcp.errors import MCPToolError
from aerospike_cluster_manager_api.mcp.registry import registered_tools


@pytest.fixture
def k8s_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Flip ``K8S_MANAGEMENT_ENABLED`` on for the test body.

    Also forces ``ACCESS_PROFILE=FULL`` so the access-profile gate does not
    pre-empt the body of mutation tools (``scale_k8s_cluster``). Tests that
    specifically want to exercise the read-only gate flip the profile back
    explicitly (see ``test_scale_k8s_cluster_blocked_under_read_only`` in
    ``test_e2e_readonly.py``).
    """
    from aerospike_cluster_manager_api.mcp.access_profile import AccessProfile

    monkeypatch.setattr(app_config, "K8S_MANAGEMENT_ENABLED", True)
    monkeypatch.setattr(app_config, "ACM_MCP_ACCESS_PROFILE", AccessProfile.FULL)


def test_k8s_module_registers_five_tools() -> None:
    from aerospike_cluster_manager_api.mcp.tools import k8s as _k8s  # noqa: F401

    names = {entry.name for entry in registered_tools() if entry.category == "k8s"}
    assert names == {
        "list_k8s_clusters",
        "get_k8s_pods",
        "get_k8s_events",
        "scale_k8s_cluster",
        "get_k8s_logs",
    }


def test_only_scale_k8s_cluster_is_mutation() -> None:
    from aerospike_cluster_manager_api.mcp.tools import k8s as _k8s  # noqa: F401

    by_name = {entry.name: entry for entry in registered_tools() if entry.category == "k8s"}
    assert by_name["scale_k8s_cluster"].mutation is True
    for read_tool in ("list_k8s_clusters", "get_k8s_pods", "get_k8s_events", "get_k8s_logs"):
        assert by_name[read_tool].mutation is False, read_tool


@pytest.mark.parametrize(
    "tool_name,kwargs",
    [
        ("list_k8s_clusters", {}),
        ("get_k8s_pods", {"cluster_id": "default/cl"}),
        ("get_k8s_events", {"cluster_id": "default/cl"}),
        ("scale_k8s_cluster", {"cluster_id": "default/cl", "size": 3}),
        ("get_k8s_logs", {"cluster_id": "default/cl", "pod_name": "cl-0-0"}),
    ],
)
async def test_disabled_flag_returns_unavailable(
    monkeypatch: pytest.MonkeyPatch, tool_name: str, kwargs: dict[str, Any]
) -> None:
    """When K8S_MANAGEMENT_ENABLED=false every tool short-circuits with
    ``code="unavailable"`` -- no K8s client init, no body execution.

    Forced FULL profile so the access-profile gate does not pre-empt the
    unavailability check on ``scale_k8s_cluster`` (READ_ONLY would yield
    ``access_denied`` before ``_assert_k8s_enabled`` runs).
    """
    from aerospike_cluster_manager_api.mcp.access_profile import AccessProfile
    from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

    monkeypatch.setattr(app_config, "K8S_MANAGEMENT_ENABLED", False)
    monkeypatch.setattr(app_config, "ACM_MCP_ACCESS_PROFILE", AccessProfile.FULL)

    fn = getattr(k8s_tools, tool_name)
    with pytest.raises(MCPToolError) as exc_info:
        await fn(**kwargs)
    assert exc_info.value.code == "unavailable"


@pytest.mark.parametrize("bad_id", ["", "noslash", "/missing-ns", "ns/", "ns/name/extra"])
async def test_malformed_cluster_id_yields_invalid_argument(k8s_enabled: None, bad_id: str) -> None:
    from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

    with pytest.raises(MCPToolError) as exc_info:
        await k8s_tools.get_k8s_pods(cluster_id=bad_id)
    assert exc_info.value.code == "invalid_argument"


_SAMPLE_CR = {
    "apiVersion": "acko.io/v1alpha1",
    "kind": "AerospikeCluster",
    "metadata": {
        "name": "cl",
        "namespace": "default",
        "creationTimestamp": "2026-05-01T12:00:00Z",
        "labels": {"acm.aerospike.com/workspace": "ws-default"},
    },
    "spec": {"size": 3, "image": "aerospike/aerospike-server:8.1"},
    "status": {"phase": "Completed", "failedReconcileCount": 0},
}


class TestListK8sClusters:
    async def test_happy_path_returns_summary_dicts(self, k8s_enabled: None) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        with patch.object(
            k8s_tools.k8s_client,
            "list_clusters",
            new=AsyncMock(return_value=([_SAMPLE_CR], None)),
        ):
            result = await k8s_tools.list_k8s_clusters()

        assert len(result) == 1
        item = result[0]
        assert item["name"] == "cl"
        assert item["namespace"] == "default"
        assert item["size"] == 3
        assert item["phase"] == "Completed"

    async def test_workspace_filter_passes_label_selector(self, k8s_enabled: None) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        mock = AsyncMock(return_value=([], None))
        with patch.object(k8s_tools.k8s_client, "list_clusters", new=mock):
            await k8s_tools.list_k8s_clusters(workspace_id="ws-team")

        _, kwargs = mock.call_args
        assert kwargs["label_selector"] == "acm.aerospike.com/workspace=ws-team"

    async def test_no_workspace_omits_label_selector(self, k8s_enabled: None) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        mock = AsyncMock(return_value=([], None))
        with patch.object(k8s_tools.k8s_client, "list_clusters", new=mock):
            await k8s_tools.list_k8s_clusters()

        _, kwargs = mock.call_args
        assert kwargs["label_selector"] is None


class TestGetK8sPods:
    async def test_happy_path_returns_pod_status_dicts(self, k8s_enabled: None) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        raw_pods = [
            {
                "name": "cl-0-0",
                "podIP": "10.0.0.5",
                "hostIP": "10.0.0.1",
                "isReady": True,
                "phase": "Running",
                "image": "aerospike/aerospike-server:8.1",
            }
        ]
        with patch.object(
            k8s_tools.k8s_client,
            "list_pods",
            new=AsyncMock(return_value=raw_pods),
        ):
            result = await k8s_tools.get_k8s_pods(cluster_id="default/cl")

        assert len(result) == 1
        assert result[0]["name"] == "cl-0-0"
        assert result[0]["isReady"] is True
        assert result[0]["podIP"] == "10.0.0.5"

    async def test_404_from_k8s_maps_to_not_found(self, k8s_enabled: None) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        with (
            patch.object(
                k8s_tools.k8s_client,
                "list_pods",
                new=AsyncMock(side_effect=K8sApiError(status=404, reason="NotFound", message="cl missing")),
            ),
            pytest.raises(MCPToolError) as exc_info,
        ):
            await k8s_tools.get_k8s_pods(cluster_id="default/cl")

        assert exc_info.value.code == "not_found"


class TestGetK8sEvents:
    async def test_happy_path_assigns_category(self, k8s_enabled: None) -> None:
        from datetime import UTC, datetime

        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        raw_events = [
            {
                "type": "Normal",
                "reason": "RollingRestartStarted",
                "message": "rolling restart kicked off",
                "count": 1,
                "firstTimestamp": now_iso,
                "lastTimestamp": now_iso,
                "source": "operator",
            }
        ]
        with patch.object(
            k8s_tools.k8s_client,
            "list_events",
            new=AsyncMock(return_value=raw_events),
        ):
            result = await k8s_tools.get_k8s_events(cluster_id="default/cl")

        assert len(result) == 1
        assert result[0]["reason"] == "RollingRestartStarted"
        assert result[0]["category"] == "Rolling Restart"

    async def test_old_events_filtered_out(self, k8s_enabled: None) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        old_iso = "2020-01-01T00:00:00Z"
        raw_events = [
            {
                "type": "Normal",
                "reason": "ClusterCreated",
                "message": "old event",
                "count": 1,
                "firstTimestamp": old_iso,
                "lastTimestamp": old_iso,
                "source": "operator",
            }
        ]
        with patch.object(
            k8s_tools.k8s_client,
            "list_events",
            new=AsyncMock(return_value=raw_events),
        ):
            result = await k8s_tools.get_k8s_events(cluster_id="default/cl", since_minutes=10)

        assert result == []

    @pytest.mark.parametrize("bad", [0, -1, 1441, 100000])
    async def test_since_minutes_bounds(self, k8s_enabled: None, bad: int) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        with pytest.raises(MCPToolError) as exc_info:
            await k8s_tools.get_k8s_events(cluster_id="default/cl", since_minutes=bad)
        assert exc_info.value.code == "invalid_argument"


class TestScaleK8sCluster:
    async def test_happy_path_returns_size_diff(self, k8s_enabled: None) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        before = {**_SAMPLE_CR, "spec": {**_SAMPLE_CR["spec"], "size": 3}}
        after = {**_SAMPLE_CR, "spec": {**_SAMPLE_CR["spec"], "size": 5}}

        with (
            patch.object(k8s_tools.k8s_client, "get_cluster", new=AsyncMock(return_value=before)),
            patch.object(k8s_tools.k8s_client, "patch_cluster", new=AsyncMock(return_value=after)) as patch_mock,
        ):
            result = await k8s_tools.scale_k8s_cluster(cluster_id="default/cl", size=5)

        assert result == {"clusterId": "default/cl", "previousSize": 3, "newSize": 5}
        args, _ = patch_mock.call_args
        assert args == ("default", "cl", {"spec": {"size": 5}})

    async def test_negative_size_yields_invalid_argument(self, k8s_enabled: None) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        with pytest.raises(MCPToolError) as exc_info:
            await k8s_tools.scale_k8s_cluster(cluster_id="default/cl", size=0)
        assert exc_info.value.code == "invalid_argument"

    async def test_409_from_webhook_maps_to_conflict(self, k8s_enabled: None) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        before = {**_SAMPLE_CR, "spec": {**_SAMPLE_CR["spec"], "size": 3}}
        with (
            patch.object(k8s_tools.k8s_client, "get_cluster", new=AsyncMock(return_value=before)),
            patch.object(
                k8s_tools.k8s_client,
                "patch_cluster",
                new=AsyncMock(
                    side_effect=K8sApiError(status=409, reason="Conflict", message="size > 8 not allowed on CE")
                ),
            ),
            pytest.raises(MCPToolError) as exc_info,
        ):
            await k8s_tools.scale_k8s_cluster(cluster_id="default/cl", size=9)

        assert exc_info.value.code == "conflict"

    async def test_500_from_k8s_maps_to_internal_error(self, k8s_enabled: None) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        with (
            patch.object(
                k8s_tools.k8s_client,
                "get_cluster",
                new=AsyncMock(side_effect=K8sApiError(status=500, reason="ServerError", message="api server flake")),
            ),
            pytest.raises(MCPToolError) as exc_info,
        ):
            await k8s_tools.scale_k8s_cluster(cluster_id="default/cl", size=3)

        assert exc_info.value.code == "internal_error"


class TestGetK8sLogs:
    async def test_happy_path_returns_lines_and_truncated_flag(self, k8s_enabled: None) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        with (
            patch.object(
                k8s_tools.k8s_client,
                "list_pods",
                new=AsyncMock(return_value=[{"name": "cl-0-0"}]),
            ),
            patch.object(
                k8s_tools.k8s_client,
                "read_pod_log",
                new=AsyncMock(return_value="line1\nline2\nline3"),
            ),
        ):
            result = await k8s_tools.get_k8s_logs(cluster_id="default/cl", pod_name="cl-0-0", tail_lines=10)

        assert result["podName"] == "cl-0-0"
        assert result["lines"] == ["line1", "line2", "line3"]
        assert result["truncated"] is False

    async def test_truncated_flag_set_when_at_limit(self, k8s_enabled: None) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        log_text = "\n".join(f"line{i}" for i in range(5))
        with (
            patch.object(
                k8s_tools.k8s_client,
                "list_pods",
                new=AsyncMock(return_value=[{"name": "cl-0-0"}]),
            ),
            patch.object(
                k8s_tools.k8s_client,
                "read_pod_log",
                new=AsyncMock(return_value=log_text),
            ),
        ):
            result = await k8s_tools.get_k8s_logs(cluster_id="default/cl", pod_name="cl-0-0", tail_lines=5)

        assert result["truncated"] is True

    async def test_pod_not_in_cluster_yields_not_found(self, k8s_enabled: None) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        with (
            patch.object(
                k8s_tools.k8s_client,
                "list_pods",
                new=AsyncMock(return_value=[{"name": "cl-0-0"}]),
            ),
            pytest.raises(MCPToolError) as exc_info,
        ):
            await k8s_tools.get_k8s_logs(cluster_id="default/cl", pod_name="other-pod")

        assert exc_info.value.code == "not_found"

    @pytest.mark.parametrize(
        "kwargs",
        [
            {"since_seconds": 0},
            {"since_seconds": 3601},
            {"tail_lines": 0},
            {"tail_lines": 1001},
        ],
    )
    async def test_log_bounds_enforced(self, k8s_enabled: None, kwargs: dict[str, int]) -> None:
        from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

        with pytest.raises(MCPToolError) as exc_info:
            await k8s_tools.get_k8s_logs(
                cluster_id="default/cl",
                pod_name="cl-0-0",
                **kwargs,
            )
        assert exc_info.value.code == "invalid_argument"
