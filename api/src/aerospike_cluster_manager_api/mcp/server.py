"""ACM MCP server factory.

Builds the :class:`FastMCP` instance, imports each tools submodule (which
runs the ``@tool(...)`` decorators at import time), then flushes the
registry into the FastMCP app.
"""

from typing import Any

from mcp.server.fastmcp import FastMCP
from starlette.routing import BaseRoute, Match
from starlette.types import ASGIApp, Receive, Scope, Send

from aerospike_cluster_manager_api.mcp import tools  # noqa: F401  — import side-effects only
from aerospike_cluster_manager_api.mcp.registry import register_all


class CanonicalMCPMount(BaseRoute):
    """Single Starlette route that serves both ``/mcp`` and ``/mcp/<sub>``.

    Why this exists
    ---------------

    The default ``app.mount("/mcp", ...)`` compiles the prefix regex as
    ``^/mcp/(?P<path>.*)$`` — which does **not** match the bare ``/mcp``.
    The parent ``Router`` then falls through to its ``redirect_slashes``
    branch and 307s the client to ``/mcp/``. Many MCP clients refuse to
    follow a 307 on a POST that carries an ``Authorization`` header (curl
    drops the body/headers on cross-origin redirects, several SDKs short-
    circuit on 3xx for JSON-RPC), so the redirect breaks the wire-level
    transport for the canonical URL real users type.

    This route matches both spellings explicitly, rewrites ``scope["path"]``
    to ``/`` (the path the FastMCP streamable-HTTP transport actually
    listens on, given ``streamable_http_path="/"``), and forwards the ASGI
    call straight through. The mount prefix is appended to ``root_path`` so
    URL helpers inside the inner app keep working.

    Limitations
    -----------

    * Only HTTP scopes are matched; lifespan and websocket scopes pass to
      the next route. The streamable-HTTP transport is HTTP-only today, so
      this is correct rather than a missed feature.
    * The route exposes no path parameters — ``url_path_for`` would have
      no name to resolve, so we don't implement it.
    """

    def __init__(self, path: str, app: ASGIApp) -> None:
        if not path.startswith("/") or path == "/":
            raise ValueError(f"path must be a non-root absolute prefix, got {path!r}")
        self.path = path.rstrip("/")
        self.app = app
        self.name: str | None = None

    def matches(self, scope: Scope) -> tuple[Match, Scope]:
        if scope.get("type") != "http":
            return Match.NONE, {}
        request_path = scope.get("path", "")
        if request_path == self.path:
            sub_path = "/"
        elif request_path.startswith(self.path + "/"):
            sub_path = request_path[len(self.path) :]
        else:
            return Match.NONE, {}
        new_scope: Scope = {
            **scope,
            "path": sub_path,
            "raw_path": sub_path.encode("ascii"),
            "root_path": (scope.get("root_path", "") or "") + self.path,
        }
        return Match.FULL, new_scope

    async def handle(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self.app(scope, receive, send)


def build_mcp_app() -> FastMCP:
    """Construct the ACM MCP server with all decorated tools registered.

    ``streamable_http_path="/"`` keeps the inner Streamable-HTTP route at
    the root of the FastMCP sub-app, so when ``main.py`` installs
    :class:`CanonicalMCPMount` at ``ACM_MCP_PATH`` (``/mcp`` by default)
    both ``/mcp`` and ``/mcp/<anything>`` reach the JSON-RPC transport
    without a 307 redirect.
    """
    mcp = FastMCP("aerospike-cluster-manager", streamable_http_path="/")
    register_all(mcp)
    return mcp


def streamable_http_asgi(mcp: FastMCP) -> Any:
    """Return the streamable-HTTP ASGI app for the given FastMCP instance.

    Kept as a one-line helper rather than a direct ``mcp.streamable_http_app()``
    call from ``main.py`` so future ASGI wrappers (auth, OTel span tagging
    on the transport itself, etc.) have a single seam to slot into.
    """
    return mcp.streamable_http_app()
