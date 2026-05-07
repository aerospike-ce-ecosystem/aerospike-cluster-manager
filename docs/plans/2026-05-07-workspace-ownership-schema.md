# Workspace ownership schema (Phase 0b for #307)

**Date**: 2026-05-07
**Branch**: `feature/mcp-phase2-contracts`
**Used by**: #307 (workspace-aware MCP tool routing). Required reading for #303 and #305 because they share the registry decorator that consumes ownership info.

## Problem

PR #297 introduced workspaces as a connection-grouping concept and PR #298 added Keycloak OIDC. The two have not been linked: a `Workspace` row has no notion of who owns it, and the OIDC `sub` claim is not persisted alongside any workspace. As long as the MCP surface is single-tenant, this is fine — the bearer-token sentinel grants global access.

For #307 (workspace-aware tool routing) the registry decorator must answer "does the caller own the workspace this `conn_id` belongs to?" Without an ownership column the question is unanswerable. PR #302 left it explicitly out of scope.

## Decision: 1:1 `Workspace.ownerId`

Add a single non-nullable `ownerId: str` column to `Workspace`. One workspace has exactly one owner; one user owns 0..N workspaces. The shared-team / multi-member case is **not** supported in this phase — see *Out of scope*.

```python
# models/workspace.py (excerpt)

class Workspace(BaseModel):
    id: str
    name: str
    color: str
    description: str | None = None
    isDefault: bool = False
    ownerId: str        # NEW. OIDC ``sub`` claim, or the sentinel ``"system"``.
    createdAt: str
    updatedAt: str
```

Why 1:1 and not a `WorkspaceMembership` table:

* **Phase 1 single-user-per-tenant is the actual deployment shape today.** No customer asks for shared workspaces yet.
* The MCP authorization story collapses to a string compare (`workspace.ownerId == caller.sub`). No join, no caching layer.
* Future migration to many-to-many is a one-shot data migration: convert `ownerId` rows into a `(workspace_id, user_id, role='owner')` table. Rolling back is just dropping the table.

## Migration

### Schema

```sql
-- SQLite (db/_sqlite.py)
ALTER TABLE workspaces ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'system';

-- PostgreSQL (db/_postgres.py)
ALTER TABLE workspaces ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'system';
```

`DEFAULT 'system'` is the migration-time backfill — every existing row (default workspace + any user-created workspaces from before this PR) becomes owned by the synthetic `"system"` user. After migration, code stops emitting the default; new rows must specify `ownerId` explicitly.

### Default workspace

The built-in `ws-default` (`isDefault=True`) is *intentionally* owned by `"system"`. The semantic is "any authenticated user can place connections here"; ownership is irrelevant for the default. The MCP gate special-cases `ownerId == "system"` to allow access regardless of caller.

The default's row migrates from PR #297's schema (`ownerId` column simply did not exist) to `ownerId='system'` via the `DEFAULT 'system'` clause above. No data migration code required.

## Authorization rules

| Caller path | Gate result |
|---|---|
| Bearer-token sentinel (`_mcp_bearer=True`) | bypass — single-tenant deployment |
| OIDC, `workspace.ownerId == 'system'` | allow — default workspace |
| OIDC, `workspace.ownerId == caller.sub` | allow |
| OIDC, otherwise | deny: `MCPToolError(code="workspace_mismatch")` |

`caller.sub` is the OIDC `sub` claim already persisted on `request.state.user_claims` by `middleware/oidc_auth.py` (PR #298). The MCP registry decorator reads it (per Phase 0a contract) and threads it into the gate.

## Workspace creation flow changes

| API | Phase 1 behavior | Phase 2 behavior |
|---|---|---|
| `POST /api/workspaces` | persist with no owner | persist with `ownerId = caller.sub` (OIDC) or `"system"` (bearer) |
| `GET /api/workspaces` | return all | return rows where `ownerId IN (caller.sub, 'system')` |
| `GET /api/workspaces/{id}` | return any | 404 if `ownerId NOT IN (caller.sub, 'system')` to avoid leaking existence |
| `PATCH /api/workspaces/{id}` | mutate any | reject (404) if not owner; `ownerId` itself is read-only — no transfers in Phase 2 |
| `DELETE /api/workspaces/{id}` | delete any | same — owner-only |

UI consequence: the workspace selector (PR #301) lists only the caller's workspaces plus `ws-default`. The `Workspace` model already has `isDefault` so the UI continues to surface the default with no API change.

## Connection creation flow changes

`POST /api/connections` already accepts `workspaceId` (PR #297). Phase 2 adds:

* If `workspaceId` is omitted → fall back to `ws-default` (unchanged).
* If `workspaceId` is provided → assert ownership before accepting. Reuse the workspace gate above.

`GET /api/connections?workspaceId=X` enforces the same gate; passing a workspace not owned by the caller returns 404.

## MCP tool consequence (deferred to #307)

The registry decorator (per Phase 0a) calls a single helper:

```python
async def _assert_workspace_owns_conn(caller_sub: str, conn_id: str) -> None:
    profile = await db.get_connection(conn_id)
    if profile is None:
        raise ConnectionNotFoundError(conn_id)
    ws = await db.get_workspace(profile.workspaceId)
    if ws is None or (ws.ownerId != caller_sub and ws.ownerId != "system"):
        raise MCPToolError(code="workspace_mismatch", ...)
```

`mcp-bearer` callers skip the helper entirely (Phase 0a contract).

## Tests

| Suite | New cases |
|---|---|
| `tests/test_workspaces_router.py` | OIDC user A cannot read user B's workspace; default workspace visible to all; `ownerId` cannot be PATCHed |
| `tests/test_workspaces_service.py` | `list_workspaces(caller_sub)` filters; `create_workspace` populates `ownerId` from claim; `delete_workspace` rejects non-owner |
| `tests/test_connections_router.py` | `POST /api/connections` with cross-owner `workspaceId` rejected; `GET /api/connections?workspaceId=...` returns 404 for non-owner |
| `tests/db/test_migration.py` (NEW) | post-ALTER, every row has `ownerId='system'` |

## Rollout

1. **Pre-deploy**: ship migration ALTER. `ownerId='system'` everywhere — no behavior change.
2. **Deploy v(N)**: code starts populating `ownerId` from OIDC `sub` on new rows; existing rows still `'system'`.
3. **Deploy v(N+1)** (this PR's E.3): MCP registry gate flips on. Existing `'system'`-owned workspaces remain accessible to all (correct — they predate ownership).
4. **Optional cleanup**: separate manual migration converts pre-existing rows from `'system'` to a real owner once each is claimed by a user.

Reversibility: dropping the column reverts to single-tenant behavior. The `'system'` sentinel means no production data is lost.

## Out of scope

* **Multi-member workspaces** (one workspace, multiple users with different roles). Future `WorkspaceMembership` table; not in Phase 2.
* **Workspace transfer** (changing `ownerId`). Requires a separate confirmation flow + audit; defer.
* **Cross-workspace operations** (e.g. an admin tool that lists everyone's workspaces). Out of scope for the read-only / full MCP profiles.
* **OIDC group claim → workspace** (auto-create per-team workspaces from a group claim). A useful feature for Keycloak deployments but orthogonal to the ownership model — slot it in once 1:1 lands.

## Migration risk

| Risk | Mitigation |
|---|---|
| ALTER on a busy postgres locks the table | Add column is metadata-only on PG ≥ 11; safe |
| SQLite ALTER is rebuild-on-disk (slow) | Workspaces table is small (≤ low hundreds of rows); negligible |
| Existing API consumers passing `workspaceId` they don't own | Behavior change is a 404. Document in changelog. |
| OIDC `sub` claim format unstable across IdPs | Spec-correct IdPs return stable `sub`. Add a config knob `ACM_OIDC_OWNER_CLAIM` (default `"sub"`) to switch to e.g. `preferred_username` for non-compliant IdPs |

## References

* Phase 0a — `2026-05-07-mcp-context-contract.md` (this PR).
* Workspace introduction — PR #297.
* OIDC introduction — PR #298.
* Issue — #307.
