"""MCP tool registration decorator (registry).

Phase 1 tools (B.1+) decorate themselves with :func:`tool` at import time.
Each decoration:

* records :class:`ToolMetadata` (name, category, mutation, callable) in
  the module-level ``_REGISTRY`` accumulator;
* wraps the function with the access-profile gate (A.8) -- mutation tools
  named in ``access_profile.WRITE_TOOLS`` raise
  :class:`MCPToolError` with ``code="access_denied"`` under the
  ``READ_ONLY`` profile, **before** the body runs;
* wraps the function with :func:`map_aerospike_errors` (A.11) so known
  service-layer errors surface as :class:`MCPToolError` with stable codes
  while everything else propagates so the registry / OTel pipeline can
  log the real bug.

Phase 2 (#303) -- Context plumbing
----------------------------------

The wrapper now declares an injected ``ctx: Context`` parameter so
FastMCP supplies the per-call :class:`mcp.server.fastmcp.Context`. The
wrapper then stashes the session id on
:data:`client_manager._SESSION_CTXVAR` so
``client_manager.get_client(conn_id)`` reads it transparently and
returns a session-scoped cached client. The user-facing tool body is
**unchanged** -- tool functions never see ``ctx``. See
``docs/plans/2026-05-07-mcp-context-contract.md`` for the design.

Workspace gate (#307) is a no-op stub here -- populated by Stream E.

The decorator returns the *wrapped* form so tests and other callers that
bypass FastMCP still see the gate. ``register_all(mcp)`` is invoked once
from :func:`build_mcp_app` (B.6) to flush the accumulator into a single
:class:`FastMCP` instance via :meth:`FastMCP.add_tool`.

Read the module docstring of :mod:`access_profile` for why blocking is
done at the call site rather than at registration time.
"""

from __future__ import annotations

import inspect
import typing
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from mcp.server.fastmcp import Context, FastMCP

from aerospike_cluster_manager_api import client_manager as _client_manager_mod
from aerospike_cluster_manager_api import config
from aerospike_cluster_manager_api.mcp.access_profile import WRITE_TOOLS, AccessProfile, is_blocked
from aerospike_cluster_manager_api.mcp.errors import MCPToolError, map_aerospike_errors


@dataclass(frozen=True)
class ToolMetadata:
    """Snapshot of a registered tool -- exposed for autodiscovery / docs.

    ``func`` is the *wrapped* callable (with access-profile + error-mapping
    already applied). Direct callers see the same gate as FastMCP would.
    """

    name: str
    category: str
    mutation: bool
    func: Callable[..., Any]


_REGISTRY: list[ToolMetadata] = []

# Tracks FastMCP instances that ``register_all`` has already populated,
# keyed by ``id(mcp)``. If ``build_mcp_app()`` is invoked twice in the
# same process (e.g. test fixtures, hot reload), re-running
# ``mcp.add_tool(...)`` would raise FastMCP's "duplicate tool name"
# error. Skipping the second call is idempotent and cheap.
_REGISTERED_MCP_IDS: set[int] = set()


def _ctx_session_id(ctx: Context | None) -> str | None:
    """Best-effort extraction of a stable session identifier from ``ctx``.

    FastMCP's :class:`Context` does not expose a dedicated ``session_id``
    attribute (the wire-level ``mcp-session-id`` lives on the
    StreamableHTTP transport, not on Context). We use the
    :class:`ServerSession` object identity as the proxy -- it is unique
    per MCP session for the lifetime of that session, which is exactly
    what the per-session cache needs to key on. Falls back to
    ``ctx.client_id`` (when populated) and finally to ``None`` (the
    REST-equivalent slot) if neither is available.
    """
    if ctx is None:
        return None
    # ``ctx.session`` raises if the request context is not bound (e.g. a
    # bare Context constructed in a unit test). Treat that as "no session".
    try:
        session = ctx.session
    except Exception:  # pragma: no cover -- defensive
        session = None
    if session is not None:
        return f"session-{id(session):x}"
    # ``ctx.client_id`` is a property that raises when ``request_context``
    # is unbound (FastMCP's in-process call_tool path constructs a Context
    # without a request when the test fixture doesn't drive the transport).
    # Treat the unbound case as "no session" -- the REST equivalent slot.
    try:
        client_id = ctx.client_id
    except (AttributeError, ValueError):
        client_id = None
    if client_id:  # pragma: no cover -- exercised only when client populates _meta
        return f"client-{client_id}"
    return None


async def _assert_workspace_owns_arg(
    ctx: Context | None,
    tool_name: str,
    kwargs: dict[str, Any],
) -> None:
    """Workspace authorization gate (Phase 2, #307).

    No-op stub -- Stream E (#307) populates the body. Kept here so the
    contract from ``docs/plans/2026-05-07-mcp-context-contract.md`` lands
    in one place and Streams B / A can reference the same call site.

    TODO(#307): inspect ``kwargs`` for ``conn_id`` / ``workspace_id``
    parameters and assert ``ctx.user_claims['sub']`` owns the referenced
    workspace; raise ``MCPToolError(code="workspace_mismatch")`` on
    mismatch. Bearer-token sessions bypass this gate.
    """
    return None


def _build_wrapped_signature(func: Callable[..., Any]) -> inspect.Signature:
    """Return a signature that mirrors ``func`` but appends a ``ctx`` kwarg.

    FastMCP's ``Tool.from_function`` calls
    :func:`mcp.server.fastmcp.utilities.context_injection.find_context_parameter`
    via :func:`typing.get_type_hints` on the registered callable. Because
    ``functools.wraps`` makes ``get_type_hints(wrapped)`` return the
    *inner* function's hints (it walks ``__wrapped__``), we can't rely on
    a plain ``ctx: Context`` annotation on the closure to be visible to
    FastMCP. Instead we drop ``functools.wraps`` and overwrite
    ``__signature__`` / ``__annotations__`` / ``__name__`` / ``__doc__``
    manually so:

    * FastMCP's introspection sees ``ctx: Context`` and excludes it from
      the JSON schema (its ``find_context_parameter`` walks the
      annotations dict, not ``__wrapped__``).
    * Tests calling the wrapped form directly (``await tool_fn(...)``)
      still see the original parameter names for binding.
    * ``inspect.signature(wrapped)`` shows the real surface -- useful for
      autodiscovery / docs.

    We chose this manual route over ``functools.wraps`` because the
    FastMCP version pinned in this project resolves type hints by
    walking ``__wrapped__``, which would hide our ``ctx`` annotation and
    cause FastMCP to fall back to passing ``ctx`` through the JSON
    schema (leaking the implementation detail to the model). Synthesising
    the signature is the smaller of two evils. See
    ``docs/plans/2026-05-07-mcp-context-contract.md`` "What lives where"
    for the rationale.
    """
    # ``eval_str=True`` resolves string annotations (the ones produced by
    # ``from __future__ import annotations`` in the tool modules) relative
    # to ``func``'s own module globals. Without this, the cached
    # ``__signature__`` we attach to ``wrapped`` would carry raw strings
    # like ``"Literal['equals', ...]"`` -- pydantic's
    # ``model_json_schema`` then re-evaluates them in ``wrapped``'s module
    # (registry), where ``Literal`` is not in scope, and blows up with
    # ``PydanticUserError: ... is not fully defined``. Resolving up-front
    # avoids that mismatch.
    func_sig = inspect.signature(func, eval_str=True)
    ctx_param = inspect.Parameter(
        "ctx",
        inspect.Parameter.KEYWORD_ONLY,
        annotation=Context,
        default=None,
    )
    return func_sig.replace(parameters=[*func_sig.parameters.values(), ctx_param])


def tool(
    *,
    category: str,
    mutation: bool = False,
    name: str | None = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Register a function as an MCP tool.

    Parameters
    ----------
    category:
        Free-form grouping label (e.g. ``"record"``, ``"connection"``,
        ``"cluster"``) used by introspection and docs generation.
    mutation:
        ``True`` for tools that mutate state. Combined with the
        :data:`access_profile.WRITE_TOOLS` list to decide whether the
        ``READ_ONLY`` profile must reject the call. Tools whose names are
        not in ``WRITE_TOOLS`` run under ``READ_ONLY`` regardless of this
        flag (default-allow); the flag is purely for introspection.
    name:
        Optional override; defaults to ``func.__name__``. Must be unique
        across the registry -- duplicates raise :class:`ValueError`.
    """

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        tool_name = name or func.__name__
        if any(entry.name == tool_name for entry in _REGISTRY):
            raise ValueError(f"Duplicate tool registration: {tool_name}")

        # M3 -- registry-time consistency check. WRITE_TOOLS is the
        # authoritative list consulted by the call-time access profile
        # gate; the @tool(mutation=...) flag is purely declarative. If
        # the two ever drift (someone adds a mutation tool but forgets
        # to add it to WRITE_TOOLS, or vice versa), the read_only
        # profile silently fails open. Catching the drift at import
        # time forces the conflict to surface as a startup error rather
        # than a security regression discovered in production. The
        # call-site is_blocked() check below stays as defense-in-depth.
        expected_mutation = tool_name in WRITE_TOOLS
        if mutation != expected_mutation:
            raise ValueError(
                f"Tool {tool_name!r} mutation flag ({mutation}) disagrees with "
                f"WRITE_TOOLS membership ({expected_mutation}). "
                "Update mcp/access_profile.WRITE_TOOLS or the @tool(mutation=...) "
                "flag so they agree."
            )

        is_async = inspect.iscoroutinefunction(func)

        async def wrapped(*args: Any, ctx: Context | None = None, **kwargs: Any) -> Any:
            # 1. Profile gate (Phase 1, unchanged) -- purely deployment-level.
            #    Run BEFORE setting the session contextvar so a rejected
            #    call doesn't pollute caches with half-initialised state.
            profile: AccessProfile = config.ACM_MCP_ACCESS_PROFILE
            if mutation and is_blocked(tool_name, profile):
                raise MCPToolError(
                    f"Tool '{tool_name}' is disabled by access profile '{profile.value}'.",
                    code="access_denied",
                )

            # 2. Workspace gate (Phase 2, #307) -- stub today; Stream E lands the body.
            await _assert_workspace_owns_arg(ctx, tool_name, kwargs)

            # 3. Session-scoped client lookup (Phase 2, #303). Set the
            #    contextvar so client_manager.get_client(conn_id) keys the
            #    cache by (session_id, conn_id) transparently. Reset on
            #    the way out so the contextvar never leaks across calls
            #    that share an event loop.
            session_id = _ctx_session_id(ctx)
            token = _client_manager_mod._SESSION_CTXVAR.set(session_id)
            try:
                with map_aerospike_errors():
                    if is_async:
                        return await func(*args, **kwargs)
                    return func(*args, **kwargs)
            finally:
                _client_manager_mod._SESSION_CTXVAR.reset(token)

        # Mirror ``func``'s name / docstring for introspection / docs but
        # synthesise a signature that includes the injected ``ctx`` param
        # so FastMCP's ``find_context_parameter`` recognises it. See
        # ``_build_wrapped_signature`` for why we cannot use functools.wraps.
        wrapped.__name__ = func.__name__
        wrapped.__qualname__ = func.__qualname__
        wrapped.__doc__ = func.__doc__
        wrapped.__module__ = func.__module__
        wrapped.__signature__ = _build_wrapped_signature(func)  # type: ignore[attr-defined]
        # Resolve func's annotations against its own module globals so the
        # copied dict carries real types (Literal[...], list[str], etc.)
        # rather than raw forward-reference strings produced by
        # ``from __future__ import annotations``. ``include_extras=True``
        # preserves Annotated[...] metadata that some tool args use for
        # FastMCP / pydantic field config. See the matching comment in
        # ``_build_wrapped_signature`` for why this matters.
        try:
            resolved = typing.get_type_hints(func, include_extras=True)
        except Exception:  # pragma: no cover -- defensive
            resolved = dict(getattr(func, "__annotations__", {}))
        wrapped.__annotations__ = {**resolved, "ctx": Context}

        _REGISTRY.append(ToolMetadata(name=tool_name, category=category, mutation=mutation, func=wrapped))
        return wrapped

    return decorator


def register_all(mcp: FastMCP) -> int:
    """Wire every accumulated tool into ``mcp`` and return the count.

    Called once by :func:`build_mcp_app` (B.6). Invoking it on an empty
    registry returns ``0`` and leaves ``mcp`` untouched. If the same
    ``mcp`` instance is passed twice (re-entry guard), the second call
    is a no-op so we don't trip FastMCP's duplicate-name error.
    """
    if id(mcp) in _REGISTERED_MCP_IDS:
        return len(_REGISTRY)
    for entry in _REGISTRY:
        mcp.add_tool(entry.func, name=entry.name)
    _REGISTERED_MCP_IDS.add(id(mcp))
    return len(_REGISTRY)


def registered_tools() -> list[ToolMetadata]:
    """Return a snapshot copy of the current registry.

    Useful for introspection (docs, ``__repr__``, telemetry); callers
    should not mutate the result -- modifying the returned list does not
    affect the registry.
    """
    return list(_REGISTRY)


def current_session_id() -> str | None:
    """Return the session id stashed by the active wrapper, if any.

    Tool bodies should NOT depend on this -- it exists for the rare case
    a future tool genuinely needs the session id (e.g. structured
    logging) without threading ``ctx`` through its public signature.
    """
    return _client_manager_mod._SESSION_CTXVAR.get()


def _reset_for_tests() -> None:
    """Test helper: clear the module-level registry. **Not for production.**

    Phase 1 tool modules decorate at import time, so tests reset between
    cases to avoid cross-test bleed. Production code calls
    :func:`register_all` exactly once from :func:`build_mcp_app`.
    """
    _REGISTRY.clear()
    _REGISTERED_MCP_IDS.clear()
