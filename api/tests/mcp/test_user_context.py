"""OIDC claim → MCP contextvar bridge -- E.2 of issue #307.

:class:`mcp.user_context.MCPUserContextMiddleware` captures
``request.state.user_claims`` for ``/mcp/*`` requests into a
:class:`contextvars.ContextVar` so the registry workspace gate (E.3)
can read the caller identity without re-threading the FastAPI
``Request``. This module pins the contract:

* the contextvar is set when the path matches ``/mcp/*``;
* the contextvar is reset on the way out so the value never leaks
  into the next request running on the same worker;
* non-MCP paths short-circuit -- no contextvar mutation.

The middleware is plain Starlette so we drive it with a fake
``call_next`` rather than spinning up the full ASGI stack.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from starlette.requests import Request
from starlette.responses import Response

from aerospike_cluster_manager_api.mcp.user_context import (
    _CLAIMS_CTXVAR,
    MCPUserContextMiddleware,
    current_caller_claims,
)


def _make_request(path: str, claims: dict | None) -> Request:
    """Build a Starlette ``Request`` with ``request.state.user_claims`` preset.

    Stub ASGI scope -- only the ``url.path`` and ``state`` matter for the
    middleware under test.
    """
    scope = {
        "type": "http",
        "method": "POST",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "scheme": "http",
        "server": ("testserver", 80),
        "client": ("127.0.0.1", 12345),
        "state": {},
    }
    request = Request(scope)
    if claims is not None:
        request.state.user_claims = claims
    return request


@pytest.fixture(autouse=True)
def isolate_contextvar():
    """Reset the contextvar between tests so cases cannot bleed into each other.

    We use ``set(None)`` on teardown rather than ``reset(token)`` because
    pytest-asyncio's fixture setup and teardown can run in different
    :class:`contextvars.Context`s, which invalidates the saved token.
    Setting to ``None`` is the default and works across contexts.
    """
    _CLAIMS_CTXVAR.set(None)
    yield
    _CLAIMS_CTXVAR.set(None)


@pytest.fixture()
def middleware():
    async def _noop_app(_scope, _receive, _send):
        # The fixture's tests drive ``dispatch(request, call_next)`` directly,
        # so the underlying ASGI app is never actually invoked. Defining it
        # as an async function (rather than a lambda returning ``None``)
        # satisfies Starlette's ``ASGIApp`` protocol.
        return None

    return MCPUserContextMiddleware(app=_noop_app)


class TestPathFilter:
    async def test_mcp_path_sets_contextvar_during_call(self, middleware) -> None:
        captured: dict = {}

        async def call_next(_request: Request) -> Response:
            captured["claims_during"] = current_caller_claims()
            return Response(status_code=200)

        with patch("aerospike_cluster_manager_api.mcp.user_context.config.ACM_MCP_PATH", "/mcp"):
            request = _make_request("/mcp/", claims={"sub": "alice"})
            await middleware.dispatch(request, call_next)

        assert captured["claims_during"] == {"sub": "alice"}
        # Reset on exit -- contextvar is back to None outside the call.
        assert current_caller_claims() is None

    async def test_non_mcp_path_does_not_touch_contextvar(self, middleware) -> None:
        captured: dict = {}

        async def call_next(_request: Request) -> Response:
            captured["claims_during"] = current_caller_claims()
            return Response(status_code=200)

        with patch("aerospike_cluster_manager_api.mcp.user_context.config.ACM_MCP_PATH", "/mcp"):
            request = _make_request("/api/connections", claims={"sub": "bob"})
            await middleware.dispatch(request, call_next)

        # Untouched -- the REST path doesn't go through this bridge.
        assert captured["claims_during"] is None

    async def test_segment_boundary_match(self, middleware) -> None:
        # ``/mcp-evil/foo`` must NOT be treated as an MCP path.
        captured: dict = {}

        async def call_next(_request: Request) -> Response:
            captured["claims_during"] = current_caller_claims()
            return Response(status_code=200)

        with patch("aerospike_cluster_manager_api.mcp.user_context.config.ACM_MCP_PATH", "/mcp"):
            request = _make_request("/mcp-evil/foo", claims={"sub": "evil"})
            await middleware.dispatch(request, call_next)

        assert captured["claims_during"] is None


class TestClaimShapes:
    async def test_no_user_claims_attribute_yields_none(self, middleware) -> None:
        # Anonymous request -- no auth middleware ran. The contextvar
        # is set to None explicitly so downstream code reads "no
        # caller identity" rather than a stale value.
        captured: dict = {}

        async def call_next(_request: Request) -> Response:
            captured["claims_during"] = current_caller_claims()
            return Response(status_code=200)

        with patch("aerospike_cluster_manager_api.mcp.user_context.config.ACM_MCP_PATH", "/mcp"):
            request = _make_request("/mcp/", claims=None)
            await middleware.dispatch(request, call_next)

        assert captured["claims_during"] is None

    async def test_bearer_sentinel_is_passed_through(self, middleware) -> None:
        # Bearer token middleware sets ``_mcp_bearer=True``; the bridge
        # does not unwrap it -- the registry gate inspects the sentinel
        # itself.
        captured: dict = {}

        async def call_next(_request: Request) -> Response:
            captured["claims_during"] = current_caller_claims()
            return Response(status_code=200)

        with patch("aerospike_cluster_manager_api.mcp.user_context.config.ACM_MCP_PATH", "/mcp"):
            request = _make_request("/mcp/", claims={"sub": "mcp-bearer", "_mcp_bearer": True})
            await middleware.dispatch(request, call_next)

        assert captured["claims_during"] == {"sub": "mcp-bearer", "_mcp_bearer": True}


class TestResetOnException:
    async def test_contextvar_reset_when_call_next_raises(self, middleware) -> None:
        # If the inner handler raises, the ``finally`` in the middleware
        # must still reset the contextvar so the next request on the
        # same worker thread doesn't see leaked claims.
        async def call_next(_request: Request) -> Response:
            raise RuntimeError("boom")

        with (
            patch("aerospike_cluster_manager_api.mcp.user_context.config.ACM_MCP_PATH", "/mcp"),
            pytest.raises(RuntimeError, match="boom"),
        ):
            request = _make_request("/mcp/", claims={"sub": "alice"})
            await middleware.dispatch(request, call_next)

        assert current_caller_claims() is None
