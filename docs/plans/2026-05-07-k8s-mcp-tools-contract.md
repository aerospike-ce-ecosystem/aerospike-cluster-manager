# K8s MCP tools contract (Phase 0c for #305)

**Date**: 2026-05-07
**Branch**: `feature/mcp-phase2-contracts`
**Used by**: #305 (5 K8s MCP tools).

## Problem

#305 adds five MCP tools that wrap the existing `services/k8s_service.py` + `k8s_client.py` surface. Without a contract, ad-hoc decisions in the implementation PR risk:

* tool names colliding with Aerospike-side tools (`list_clusters` is ambiguous — connection profile or AerospikeCluster CR?);
* the wrong access-profile classification for `scale_cluster` (it patches `spec.size`, so it's a write);
* the workspace gate (Phase 0a) misfiring on tools that have no `conn_id`;
* response shapes diverging from the existing `K8sCluster*` Pydantic models.

This ADR pins the surface so #305 implementation is mechanical.

## Tool surface

All 5 tools live in `mcp/tools/k8s.py` (NEW). Names use the `k8s_` prefix to disambiguate from Aerospike-side tools (`list_namespaces` is Aerospike namespaces; `list_k8s_clusters` is K8s AerospikeCluster CRs).

| Tool | Signature | Mutation | Returns |
|---|---|:---:|---|
| `list_k8s_clusters` | `(workspace_id: str \| None = None)` | ✗ | `list[K8sClusterSummary]` |
| `get_k8s_pods` | `(cluster_id: str, workspace_id: str \| None = None)` | ✗ | `list[K8sPodStatus]` |
| `get_k8s_events` | `(cluster_id: str, workspace_id: str \| None = None, since_minutes: int = 30)` | ✗ | `list[K8sClusterEvent]` |
| `scale_k8s_cluster` | `(cluster_id: str, size: int, workspace_id: str \| None = None)` | **✓** | `{"clusterId": str, "previousSize": int, "newSize": int}` |
| `get_k8s_logs` | `(cluster_id: str, pod_name: str, workspace_id: str \| None = None, since_seconds: int = 300, tail_lines: int = 200)` | ✗ | `{"podName": str, "lines": list[str], "truncated": bool}` |

`cluster_id` is the AerospikeCluster CR's `<namespace>/<name>` (the existing convention used by `K8sClusterSummary.id`).

### Param decisions

* **`workspace_id` is optional in every tool.** Defaults to `ws-default`. The Phase 0a workspace gate fires if and only if it is supplied; bearer-token sessions skip the gate. With `None`, the tool resolves CRs across all namespaces the caller can see (per K8s RBAC), filtered to those whose `metadata.labels["acm.aerospike.com/workspace"]` matches `ws-default` or matches one of the caller's owned workspaces.
* **No `conn_id`.** K8s tools do not touch Aerospike. The Phase 0a registry gate special-cases `workspace_id` so the workspace check still runs.
* **`since_minutes` / `since_seconds` / `tail_lines` are bounded** (`since_minutes ≤ 1440`, `since_seconds ≤ 3600`, `tail_lines ≤ 1000`) at the tool wrapper. Out-of-range values raise `MCPToolError(code="invalid_argument")`.

### Response shapes

The tool returns the existing Pydantic models serialized via `mcp/serializers.py`. No new model types — the schema you see in the OpenAPI doc for `GET /api/k8s/clusters` is what the LLM gets.

For `scale_k8s_cluster` we return a small dict instead of the full `K8sClusterDetail` because the tool's purpose is "did the patch succeed and what is the new size" — not a 50-field cluster snapshot the LLM would have to re-prompt for.

## Access profile

```python
# mcp/access_profile.py — append

WRITE_TOOLS: frozenset[str] = frozenset(
    {
        # ... existing 10 tools
        "scale_k8s_cluster",   # K8s — patches spec.size
    }
)
```

The other four K8s tools are reads. `READ_ONLY` profile blocks `scale_k8s_cluster` only. No new profile category — these are deployment-level capabilities, same gate as the Aerospike side.

## Categorization

`@tool(category="k8s", mutation=...)`. The `"k8s"` category is new (Phase 1 had `"connection"`, `"cluster"`, `"record"`, `"query"`, `"info"`). Used for introspection / docs grouping; no behavior change.

## Workspace gate interaction (per Phase 0a)

The registry decorator's workspace check fires for any tool whose param signature contains `conn_id` or `workspace_id`. K8s tools take the latter, so:

* Bearer-token sessions skip the gate entirely.
* OIDC sessions: caller must own the supplied `workspace_id`, OR the workspace must be `ws-default` (`ownerId='system'`).
* `workspace_id=None` (default) lets the tool see the default workspace + everything the caller owns.

The K8s tool body itself does NOT re-check ownership — the registry gate is authoritative.

## CR labeling for workspace association

Existing convention from PR #297 already labels AerospikeCluster CRs with `acm.aerospike.com/workspace=<workspace_id>` on creation. This ADR does **not** change the labeling — `list_k8s_clusters(workspace_id="X")` filters by label selector (`metadata.labels.acm.aerospike.com/workspace=X`), which is exactly what `services/k8s_service.py` already does for the REST API.

If a CR predates the labeling (PR #297 + earlier), it is missing the label and visible only when `workspace_id=None`. Existing behavior preserved.

## Tool body shape

Every tool follows this template:

```python
@tool(category="k8s", mutation=False)
async def get_k8s_pods(
    cluster_id: str,
    workspace_id: str | None = None,
) -> list[dict[str, Any]]:
    """Return pod status for an AerospikeCluster CR.

    cluster_id is "<namespace>/<name>" as returned by list_k8s_clusters.
    workspace_id None falls back to ws-default; cross-workspace access is
    rejected with code=workspace_mismatch by the registry gate.
    """
    namespace, name = _parse_cluster_id(cluster_id)
    pods = await k8s_service.list_cluster_pods(namespace, name)
    return [serializers.k8s_pod(p) for p in pods]
```

* No direct `client_manager` calls (K8s client is global, no per-connection state).
* No try/except around `K8sApiError` — `mcp/errors.map_aerospike_errors` is extended to handle `K8sApiError` → `MCPToolError(code="k8s_api_error", status=...)`.
* No re-implementation of business logic — every tool is a thin wrapper over `services/k8s_service` (which already exists for the REST routers).

## Errors

`mcp/errors.py` extends `map_aerospike_errors` (the name stays generic; the function maps every domain exception, not just Aerospike's) to translate:

| Source exception | MCP error code |
|---|---|
| `K8sApiError(status=404)` | `not_found` |
| `K8sApiError(status=403)` | `access_denied` (rare — caller's K8s RBAC, not workspace gate) |
| `K8sApiError(status=409)` | `conflict` |
| `K8sApiError(status=4xx)` | `invalid_argument` |
| `K8sApiError(status=5xx)` | `internal_error` (re-raised, OTel records) |
| `K8S_MANAGEMENT_ENABLED=false` and any K8s tool called | `unavailable` with hint to enable the feature flag |

The last row is the new contract: when K8s management is disabled at config time the registry must NOT raise `ImportError` or hand a half-initialized client to the tool body. It returns `MCPToolError(code="unavailable")` immediately.

## Tool count

```
EXPECTED_TOOL_COUNT: int = 22  # Phase 1 + execute_info_read_only
                  → 27          # + 5 K8s tools
```

`tests/mcp/conftest.py` and the README breakdown both update.

## File map

| File | Change |
|---|---|
| `api/src/aerospike_cluster_manager_api/mcp/tools/k8s.py` | NEW — 5 tool wrappers |
| `api/src/aerospike_cluster_manager_api/mcp/tools/__init__.py` | import the new module so registration fires |
| `api/src/aerospike_cluster_manager_api/mcp/access_profile.py` | add `scale_k8s_cluster` to `WRITE_TOOLS` |
| `api/src/aerospike_cluster_manager_api/mcp/errors.py` | map `K8sApiError` per the table above; `unavailable` mapping for disabled flag |
| `api/src/aerospike_cluster_manager_api/mcp/serializers.py` | `k8s_cluster_summary`, `k8s_pod`, `k8s_event` helpers |
| `api/tests/mcp/conftest.py` | `EXPECTED_TOOL_COUNT 22 → 27` |
| `api/tests/mcp/test_k8s_tools.py` | NEW — happy path + each error mapping |
| `api/tests/mcp/test_e2e_readonly.py` | extend — `scale_k8s_cluster` blocked under READ_ONLY |
| `api/tests/mcp/test_auto_discovery.py` | add 5 tool names to the named-presence assertion |
| `README.md` | tool count `22 → 27`, add "K8s (5)" line |

## Test contract

* **Happy path per tool** with `K8sClient` fully mocked (no live cluster required).
* **`K8S_MANAGEMENT_ENABLED=false`** path: every K8s tool returns `unavailable`. No K8s client is initialized.
* **`scale_k8s_cluster` under READ_ONLY** returns `access_denied` before the K8s client is touched.
* **Workspace gate** is exercised by the Phase 0a / #307 test suite; this PR only asserts the workspace param is accepted and forwarded.

## Out of scope

* **Cluster create / delete via MCP.** Creating an AerospikeCluster CR is a high-blast-radius action that needs the full `CreateK8sClusterRequest` body. The REST API already covers it; the MCP surface intentionally stays diagnostic-and-scale only.
* **Streaming logs.** `get_k8s_logs` returns a bounded snapshot. A future tool can stream via the streamable-HTTP transport.
* **Watching events.** Same — snapshot only; the stream API is a Phase 3 candidate.
* **Custom label selectors.** Workspace label is the only filter. Generic selector support would let an LLM read pods it shouldn't.

## References

* Phase 0a — `2026-05-07-mcp-context-contract.md` (this PR).
* Phase 0b — `2026-05-07-workspace-ownership-schema.md` (this PR).
* Issue — #305.
* K8s service surface — `services/k8s_service.py`, `k8s_client.py`.
* AerospikeCluster CR labeling — PR #297.
