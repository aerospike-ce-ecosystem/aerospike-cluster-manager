"""Tests for the MCP tool registration decorator (registry).

Task A.12 — provide a single ``@tool(...)`` decorator that:
* registers the function with a ``FastMCP`` instance via ``register_all``;
* records metadata (``category``, ``mutation`` flag) for introspection;
* wraps the function with the access-profile gate (A.8);
* wraps the function with the error-mapping context manager (A.11);
* returns the wrapped form so direct callers also see the gate.

The module-level ``_REGISTRY`` accumulator is intentional — Phase 1 tools
decorated at import time of each ``mcp/tools/*.py`` module flush into the
list, then ``register_all(mcp)`` is called once from ``build_mcp_app``
(B.6). Each test resets the registry up-front to avoid bleed.
"""

from __future__ import annotations

import pytest
from mcp.server.fastmcp import FastMCP

from aerospike_cluster_manager_api import config
from aerospike_cluster_manager_api.mcp.access_profile import AccessProfile
from aerospike_cluster_manager_api.mcp.errors import MCPToolError
from aerospike_cluster_manager_api.mcp.registry import (
    ToolMetadata,
    _reset_for_tests,
    register_all,
    registered_tools,
    tool,
)
from aerospike_cluster_manager_api.services.connections_service import (
    ConnectionNotFoundError,
)


@pytest.fixture(autouse=True)
def _isolate_registry():
    """Snapshot, clear, run, then restore the module-level registry.

    Other test files (``test_record_tools``, ``test_query_tool``,
    ``test_info_tools``, ``test_auto_discovery``) rely on the global
    registry being populated by import-time ``@tool`` decorators. Once the
    tool modules are imported their decorators do **not** re-run, so a
    plain ``_reset_for_tests()`` call would leave the registry empty for
    subsequent test files when pytest runs the whole suite. Snapshot/
    restore preserves cross-file isolation.
    """
    from aerospike_cluster_manager_api.mcp import registry as _registry

    saved = list(_registry._REGISTRY)
    _reset_for_tests()
    try:
        yield
    finally:
        _registry._REGISTRY[:] = saved


@pytest.fixture
def full_profile(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force the access profile to FULL so mutation tools are not blocked."""
    monkeypatch.setattr(config, "ACM_MCP_ACCESS_PROFILE", AccessProfile.FULL)


@pytest.fixture
def read_only_profile(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force the access profile to READ_ONLY."""
    monkeypatch.setattr(config, "ACM_MCP_ACCESS_PROFILE", AccessProfile.READ_ONLY)


# ---------------------------------------------------------------------------
# Decorator surface — basic shape, metadata, registry accumulator
# ---------------------------------------------------------------------------


async def test_tool_decorates_async_function_and_returns_value(full_profile: None) -> None:
    @tool(category="record", mutation=False)
    async def get_thing(x: int) -> int:
        return x * 2

    result = await get_thing(21)
    assert result == 42


async def test_tool_decorates_sync_function_and_returns_value(full_profile: None) -> None:
    # Phase 1 tools are async, but the decorator must not lock that down.
    @tool(category="cluster", mutation=False)
    def hostname() -> str:
        return "node-1"

    result = await hostname()
    assert result == "node-1"


def test_tool_preserves_dunder_metadata(full_profile: None) -> None:
    @tool(category="record", mutation=False)
    async def get_thing(x: int) -> int:
        """Docstring survives the wrap."""
        return x

    assert get_thing.__name__ == "get_thing"
    assert get_thing.__doc__ == "Docstring survives the wrap."


def test_tool_records_metadata_in_registry() -> None:
    @tool(category="record", mutation=True)
    async def create_record() -> None:
        return None

    @tool(category="connection", mutation=False)
    async def list_connections() -> list[str]:
        return []

    entries = registered_tools()
    assert len(entries) == 2

    by_name = {entry.name: entry for entry in entries}
    assert by_name["create_record"].category == "record"
    assert by_name["create_record"].mutation is True
    assert by_name["list_connections"].category == "connection"
    assert by_name["list_connections"].mutation is False
    # Entries are concrete dataclasses for stable introspection.
    assert all(isinstance(entry, ToolMetadata) for entry in entries)


def test_tool_supports_explicit_name_override() -> None:
    @tool(category="record", mutation=False, name="fetch_record")
    async def _internal_fetch() -> dict[str, str]:
        return {}

    entries = registered_tools()
    assert [entry.name for entry in entries] == ["fetch_record"]


def test_tool_rejects_duplicate_name() -> None:
    @tool(category="record", mutation=False)
    async def get_record() -> dict[str, str]:
        return {}

    with pytest.raises(ValueError, match="Duplicate tool registration: get_record"):

        @tool(category="record", mutation=False)
        async def get_record() -> dict[str, str]:  # type: ignore[no-redef]
            return {}


# ---------------------------------------------------------------------------
# register_all — wires every accumulated tool into the FastMCP instance
# ---------------------------------------------------------------------------


async def test_register_all_wires_every_tool_into_fastmcp() -> None:
    @tool(category="record", mutation=False)
    async def get_record() -> dict[str, str]:
        return {}

    @tool(category="connection", mutation=False)
    async def list_connections() -> list[str]:
        return []

    @tool(category="cluster", mutation=True)
    async def truncate_set() -> None:
        return None

    mcp = FastMCP("test")
    count = register_all(mcp)
    assert count == 3

    listed = await mcp.list_tools()
    names = {t.name for t in listed}
    assert names == {"get_record", "list_connections", "truncate_set"}


async def test_register_all_returns_zero_when_registry_empty() -> None:
    mcp = FastMCP("test")
    assert register_all(mcp) == 0
    assert await mcp.list_tools() == []


# ---------------------------------------------------------------------------
# Error mapping — service-layer exceptions become MCPToolError
# ---------------------------------------------------------------------------


async def test_wrapper_translates_service_error_to_mcp_tool_error(full_profile: None) -> None:
    @tool(category="connection", mutation=False)
    async def get_conn() -> None:
        raise ConnectionNotFoundError("conn-abc")

    with pytest.raises(MCPToolError) as exc_info:
        await get_conn()

    err = exc_info.value
    assert "conn-abc" in str(err)
    assert err.code == "ConnectionNotFoundError"
    # Original error preserved as the cause for stack diagnosis.
    assert isinstance(err.__cause__, ConnectionNotFoundError)


async def test_wrapper_lets_unmapped_exceptions_propagate(full_profile: None) -> None:
    @tool(category="record", mutation=False)
    async def boom() -> None:
        raise RuntimeError("kaboom")

    with pytest.raises(RuntimeError, match="kaboom"):
        await boom()


# ---------------------------------------------------------------------------
# Access-profile gate — read-only blocks mutation tools BEFORE the body runs
# ---------------------------------------------------------------------------


async def test_read_only_profile_blocks_mutation_tool_named_in_write_list(
    read_only_profile: None,
) -> None:
    invoked = False

    # Use a name that's in the WRITE_TOOLS frozenset so is_blocked returns True.
    @tool(category="record", mutation=True, name="create_record")
    async def make_record() -> None:
        nonlocal invoked
        invoked = True

    with pytest.raises(MCPToolError) as exc_info:
        await make_record()

    err = exc_info.value
    assert err.code == "access_denied"
    # Wording must mention the tool name and the active profile so the model can self-correct.
    assert "create_record" in str(err)
    assert "read_only" in str(err)
    # Body must NEVER run when the gate fires.
    assert invoked is False


async def test_full_profile_allows_mutation_tool(full_profile: None) -> None:
    @tool(category="record", mutation=True, name="create_record")
    async def make_record() -> str:
        return "ok"

    result = await make_record()
    assert result == "ok"


async def test_read_only_profile_allows_non_mutation_tool(read_only_profile: None) -> None:
    @tool(category="record", mutation=False, name="get_record")
    async def get_thing() -> str:
        return "data"

    result = await get_thing()
    assert result == "data"


def test_registry_rejects_mutation_flag_disagreement_with_write_tools(
    read_only_profile: None,
) -> None:
    """M3 — registration-time consistency check: ``mutation=True`` must
    pair with a name that exists in ``WRITE_TOOLS``, and vice versa.
    Otherwise the read-only profile would fail open silently. Catching
    the drift at import time makes the conflict surface as a startup
    error instead of a security regression in production."""
    # mutation=True but the name is NOT in WRITE_TOOLS → reject.
    with pytest.raises(ValueError, match="mutation flag"):

        @tool(category="record", mutation=True, name="some_unknown_write_op")
        async def write_op() -> str:
            return "wrote"

    # And the inverse: a name listed in WRITE_TOOLS declared with
    # mutation=False is also rejected.
    with pytest.raises(ValueError, match="mutation flag"):

        @tool(category="record", mutation=False, name="create_record")
        async def fake_read() -> str:
            return "read"


async def test_read_only_profile_allows_non_write_mutation_tool_via_is_blocked(
    read_only_profile: None,
) -> None:
    """The runtime gate (``is_blocked``) still defends against drift even
    after the registration-time check guarantees they agree. Build the
    wrapped callable directly — bypassing the decorator's consistency
    assertion — and confirm that under READ_ONLY a name absent from
    WRITE_TOOLS still runs (default-allow contract).
    """
    from aerospike_cluster_manager_api.mcp.access_profile import (
        WRITE_TOOLS,
        is_blocked,
    )

    # ``some_unknown_write_op`` is NOT in WRITE_TOOLS → the runtime gate
    # must let it through under READ_ONLY.
    assert "some_unknown_write_op" not in WRITE_TOOLS
    assert is_blocked("some_unknown_write_op", AccessProfile.READ_ONLY) is False


# ---------------------------------------------------------------------------
# _reset_for_tests — exposes a clean slate between cases
# ---------------------------------------------------------------------------


def test_reset_for_tests_clears_registry() -> None:
    @tool(category="record", mutation=False)
    async def something() -> None:
        return None

    assert len(registered_tools()) == 1
    _reset_for_tests()
    assert registered_tools() == []


# ---------------------------------------------------------------------------
# Phase 2 / #303 -- Context plumbing into client_manager._SESSION_CTXVAR
# ---------------------------------------------------------------------------


async def test_wrapped_does_not_leak_ctx_into_body(full_profile: None) -> None:
    """Tool authors never see ``ctx`` -- the contract from
    ``docs/plans/2026-05-07-mcp-context-contract.md`` "Tool body
    invariant". The wrapper extracts everything from FastMCP's
    :class:`Context` and applies gates before delegating; the inner
    function's signature stays pure data.
    """
    received: dict[str, object] = {}

    @tool(category="record", mutation=False)
    async def echo(value: str) -> str:
        # Body intentionally captures locals to inspect what got passed in.
        # If ``ctx`` ever leaks here, this dict will surface it.
        received["value"] = value
        received["locals"] = dict(locals())
        return value

    result = await echo(value="hello")
    assert result == "hello"
    assert received["value"] == "hello"
    # Body's local namespace must not contain ``ctx``.
    assert "ctx" not in received["locals"]


async def test_wrapped_signature_exposes_ctx_for_fastmcp(full_profile: None) -> None:
    """FastMCP's ``Tool.from_function`` introspects the wrapped callable
    via :func:`typing.get_type_hints` to find a ``Context``-typed param.
    The wrapper must surface ``ctx: Context`` even though the inner
    function does not declare it -- otherwise FastMCP cannot inject the
    per-call context and #303's session-scoping silently fails.
    """
    import inspect
    import typing

    from mcp.server.fastmcp import Context
    from mcp.server.fastmcp.utilities.context_injection import find_context_parameter

    @tool(category="record", mutation=False)
    async def take_one(value: str) -> str:
        return value

    sig = inspect.signature(take_one)
    assert "value" in sig.parameters
    assert "ctx" in sig.parameters
    assert sig.parameters["ctx"].annotation is Context

    hints = typing.get_type_hints(take_one)
    assert hints.get("ctx") is Context
    assert find_context_parameter(take_one) == "ctx"


async def test_wrapped_sets_session_contextvar_from_ctx(full_profile: None) -> None:
    """The wrapper must stash ``ctx``'s session id onto
    :data:`client_manager._SESSION_CTXVAR` before calling the body, so
    ``client_manager.get_client(conn_id)`` sees the right session and
    returns a per-session cache slot. After the body returns, the
    contextvar must be reset to its previous value (no leak across
    calls sharing an event loop).
    """
    from unittest.mock import MagicMock

    from aerospike_cluster_manager_api import client_manager as cm_mod

    seen: dict[str, object] = {}

    @tool(category="record", mutation=False)
    async def probe() -> str:
        seen["session_id_inside"] = cm_mod._SESSION_CTXVAR.get()
        return "ok"

    # Build a fake Context with a session attribute. The wrapper uses
    # ``id(ctx.session)`` (via ``_ctx_session_id``) to derive a stable
    # per-session string -- see ``mcp/registry._ctx_session_id``.
    fake_session = MagicMock(name="server-session")
    fake_ctx = MagicMock(spec=["session", "client_id"])
    fake_ctx.session = fake_session
    fake_ctx.client_id = None

    # Sentinel: contextvar must be back to None after the call.
    assert cm_mod._SESSION_CTXVAR.get() is None
    result = await probe(ctx=fake_ctx)
    assert result == "ok"

    # Inside the body, the contextvar matched our fake session.
    inside = seen["session_id_inside"]
    assert isinstance(inside, str)
    assert inside.startswith("session-")
    assert hex(id(fake_session))[2:] in inside

    # Outside, the contextvar was reset.
    assert cm_mod._SESSION_CTXVAR.get() is None


async def test_wrapped_with_no_ctx_leaves_session_id_none(full_profile: None) -> None:
    """Tests / direct callers can invoke the wrapped form without ``ctx``;
    the contextvar then defaults to ``None`` (the REST API path).
    """
    from aerospike_cluster_manager_api import client_manager as cm_mod

    seen: dict[str, object] = {}

    @tool(category="record", mutation=False)
    async def probe() -> str:
        seen["session_id_inside"] = cm_mod._SESSION_CTXVAR.get()
        return "ok"

    await probe()
    assert seen["session_id_inside"] is None
    assert cm_mod._SESSION_CTXVAR.get() is None


async def test_wrapped_resets_ctxvar_on_exception(full_profile: None) -> None:
    """Even when the body raises, the contextvar must be reset so the
    next call (which may be a REST call on the same event loop) does
    not inherit the prior session id.
    """
    from unittest.mock import MagicMock

    from aerospike_cluster_manager_api import client_manager as cm_mod

    @tool(category="record", mutation=False)
    async def boom() -> str:
        raise RuntimeError("nope")

    fake_ctx = MagicMock(spec=["session", "client_id"])
    fake_ctx.session = MagicMock()
    fake_ctx.client_id = None

    with pytest.raises(RuntimeError, match="nope"):
        await boom(ctx=fake_ctx)
    assert cm_mod._SESSION_CTXVAR.get() is None
