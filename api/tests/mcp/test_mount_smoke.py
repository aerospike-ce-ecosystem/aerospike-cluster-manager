"""Mount smoke tests (Task C.1, renamed from test_e2e.py).

Boots the real FastAPI app via in-process ASGI transport with
``ACM_MCP_ENABLED=true`` and verifies:

* the ``/mcp`` route exists on the real FastAPI app when the flag is on;
* it does NOT exist when the flag is off;
* the mounted FastMCP exposes the expected number of tools (via direct
  ``mcp.list_tools()`` — no JSON-RPC roundtrip).

This file is deliberately scoped to mount + registration plumbing.
The actual JSON-RPC end-to-end roundtrip lives in :mod:`tests.mcp.test_e2e`,
which exercises ``mcp.call_tool(...)`` against the registered handler chain
(access-profile gate → error map → tool body → serialise).
"""

from __future__ import annotations

import importlib

import pytest

from .conftest import EXPECTED_TOOL_COUNT


@pytest.fixture()
def app_with_mcp_enabled(monkeypatch: pytest.MonkeyPatch):
    """Reload main with ACM_MCP_ENABLED=true so /mcp is mounted.

    Sets ``ACM_MCP_ALLOW_ANONYMOUS=true`` because Phase 1 ``main.py``
    refuses to start the MCP surface without auth — and this fixture
    does not need to exercise auth paths.
    """
    monkeypatch.setenv("ACM_MCP_ENABLED", "true")
    monkeypatch.setenv("ACM_MCP_ALLOW_ANONYMOUS", "true")
    from aerospike_cluster_manager_api import config as _config
    from aerospike_cluster_manager_api import main as _main

    importlib.reload(_config)
    importlib.reload(_main)
    try:
        yield _main.app
    finally:
        monkeypatch.delenv("ACM_MCP_ENABLED", raising=False)
        monkeypatch.delenv("ACM_MCP_ALLOW_ANONYMOUS", raising=False)
        importlib.reload(_config)
        importlib.reload(_main)


async def test_mcp_endpoint_lists_phase1_tools_via_fastmcp(app_with_mcp_enabled) -> None:
    """The mounted ``/mcp`` server exposes the full Phase 1 tool surface."""
    from aerospike_cluster_manager_api.mcp.server import build_mcp_app

    mcp = build_mcp_app()
    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert len(names) == EXPECTED_TOOL_COUNT, sorted(names)


async def test_mcp_route_exists_when_flag_on(app_with_mcp_enabled) -> None:
    """The /mcp route exists on the real FastAPI app when the flag is on.

    The request needs the app's lifespan to be active because the
    canonical-mount fix forwards ``/mcp`` straight into the streamable
    HTTP transport (no more 307 to ``/mcp/``), and the transport's
    session manager raises ``Task group is not initialized`` until
    lifespan has bootstrapped its task group.
    """
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=app_with_mcp_enabled)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as client,
        app_with_mcp_enabled.router.lifespan_context(app_with_mcp_enabled),
    ):
        response = await client.get("/mcp")
        # Streamable HTTP MCP responds to GETs with 405/406/200 depending on
        # the SDK version — anything other than 404 proves the mount worked.
        assert response.status_code != 404


async def test_mcp_route_404_when_flag_off(monkeypatch: pytest.MonkeyPatch) -> None:
    """The /mcp route does NOT exist when ACM_MCP_ENABLED is unset."""
    from httpx import ASGITransport, AsyncClient

    monkeypatch.delenv("ACM_MCP_ENABLED", raising=False)
    from aerospike_cluster_manager_api import config as _config
    from aerospike_cluster_manager_api import main as _main

    importlib.reload(_config)
    importlib.reload(_main)
    try:
        transport = ASGITransport(app=_main.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/mcp")
            assert response.status_code == 404
    finally:
        importlib.reload(_config)
        importlib.reload(_main)
