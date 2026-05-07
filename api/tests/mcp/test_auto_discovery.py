"""Auto-discovery wiring (Task B.6).

Verifies that ``build_mcp_app()`` returns a FastMCP with all Phase 1
tools registered, by importing every ``mcp/tools/*`` submodule before
calling :func:`register_all`. The expected count is centralised in
:data:`tests.mcp.conftest.EXPECTED_TOOL_COUNT`.
"""

from __future__ import annotations

import pytest

from aerospike_cluster_manager_api.mcp.registry import registered_tools
from aerospike_cluster_manager_api.mcp.server import build_mcp_app

from .conftest import EXPECTED_TOOL_COUNT


def test_build_mcp_app_registers_all_phase1_tools() -> None:
    # Importing the server module already triggers tools/__init__.py imports.
    build_mcp_app()
    names = {entry.name for entry in registered_tools()}

    # 8 connection tools
    assert "create_connection" in names
    assert "list_connections" in names
    assert "connect" in names
    assert "test_connection" in names
    # 3 cluster info
    assert "list_namespaces" in names
    assert "list_sets" in names
    assert "get_nodes" in names
    # 7 record
    assert "get_record" in names
    assert "create_record" in names
    assert "truncate_set" in names
    # 1 query
    assert "query" in names
    # 3 info commands
    assert "execute_info" in names
    assert "execute_info_on_node" in names
    assert "execute_info_read_only" in names
    # 5 K8s (Phase 2, #305)
    assert "list_k8s_clusters" in names
    assert "get_k8s_pods" in names
    assert "get_k8s_events" in names
    assert "scale_k8s_cluster" in names
    assert "get_k8s_logs" in names

    assert len(names) == EXPECTED_TOOL_COUNT, f"expected {EXPECTED_TOOL_COUNT} tools, got {len(names)}: {sorted(names)}"


@pytest.mark.asyncio
async def test_build_mcp_app_lists_tools_via_fastmcp() -> None:
    """FastMCP.list_tools() returns the same entries we registered."""
    mcp = build_mcp_app()
    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert len(names) == EXPECTED_TOOL_COUNT
