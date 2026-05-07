"""Read-only profile end-to-end (Task C.2).

Verifies that ``ACM_MCP_ACCESS_PROFILE=read_only`` blocks mutation tools at
call time with the canonical access-denied error code, while read tools
continue to work. Mocks the underlying service layer so no Aerospike is
needed.

Coverage: every name in :data:`access_profile.WRITE_TOOLS` must be
parametrised here so a future contributor adding a new write tool will
see the gate exercised by default.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from aerospike_cluster_manager_api import config
from aerospike_cluster_manager_api.mcp.access_profile import AccessProfile
from aerospike_cluster_manager_api.mcp.errors import MCPToolError


@pytest.fixture
def read_only_profile(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "ACM_MCP_ACCESS_PROFILE", AccessProfile.READ_ONLY)


@pytest.mark.parametrize(
    "tool_name,kwargs",
    [
        ("create_record", {"conn_id": "x", "namespace": "test", "set_name": "s", "key": "1", "bins": {"a": 1}}),
        ("update_record", {"conn_id": "x", "namespace": "test", "set_name": "s", "key": "1", "bins": {"a": 1}}),
        ("delete_record", {"conn_id": "x", "namespace": "test", "set_name": "s", "key": "1"}),
        ("delete_bin", {"conn_id": "x", "namespace": "test", "set_name": "s", "key": "1", "bin_name": "a"}),
        ("truncate_set", {"conn_id": "x", "namespace": "test", "set_name": "s"}),
    ],
)
async def test_record_mutation_tools_blocked_under_read_only(
    read_only_profile: None, tool_name: str, kwargs: dict
) -> None:
    from aerospike_cluster_manager_api.mcp.tools import records as records_tools

    fn = getattr(records_tools, tool_name)
    with pytest.raises(MCPToolError) as exc_info:
        await fn(**kwargs)
    assert exc_info.value.code == "access_denied"
    assert tool_name in str(exc_info.value)


@pytest.mark.parametrize(
    "tool_name,kwargs",
    [
        ("create_connection", {"name": "Anything", "hosts": ["10.0.0.1"]}),
        (
            "update_connection",
            {"conn_id": "conn-x", "name": "Renamed"},
        ),
        ("delete_connection", {"conn_id": "conn-x"}),
    ],
)
async def test_connection_mutation_tools_blocked_under_read_only(
    read_only_profile: None, tool_name: str, kwargs: dict
) -> None:
    """The 3 connection mutation tools (``create``/``update``/``delete``) must
    refuse calls under ``READ_ONLY`` with ``code="access_denied"`` BEFORE
    the body runs. Without this check, the read-only profile would silently
    allow profile mutation through the MCP surface even though it claims
    to be read-only."""
    from aerospike_cluster_manager_api.mcp.tools import connections as conn_tools

    fn = getattr(conn_tools, tool_name)
    with pytest.raises(MCPToolError) as exc_info:
        await fn(**kwargs)
    assert exc_info.value.code == "access_denied"
    assert tool_name in str(exc_info.value)


async def test_execute_info_blocked_under_read_only(read_only_profile: None) -> None:
    from aerospike_cluster_manager_api.mcp.tools.info_commands import execute_info

    with pytest.raises(MCPToolError) as exc_info:
        await execute_info(conn_id="x", command="version")
    assert exc_info.value.code == "access_denied"


async def test_execute_info_on_node_blocked_under_read_only(read_only_profile: None) -> None:
    """``execute_info_on_node`` (companion of ``execute_info``) is also a
    write tool because asinfo can mutate cluster configuration."""
    from aerospike_cluster_manager_api.mcp.tools.info_commands import (
        execute_info_on_node,
    )

    with pytest.raises(MCPToolError) as exc_info:
        await execute_info_on_node(conn_id="x", command="version", node_name="BB9")
    assert exc_info.value.code == "access_denied"


async def test_read_tool_works_under_read_only(read_only_profile: None) -> None:
    """``get_record`` is mutation=False so READ_ONLY does not block it."""
    from types import SimpleNamespace

    from aerospike_cluster_manager_api.mcp.tools import records as records_tools

    fake_record = SimpleNamespace(
        key=("test", "s", "1", b"\x00"),
        meta=SimpleNamespace(gen=1, ttl=0),
        bins={"name": "Alice"},
    )
    with (
        patch.object(records_tools.client_manager, "get_client", new=AsyncMock(return_value=object())),
        patch(
            "aerospike_cluster_manager_api.mcp.tools.records.records_service.get_record",
            new=AsyncMock(return_value=fake_record),
        ),
    ):
        out = await records_tools.get_record(conn_id="x", namespace="test", set_name="s", key="1")

    assert out["key"]["namespace"] == "test"
    assert out["bins"]["name"] == "Alice"


async def test_execute_info_read_only_works_under_read_only(read_only_profile: None) -> None:
    """``execute_info_read_only`` is mutation=False — READ_ONLY callers can
    invoke it for safe diagnostic reads even though the sibling
    ``execute_info`` and ``execute_info_on_node`` are blocked. The verb
    whitelist still applies."""
    from aerospike_cluster_manager_api.mcp.tools import info_commands as info_tools

    with (
        patch.object(info_tools.client_manager, "get_client", new=AsyncMock(return_value=object())),
        patch(
            "aerospike_cluster_manager_api.mcp.tools.info_commands.clusters_service.execute_info_read_only",
            new=AsyncMock(return_value=("BB9", "test;bar")),
        ),
    ):
        out = await info_tools.execute_info_read_only(conn_id="x", command="namespaces")

    # Real cluster node name (no <random> sentinel).
    assert out["node"] == "BB9"
    assert out["response"] == "test;bar"


async def test_scale_k8s_cluster_blocked_under_read_only(
    read_only_profile: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``scale_k8s_cluster`` patches ``spec.size``, so it is a write tool --
    READ_ONLY must reject it with ``access_denied`` BEFORE the K8s client is
    touched. We flip ``K8S_MANAGEMENT_ENABLED`` on so the gate is exercised
    rather than the unavailable path; the access gate fires first."""
    from aerospike_cluster_manager_api import config as app_config
    from aerospike_cluster_manager_api.mcp.tools import k8s as k8s_tools

    monkeypatch.setattr(app_config, "K8S_MANAGEMENT_ENABLED", True)

    with pytest.raises(MCPToolError) as exc_info:
        await k8s_tools.scale_k8s_cluster(cluster_id="default/cl", size=3)
    assert exc_info.value.code == "access_denied"
    assert "scale_k8s_cluster" in str(exc_info.value)


async def test_execute_info_read_only_unwhitelisted_verb_yields_invalid_argument(
    read_only_profile: None,
) -> None:
    """A write verb in execute_info_read_only goes through the access gate
    (mutation=False, so it passes), but the service-layer whitelist rejects
    the verb and surfaces ``invalid_argument`` — distinct from the
    ``access_denied`` returned by the sibling ``execute_info`` tools."""
    from aerospike_cluster_manager_api.mcp.tools import info_commands as info_tools

    with (
        patch.object(info_tools.client_manager, "get_client", new=AsyncMock(return_value=object())),
        pytest.raises(MCPToolError) as exc_info,
    ):
        await info_tools.execute_info_read_only(conn_id="x", command="recluster:")

    assert exc_info.value.code == "invalid_argument"
    assert "recluster" in str(exc_info.value)
