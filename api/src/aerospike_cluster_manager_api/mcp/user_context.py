"""OIDC claim → MCP tool registry bridge (Phase 2 #307 / E.2).

The MCP registry decorator runs inside FastMCP's session-manager task,
which is reached *after* Starlette's request middleware has populated
``request.state.user_claims``. By that point the original ``Request``
object is no longer in scope (the FastMCP body executes inside a
JSON-RPC dispatch with only ``Context`` available). This module bridges
the gap by stashing the caller's claims on a :class:`contextvars.ContextVar`
that the registry's workspace gate reads through
:func:`current_caller_claims`.

Why a contextvar
----------------

Per the Phase 0a contract (``docs/plans/2026-05-07-mcp-context-contract.md``)
tool functions stay pure — they do NOT receive the caller identity as
a parameter. The registry decorator is the only place that resolves it.
A contextvar is the natural "ambient request data" mechanism in async
Python: each ASGI request runs in its own task, contextvars are
task-scoped, and the value set by a middleware is visible to anything
downstream in the same task (including the FastMCP mount handler and
the tool body it eventually calls).

Why a dedicated middleware
--------------------------

The existing :class:`MCPBearerTokenMiddleware` short-circuits on bearer
auth and otherwise delegates to OIDC; making it also do the contextvar
plumbing would couple two unrelated concerns. The
:class:`MCPUserContextMiddleware` here is purely a passthrough that
captures ``request.state.user_claims`` *after* both auth gates have
run. Installing it INNER to OIDC at runtime (i.e. ``add_middleware``
before OIDC) means OIDC has already populated ``user_claims`` by the
time we read them.

The middleware only fires for MCP-mounted paths so the contextvar is
not set (and not reset) on every REST call.
"""

from __future__ import annotations

import contextvars
import logging
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from aerospike_cluster_manager_api import config

logger = logging.getLogger(__name__)


_CLAIMS_CTXVAR: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "acm_mcp_caller_claims",
    default=None,
)
"""Per-request OIDC / bearer-sentinel claims for MCP callers.

Set by :class:`MCPUserContextMiddleware` on every ``/mcp/*`` request and
reset on the way out. Reads outside an MCP request return ``None`` —
the registry workspace gate treats that as "no caller identity, single
tenant fallback" so REST-only call paths and unit-test fixtures keep
the legacy permissive behavior.
"""


def current_caller_claims() -> dict[str, Any] | None:
    """Return the OIDC claims (or bearer sentinel) attached to this request.

    Returns ``None`` when no MCP middleware ran (e.g. REST endpoint, or
    a unit test that drove a tool function without going through the
    HTTP layer). Callers must treat ``None`` as "fall back to single-
    tenant behavior" to preserve Phase 1 semantics.
    """
    return _CLAIMS_CTXVAR.get()


class MCPUserContextMiddleware(BaseHTTPMiddleware):
    """Capture ``request.state.user_claims`` into a contextvar for ``/mcp/*``.

    Runs INNER to OIDC at request time (i.e. ``add_middleware`` is
    called BEFORE the OIDC middleware in :mod:`main`). By the time
    ``dispatch`` runs, OIDC and the MCP bearer-token middleware have
    already either populated ``request.state.user_claims`` or rejected
    the request.

    Claims are reset to ``None`` in the ``finally`` so the contextvar
    cannot leak across requests that share a worker thread.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        path = request.url.path
        base = config.ACM_MCP_PATH
        # Match on segment boundaries — same rule
        # ``MCPBearerTokenMiddleware`` uses, so this middleware's path
        # filter cannot be tricked by a sibling route like ``/mcp-evil``.
        if path != base and not path.startswith(base.rstrip("/") + "/"):
            return await call_next(request)

        claims: dict[str, Any] | None = getattr(request.state, "user_claims", None)
        token = _CLAIMS_CTXVAR.set(claims)
        try:
            return await call_next(request)
        finally:
            _CLAIMS_CTXVAR.reset(token)
