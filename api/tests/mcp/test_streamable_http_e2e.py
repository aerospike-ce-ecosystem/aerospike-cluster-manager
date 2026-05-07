"""Wire-level JSON-RPC end-to-end test for the MCP ``/mcp`` mount (#304).

Why this file exists
--------------------

The sibling :mod:`tests.mcp.test_e2e` test drives :meth:`FastMCP.call_tool`
directly. That hits the registered handler chain (access-profile gate →
``map_aerospike_errors`` → tool body → serialiser) but it deliberately
bypasses the streamable-HTTP transport — i.e. the JSON-RPC envelope parser,
the SSE response framer, and the session-id negotiation that real MCP
clients (Claude Desktop, Cursor, Claude Code) actually exercise.

This test fills that gap. It boots the real FastAPI app (with
``ACM_MCP_ENABLED=true`` so the ``/mcp`` mount is wired), wraps it in
:class:`httpx.ASGITransport` so requests stay in-process, and drives the
full JSON-RPC handshake over the wire:

1. ``initialize`` → 200 with SSE-framed JSON-RPC ``result`` containing
   ``protocolVersion`` + ``serverInfo``; response carries a fresh
   ``Mcp-Session-Id`` header.
2. ``notifications/initialized`` → 202 (no body, completes the handshake).
3. ``tools/list`` → 200 with the full Phase 1 surface
   (:data:`EXPECTED_TOOL_COUNT` tools).
4. ``tools/call`` for ``test_connection`` → 200 with a JSON-RPC
   ``result`` envelope containing both ``content`` (TextContent block)
   AND ``structuredContent`` (the tool's return dict). The underlying
   service is mocked so the test stays hermetic — no Aerospike required.

Bonus: a ``tools/list`` POST without ``Mcp-Session-Id`` is rejected with
HTTP 400 + JSON-RPC error ``Missing session ID``, and two back-to-back
``initialize`` calls hand out distinct session IDs.

Out of scope (deliberate, can land in follow-ups)
-------------------------------------------------

* Multi-call streaming where the server pushes interleaved progress
  notifications on the SSE channel before the final ``result``.
* Error envelope shapes for tool exceptions (the ``isError: true``
  branch). The handler-level error mapping is already covered by
  :mod:`tests.mcp.test_e2e`.
* The ``Authorization: Bearer`` flow — exercised separately by
  :mod:`tests.middleware.test_mcp_auth`. This file uses
  ``ACM_MCP_ALLOW_ANONYMOUS=true`` to keep the wire fixture small.

Implementation notes
--------------------

* We use the **hand-rolled httpx + JSON-RPC** approach (Option 2 from
  issue #304) rather than the ``mcp.client.streamable_http_client``
  helper. The SDK helper insists on real network I/O semantics that
  ``httpx.ASGITransport`` does not satisfy cleanly (memory streams +
  task groups deadlock when fed by an in-process ASGI transport).
  Hand-rolling keeps the test synchronous and inspectable: every
  request/response pair is visible in the test body.
* The base URL is ``http://127.0.0.1:8000`` because FastMCP's
  ``streamable_http_app`` ships a DNS-rebinding guard that whitelists
  ``127.0.0.1:*`` and ``localhost:*``; ``testserver`` (httpx default) is
  rejected with HTTP 421 ``Invalid Host header``.
* All POSTs go to ``/mcp/`` (trailing slash) because the mount answers
  ``/mcp`` with a 307 redirect to ``/mcp/`` and httpx does not follow
  307s for POSTs by default — sending the canonical path keeps the
  test focused on the protocol, not redirect plumbing.
"""

from __future__ import annotations

import importlib
import json
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from aerospike_cluster_manager_api.services.connections_service import (
    # Aliased to avoid pytest's auto-collection of names that start with
    # ``Test`` — this is a NamedTuple, not a test class.
    TestConnectionResult as _TestConnectionResult,
)

from .conftest import EXPECTED_TOOL_COUNT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


# FastMCP serialises JSON-RPC responses as Server-Sent Events when the
# client advertises ``Accept: text/event-stream``. The framing is
# ``event: message\ndata: <json>\n\n`` — we extract the JSON payload
# from the first ``data:`` line.
def _parse_jsonrpc(response: httpx.Response) -> dict[str, Any]:
    """Decode the JSON-RPC body of an MCP response, SSE or plain JSON.

    The streamable-HTTP transport returns SSE for request/response
    pairs and plain JSON for error envelopes — this helper handles
    both shapes so callers don't have to branch on Content-Type.
    """
    content_type = response.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        for line in response.text.splitlines():
            if line.startswith("data: "):
                return json.loads(line[len("data: ") :])
        raise AssertionError(f"SSE response had no data frame: {response.text!r}")
    if "application/json" in content_type:
        return response.json()
    raise AssertionError(f"unexpected Content-Type {content_type!r}: {response.text!r}")


# Headers that every JSON-RPC POST must carry on the streamable-HTTP
# transport. ``Accept`` lists both media types because the server
# decides per-message whether to reply with SSE or plain JSON.
_MCP_HEADERS: dict[str, str] = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}


def _initialize_body(client_name: str = "wire-e2e-test") -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": client_name, "version": "0.0.0"},
        },
    }


# ---------------------------------------------------------------------------
# App fixture — boot the real FastAPI app with the MCP mount enabled
# ---------------------------------------------------------------------------


@pytest.fixture()
def mcp_app(monkeypatch: pytest.MonkeyPatch):
    """Reload ``main`` with ``ACM_MCP_ENABLED=true`` and yield the FastAPI app.

    Modelled on the fixture in :mod:`tests.mcp.test_mount_smoke`. We set
    ``ACM_MCP_ALLOW_ANONYMOUS=true`` so the bearer-token middleware does
    not gate the request — the wire test is about JSON-RPC framing, not
    auth (auth is covered by :mod:`tests.middleware.test_mcp_auth`).

    Both flags are flipped via :class:`pytest.MonkeyPatch` and the
    config + main modules are reloaded before AND after the test so
    other tests in the suite see the original (default) wiring.
    """
    monkeypatch.setenv("ACM_MCP_ENABLED", "true")
    monkeypatch.setenv("ACM_MCP_ALLOW_ANONYMOUS", "true")
    monkeypatch.delenv("ACM_MCP_TOKEN", raising=False)
    monkeypatch.setenv("OIDC_ENABLED", "false")

    from aerospike_cluster_manager_api import config as _config
    from aerospike_cluster_manager_api import main as _main

    importlib.reload(_config)
    importlib.reload(_main)
    try:
        yield _main.app
    finally:
        monkeypatch.delenv("ACM_MCP_ENABLED", raising=False)
        monkeypatch.delenv("ACM_MCP_ALLOW_ANONYMOUS", raising=False)
        monkeypatch.delenv("OIDC_ENABLED", raising=False)
        importlib.reload(_config)
        importlib.reload(_main)


# ---------------------------------------------------------------------------
# Wire tests
# ---------------------------------------------------------------------------


async def test_initialize_returns_session_id_and_server_info(mcp_app) -> None:
    """``POST /mcp/ {method: initialize}`` yields a JSON-RPC ``result``
    with ``serverInfo`` + ``protocolVersion``, and the response headers
    carry a fresh ``Mcp-Session-Id`` for subsequent calls."""
    transport = httpx.ASGITransport(app=mcp_app)
    async with (
        httpx.AsyncClient(
            transport=transport,
            base_url="http://127.0.0.1:8000",
            timeout=httpx.Timeout(15.0),
        ) as client,
        mcp_app.router.lifespan_context(mcp_app),
    ):
        response = await client.post("/mcp/", json=_initialize_body(), headers=_MCP_HEADERS)

        assert response.status_code == 200
        session_id = response.headers.get("mcp-session-id")
        assert session_id, "initialize must hand out a Mcp-Session-Id header"

        payload = _parse_jsonrpc(response)
        assert payload["jsonrpc"] == "2.0"
        assert payload["id"] == 1
        result = payload["result"]
        assert "protocolVersion" in result
        # serverInfo.name is whatever ``build_mcp_app`` configured — we
        # don't assert the literal so a future rename doesn't break this
        # test, only that the field is populated.
        assert isinstance(result["serverInfo"]["name"], str)
        assert result["serverInfo"]["name"]


async def test_tools_list_over_wire_returns_phase1_surface(mcp_app) -> None:
    """``initialize`` → ``initialized`` → ``tools/list`` round-trip
    returns the full Phase 1 tool surface (:data:`EXPECTED_TOOL_COUNT`)
    with a valid JSON-RPC envelope. This is the path Claude Desktop /
    Claude Code actually exercise; the in-process ``call_tool`` test
    cannot detect a regression in the JSON-RPC framing layer."""
    transport = httpx.ASGITransport(app=mcp_app)
    async with (
        httpx.AsyncClient(
            transport=transport,
            base_url="http://127.0.0.1:8000",
            timeout=httpx.Timeout(15.0),
        ) as client,
        mcp_app.router.lifespan_context(mcp_app),
    ):
        # 1. initialize
        init_response = await client.post("/mcp/", json=_initialize_body(), headers=_MCP_HEADERS)
        session_id = init_response.headers["mcp-session-id"]
        session_headers = {**_MCP_HEADERS, "Mcp-Session-Id": session_id}

        # 2. initialized notification — required by the spec before any
        # request method (tools/list, tools/call, etc.) will be served.
        notif_response = await client.post(
            "/mcp/",
            json={"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
            headers=session_headers,
        )
        # 202 Accepted is the canonical response for a notification with
        # no result; anything else means the handshake was rejected.
        assert notif_response.status_code == 202

        # 3. tools/list
        list_response = await client.post(
            "/mcp/",
            json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            headers=session_headers,
        )
        assert list_response.status_code == 200

        payload = _parse_jsonrpc(list_response)
        assert payload["jsonrpc"] == "2.0"
        assert payload["id"] == 2
        tools = payload["result"]["tools"]
        names = {t["name"] for t in tools}
        assert len(names) == EXPECTED_TOOL_COUNT, sorted(names)
        # Spot-check the same one-of-each-category set as test_e2e to
        # protect against the registry accidentally returning duplicates
        # of a single tool.
        assert {
            "test_connection",
            "list_namespaces",
            "get_record",
            "query",
            "execute_info",
        }.issubset(names)


async def test_tools_call_test_connection_over_wire_succeeds(mcp_app) -> None:
    """``tools/call`` for ``test_connection`` round-trips through the
    full wire stack: JSON-RPC envelope → tool dispatch → serialiser →
    SSE frame. The underlying service is mocked so the test asserts
    only the wire shape, not network behaviour."""

    async def _fake(_req):  # type: ignore[no-untyped-def]
        return _TestConnectionResult(success=True, message="Connected successfully")

    transport = httpx.ASGITransport(app=mcp_app)
    async with (
        httpx.AsyncClient(
            transport=transport,
            base_url="http://127.0.0.1:8000",
            timeout=httpx.Timeout(15.0),
        ) as client,
        mcp_app.router.lifespan_context(mcp_app),
    ):
        # initialize + initialized handshake.
        init_response = await client.post("/mcp/", json=_initialize_body(), headers=_MCP_HEADERS)
        session_id = init_response.headers["mcp-session-id"]
        session_headers = {**_MCP_HEADERS, "Mcp-Session-Id": session_id}
        await client.post(
            "/mcp/",
            json={"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
            headers=session_headers,
        )

        # tools/call test_connection (mocked service so it's hermetic).
        with patch(
            "aerospike_cluster_manager_api.mcp.tools.connections.connections_service.test_connection",
            new=AsyncMock(side_effect=_fake),
        ):
            call_response = await client.post(
                "/mcp/",
                json={
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "tools/call",
                    "params": {
                        "name": "test_connection",
                        "arguments": {"hosts": ["localhost"], "port": 3000},
                    },
                },
                headers=session_headers,
            )

    assert call_response.status_code == 200
    payload = _parse_jsonrpc(call_response)
    assert payload["jsonrpc"] == "2.0"
    assert payload["id"] == 3

    result = payload["result"]
    # FastMCP returns BOTH a TextContent block (for clients that don't
    # support structured output) AND a ``structuredContent`` dict (for
    # clients that do). The new test asserts both because both are part
    # of the wire contract.
    assert result["isError"] is False
    structured = result["structuredContent"]
    assert structured["success"] is True
    assert structured["message"] == "Connected successfully"
    # The text block is a JSON-encoded copy of the structured payload.
    text_blocks = [c for c in result["content"] if c["type"] == "text"]
    assert text_blocks, f"expected at least one text content block: {result!r}"
    decoded_text = json.loads(text_blocks[0]["text"])
    assert decoded_text == structured


async def test_tools_list_without_session_id_is_rejected(mcp_app) -> None:
    """A second-step request (``tools/list``) without a session header
    is refused with JSON-RPC error ``Missing session ID`` and HTTP 400.

    This proves the streamable-HTTP transport's session gate is wired:
    the in-process ``call_tool`` shortcut would happily answer the
    request because it bypasses session negotiation entirely.
    """
    transport = httpx.ASGITransport(app=mcp_app)
    async with (
        httpx.AsyncClient(
            transport=transport,
            base_url="http://127.0.0.1:8000",
            timeout=httpx.Timeout(15.0),
        ) as client,
        mcp_app.router.lifespan_context(mcp_app),
    ):
        response = await client.post(
            "/mcp/",
            json={"jsonrpc": "2.0", "id": 99, "method": "tools/list", "params": {}},
            headers=_MCP_HEADERS,
        )

    assert response.status_code == 400
    payload = _parse_jsonrpc(response)
    assert payload["jsonrpc"] == "2.0"
    error = payload["error"]
    # Code -32600 is "Invalid Request" in JSON-RPC; the SDK uses it for
    # "Bad Request: Missing session ID".
    assert error["code"] == -32600
    assert "session" in error["message"].lower()


async def test_two_initializes_yield_distinct_session_ids(mcp_app) -> None:
    """Each ``initialize`` POST without an existing session header
    produces a fresh ``Mcp-Session-Id``; two clients sharing the same
    HTTP transport never inherit each other's session state."""
    transport = httpx.ASGITransport(app=mcp_app)
    async with (
        httpx.AsyncClient(
            transport=transport,
            base_url="http://127.0.0.1:8000",
            timeout=httpx.Timeout(15.0),
        ) as client,
        mcp_app.router.lifespan_context(mcp_app),
    ):
        first = await client.post("/mcp/", json=_initialize_body("client-a"), headers=_MCP_HEADERS)
        second = await client.post("/mcp/", json=_initialize_body("client-b"), headers=_MCP_HEADERS)

    sid1 = first.headers.get("mcp-session-id")
    sid2 = second.headers.get("mcp-session-id")
    assert sid1 and sid2, "both initialize calls must hand out a session id"
    assert sid1 != sid2, "session ids must not collide across initialize calls"
