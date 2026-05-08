"""Tests for conditional MCP mount in :mod:`aerospike_cluster_manager_api.main`.

The mount is gated by the ``ACM_MCP_ENABLED`` environment variable so that
deployments that do not need the MCP transport pay no extra import or
routing cost. We exercise both legs of the toggle by reloading ``config``
and ``main`` after monkeypatching the env var.

These tests use :class:`httpx.ASGITransport` for in-process probing — no
uvicorn, no real network.
"""

from __future__ import annotations

import importlib
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture()
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture()
async def app_with_mcp_disabled(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[object]:
    """Reload main with ACM_MCP_ENABLED unset (default False)."""
    monkeypatch.delenv("ACM_MCP_ENABLED", raising=False)
    from aerospike_cluster_manager_api import config as _config
    from aerospike_cluster_manager_api import main as _main

    importlib.reload(_config)
    importlib.reload(_main)
    try:
        yield _main.app
    finally:
        importlib.reload(_config)
        importlib.reload(_main)


@pytest.fixture()
async def app_with_mcp_enabled(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[object]:
    """Reload main with ACM_MCP_ENABLED=true.

    The startup-refusal added in Phase 1 (see ``main.py:286-299``) requires
    ACM_MCP_ENABLED=true to be paired with one of OIDC, ACM_MCP_TOKEN, or
    ACM_MCP_ALLOW_ANONYMOUS. We opt for ALLOW_ANONYMOUS here because this
    fixture is exercising mount semantics, not the auth gate.
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


# ---------------------------------------------------------------------------
# Config flag defaults
# ---------------------------------------------------------------------------


def test_acm_mcp_enabled_defaults_to_false(monkeypatch: pytest.MonkeyPatch) -> None:
    """Without the env var set, the flag is False — MCP must be opt-in."""
    monkeypatch.delenv("ACM_MCP_ENABLED", raising=False)
    from aerospike_cluster_manager_api import config as _config

    importlib.reload(_config)
    try:
        assert _config.ACM_MCP_ENABLED is False
    finally:
        importlib.reload(_config)


def test_acm_mcp_path_defaults_to_slash_mcp(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ACM_MCP_PATH", raising=False)
    from aerospike_cluster_manager_api import config as _config

    importlib.reload(_config)
    try:
        assert _config.ACM_MCP_PATH == "/mcp"
    finally:
        importlib.reload(_config)


@pytest.mark.parametrize("raw", ["true", "1", "yes", "on", "TRUE", " True "])
def test_acm_mcp_enabled_truthy_strings(monkeypatch: pytest.MonkeyPatch, raw: str) -> None:
    monkeypatch.setenv("ACM_MCP_ENABLED", raw)
    from aerospike_cluster_manager_api import config as _config

    importlib.reload(_config)
    try:
        assert _config.ACM_MCP_ENABLED is True
    finally:
        monkeypatch.delenv("ACM_MCP_ENABLED", raising=False)
        importlib.reload(_config)


# ---------------------------------------------------------------------------
# Mount behaviour — flag OFF
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_mcp_route_absent_when_flag_disabled(app_with_mcp_disabled) -> None:
    """A request to /mcp returns 404 when the feature flag is False."""
    transport = ASGITransport(app=app_with_mcp_disabled)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/mcp")
        assert resp.status_code == 404
        # Sanity check: the regular API surface is still wired up.
        health = await ac.get("/api/health")
        assert health.status_code == 200


@pytest.mark.anyio
async def test_mcp_subpath_absent_when_flag_disabled(app_with_mcp_disabled) -> None:
    transport = ASGITransport(app=app_with_mcp_disabled)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/mcp/anything/here")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Mount behaviour — flag ON
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_mcp_route_exists_when_flag_enabled(app_with_mcp_enabled) -> None:
    """When the flag is on, /mcp is mounted — any non-404 status proves it.

    We don't perform a full MCP `initialize` round-trip here; that's task
    C.1. The streamable-http transport typically replies with 4xx (bad
    request, missing session header, etc.) to a bare GET, which is fine —
    the route exists, that's all this test asserts.

    Enter the app's lifespan so the FastMCP session manager's task group
    is initialised before the request reaches it. Previously the bare
    ``/mcp`` URL 307'd at the parent router and never touched the
    session manager — the canonical-mount fix sends the request straight
    through, so the ``RuntimeError("Task group is not initialized")``
    that used to be hidden by the redirect now surfaces unless lifespan
    has run.
    """
    transport = ASGITransport(app=app_with_mcp_enabled)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as ac,
        app_with_mcp_enabled.router.lifespan_context(app_with_mcp_enabled),
    ):
        resp = await ac.get("/mcp")
        assert resp.status_code != 404, (
            f"expected /mcp to be mounted, got 404 (status={resp.status_code}, body={resp.text!r})"
        )


@pytest.mark.anyio
async def test_existing_routes_still_work_when_flag_enabled(app_with_mcp_enabled) -> None:
    transport = ASGITransport(app=app_with_mcp_enabled)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
