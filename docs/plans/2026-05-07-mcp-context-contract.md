# MCP Phase 2 — registry decorator Context contract

**Date**: 2026-05-07
**Branch**: `feature/mcp-phase2-contracts`
**Used by**: #303 (per-session client cache), #305 (K8s tools), #307 (workspace-aware routing)

## Problem

Phase 2 work introduces three concerns the Phase 1 registry decorator does not currently handle:

1. **Session-scoped client cache** (#303). The connect / disconnect tools must scope cached `AsyncClient`s to the calling MCP session so one caller's `disconnect("X")` cannot evict another caller's in-flight client. The session ID is per-call data only the transport (FastMCP) knows.
2. **Workspace authorization** (#307). When a tool argument names a `conn_id` (or a `workspace_id`), the registry must assert the caller owns the referenced object. The caller identity is OIDC `sub` claim on `request.state.user_claims`, populated upstream of the MCP mount.
3. **K8s tools workspace gate** (#305). K8s tools have no `conn_id` but operate on AerospikeCluster CRs which carry a workspace label. The same gate must fire for `workspace_id` params.

If individual tool wrappers each plumb their own `ctx`, three things break:

* Tool function signatures are no longer pure data (`ctx` becomes a leaky abstraction).
* The 22 Phase 1 tools each need editing, plus every future tool.
* The access-profile gate, the session lookup, and the workspace gate fan out into per-tool boilerplate that drifts.

## Decision

The registry decorator is the single chokepoint for all per-call MCP context. Tool functions stay pure (no `ctx` parameter). The wrapper extracts everything from FastMCP's `Context` parameter and applies gates before delegating.

```python
# mcp/registry.py — wrapped (Phase 2 form)

@functools.wraps(func)
async def wrapped(*args: Any, ctx: Context, **kwargs: Any) -> Any:
    # 1. Profile gate (Phase 1, unchanged) — purely deployment-level
    profile: AccessProfile = config.ACM_MCP_ACCESS_PROFILE
    if mutation and is_blocked(tool_name, profile):
        raise MCPToolError(..., code="access_denied")

    # 2. Workspace gate (Phase 2, #307). Fires only for tools whose param
    #    signature names ``conn_id`` or ``workspace_id``. Bearer-token
    #    sessions (single-tenant deployments) bypass the gate.
    if not _is_bearer_session(ctx):
        await _assert_workspace_owns_arg(ctx, tool_name, kwargs)

    # 3. Session-scoped client lookup (Phase 2, #303). The decorator does
    #    NOT call client_manager itself — it stashes session_id on a
    #    contextvar so client_manager.get_client(conn_id) reads it
    #    transparently. Tool bodies remain "client_manager.get_client(conn_id)"
    #    with no signature change.
    _SESSION_CTXVAR.set(ctx.session_id)

    # 4. Body
    with map_aerospike_errors():
        return await func(*args, **kwargs)
```

`ctx` is **always** the LAST keyword argument FastMCP injects when a tool's signature declares a `Context` parameter. Phase 2 declares it on `wrapped`, NOT on the user-facing tool body — FastMCP introspects `wrapped`'s signature, which is what `register_all` flushes into the FastMCP instance.

## What lives where

| Concern | Lives in | Why |
|---|---|---|
| Profile gate | `mcp/access_profile.is_blocked` | unchanged from Phase 1 |
| Workspace gate | `mcp/registry._assert_workspace_owns_arg` | needs the FULL kwargs dict to inspect by-param-name |
| Session lookup | `client_manager` via `_SESSION_CTXVAR` | tool bodies stay 1-arg `get_client(conn_id)` |
| Bearer bypass | `mcp/registry._is_bearer_session` | reads `ctx.user_claims.get("_mcp_bearer")` set by `mcp/auth.py` (Phase 1) |

## Workspace gate rules

The gate fires when a tool's parameter list contains EITHER `conn_id` OR `workspace_id`. It never fires for tools that take neither (e.g. `test_connection`, which probes by hostname before any persistence).

| Tool param | Resolution | Failure |
|---|---|---|
| `conn_id` | `db.get_connection(conn_id).workspaceId == caller.workspace_id` | `MCPToolError(code="workspace_mismatch")` |
| `workspace_id` | `caller.workspace_id == workspace_id` | same |

`caller.workspace_id` is computed from OIDC `sub` claim by reading `db.get_workspaces_owned_by(sub)` once per call and cached on `ctx`. For deployments where Workspace.ownerId is unset (legacy default workspace) the gate treats it as accessible — see Phase 0b for the ownership semantics.

## Bearer-token bypass

`mcp/auth.py` (Phase 1) sets `request.state.user_claims = {"sub": "mcp-bearer", "_mcp_bearer": True}` when the caller authenticates with the configured static bearer. Single-tenant deployments use this path; the workspace gate is meaningless because there is no per-user workspace concept. The decorator detects the sentinel and skips the gate. The session-scoping logic still applies — bearer mode is single-tenant, not single-session.

## Tool body invariant

Tool authors **never** add `ctx` to their function signature. They keep writing:

```python
@tool(category="connection", mutation=False)
async def connect(conn_id: str) -> dict[str, Any]:
    client = await client_manager.get_client(conn_id)   # session-scoped via ctxvar
    return {...}
```

The 22 Phase 1 tool bodies require zero edits. New tools (#305 K8s) follow the same shape.

The only place that reads `ctx` directly is the registry decorator. If a future tool genuinely needs the session ID in its body (it shouldn't), it imports `mcp.registry.current_session_id()` rather than threading `ctx` through.

## Test contract

* `tests/mcp/test_registry.py::test_wrapped_does_not_leak_ctx_into_body` — assert the user-facing tool body never sees `ctx`.
* `tests/mcp/test_workspace_isolation.py` (NEW with #307) — cross-workspace `conn_id` rejection.
* `tests/mcp/test_session_isolation.py` (NEW with #303) — two sessions, same `conn_id`, disconnect-from-A leaves-B-intact.
* `tests/mcp/test_bearer_bypass.py` (NEW with #307) — bearer sentinel bypasses workspace gate.

## Implementation order

The contract is implementation-neutral on order. Recommended:

1. #303 lands first because the contextvar plumbing is small and exercises the "decorator extracts ctx, body unchanged" claim end-to-end.
2. #305 lands next — adds K8s tools with `workspace_id` parameter; gate stays a no-op until #307.
3. #307 lands last — populates the gate body; #303 + #305 tests start exercising it.

Each PR is independently mergeable. The registry decorator grows in three commits, each behind tests.

## Out of scope

* Multi-workspace-per-user (Phase 0b chose the 1:1 ownership model).
* Per-tool capability tokens / scope claims (deferred to a hypothetical Phase 3).
* Streaming-aware Context (current FastMCP API is request/response).

## References

* Phase 0b — `2026-05-07-workspace-ownership-schema.md` (this PR).
* Phase 0c — `2026-05-07-k8s-mcp-tools-contract.md` (this PR).
* Phase 1 design — `2026-05-07-execute-info-readonly-whitelist-design.md` (merged in #309).
