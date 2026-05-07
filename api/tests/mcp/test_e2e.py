"""Handler-chain end-to-end test for the MCP server.

This test exercises the full handler chain on an actual mounted FastMCP
instance — access-profile gate → error map → tool body → result
serialisation — by driving :meth:`FastMCP.call_tool` directly.

What this file does NOT cover
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

``call_tool`` bypasses the streamable-HTTP transport: the JSON-RPC
envelope parser, the SSE response framer, and the ``Mcp-Session-Id``
header negotiation are all skipped. By the time ``call_tool`` runs,
the wire codec has already been short-circuited.

The wire-level companion test lives in
:mod:`tests.mcp.test_streamable_http_e2e` (#304). It boots the real
FastAPI app under :class:`httpx.ASGITransport` and drives the same
``initialize`` / ``tools/list`` / ``tools/call`` sequence over actual
HTTP, so a regression in the JSON-RPC framing layer is caught there.

Coverage
--------
* ``initialize``-equivalent: ``build_mcp_app`` succeeds and the server
  carries the configured name.
* ``tools/list``: ``await mcp.list_tools()`` returns
  :data:`EXPECTED_TOOL_COUNT` entries.
* ``tools/call``: ``await mcp.call_tool("test_connection", {...})`` returns
  the expected ``{"success": ..., "message": ...}`` envelope, with the
  underlying service mocked so the test stays hermetic (no Aerospike).
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from aerospike_cluster_manager_api.services.connections_service import (
    # Aliased to avoid pytest's auto-collection of names that start with
    # ``Test`` — this is a NamedTuple, not a test class.
    TestConnectionResult as _TestConnectionResult,
)

from .conftest import EXPECTED_TOOL_COUNT


@pytest.fixture
def fastmcp_app():
    """Return a fresh ``FastMCP`` instance with all Phase 1 tools registered.

    The ``conftest.py`` import block already loaded every tool module so
    the registry is populated; ``build_mcp_app`` flushes that into a new
    FastMCP instance.
    """
    from aerospike_cluster_manager_api.mcp.server import build_mcp_app

    return build_mcp_app()


def _unwrap(payload: Any) -> Any:
    """Extract the JSON dict out of a ``call_tool`` response.

    FastMCP's ``call_tool`` returns either a structured ``dict`` or a
    ``(content_blocks, structured)`` tuple depending on the SDK version.
    When it returns content blocks, the first one is a ``TextContent``
    whose ``text`` is a JSON-encoded string of the tool's return value.
    This helper normalises both shapes to the dict the tool produced.
    """
    # Newer FastMCP: returns (content, structured) tuple where structured
    # is the raw dict the tool returned.
    if isinstance(payload, tuple) and len(payload) == 2:
        _content, structured = payload
        if isinstance(structured, dict):
            return structured

    # Older FastMCP / dict-only return.
    if isinstance(payload, dict):
        return payload

    # Fallback: a sequence of content blocks; decode the first text block.
    if hasattr(payload, "__iter__"):
        for block in payload:
            text = getattr(block, "text", None)
            if isinstance(text, str):
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return text
    return payload


# ---------------------------------------------------------------------------
# initialize-equivalent: server is built and named.
# ---------------------------------------------------------------------------


def test_initialize_equivalent_server_built_and_named(fastmcp_app) -> None:
    """A built FastMCP instance carries the configured server name and is
    ready to handle ``initialize`` / ``tools/list`` / ``tools/call`` calls."""
    # FastMCP exposes ``name`` as a settings field; just prove it's a non-
    # empty string so an "initialize" reply would have a server name to
    # send back.
    name = fastmcp_app.name
    assert isinstance(name, str)
    assert name


# ---------------------------------------------------------------------------
# tools/list — full Phase 1 surface visible via the FastMCP transport.
# ---------------------------------------------------------------------------


async def test_tools_list_returns_phase1_surface(fastmcp_app) -> None:
    """``await mcp.list_tools()`` is the exact code FastMCP runs on a
    JSON-RPC ``tools/list`` request — no extra dispatch layer to mock."""
    tools = await fastmcp_app.list_tools()
    names = {t.name for t in tools}
    assert len(names) == EXPECTED_TOOL_COUNT, sorted(names)
    # Spot-check one of each category to make sure the registry isn't
    # accidentally returning duplicates of a single tool.
    assert {
        "test_connection",
        "list_namespaces",
        "get_record",
        "query",
        "execute_info",
    }.issubset(names)


# ---------------------------------------------------------------------------
# tools/call — JSON-RPC roundtrip through the registered handler chain.
# ---------------------------------------------------------------------------


async def test_tools_call_test_connection_succeeds(fastmcp_app) -> None:
    """``await mcp.call_tool("test_connection", {...})`` round-trips through
    the registered wrapper (access-profile gate → ``map_aerospike_errors``
    → tool body → serialise) and returns the connection probe envelope.

    The underlying service is mocked so no live Aerospike is required —
    the test asserts the wire shape, not network behaviour.
    """

    async def _fake(_req):  # type: ignore[no-untyped-def]
        return _TestConnectionResult(success=True, message="Connected successfully")

    with patch(
        "aerospike_cluster_manager_api.mcp.tools.connections.connections_service.test_connection",
        new=AsyncMock(side_effect=_fake),
    ):
        raw = await fastmcp_app.call_tool(
            "test_connection",
            {"hosts": ["localhost"], "port": 3000},
        )

    payload = _unwrap(raw)
    assert isinstance(payload, dict), f"unexpected payload shape: {raw!r}"
    assert payload["success"] is True
    assert payload["message"] == "Connected successfully"


async def test_tools_call_unknown_tool_raises(fastmcp_app) -> None:
    """Calling a tool that does not exist surfaces an error at the
    JSON-RPC level — the FastMCP tool manager raises ``ToolError``
    (the SDK then maps that to an ``isError`` block on the wire)."""
    from mcp.server.fastmcp.exceptions import ToolError

    with pytest.raises(ToolError, match="Unknown tool"):
        await fastmcp_app.call_tool("definitely_not_a_real_tool", {})
