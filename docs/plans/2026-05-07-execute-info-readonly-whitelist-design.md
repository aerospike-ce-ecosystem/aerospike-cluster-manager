# execute_info_read_only — read-only asinfo verb whitelist

**Date**: 2026-05-07
**Branch**: `feature/mcp-execute-info-readonly-whitelist`
**Follows up**: PR #302 (MCP Phase 1) review Major M2

## Problem

PR #302 placed both `execute_info` and `execute_info_on_node` into `WRITE_TOOLS` because asinfo can issue writes (`set-config:`, `recluster:`, `truncate-namespace:`, etc.). Under `ACM_MCP_ACCESS_PROFILE=read_only` this leaves no path for safe diagnostic reads (`namespaces`, `version`, `roster:`, `racks:`, `latencies`, `statistics`). LLMs can fall back to `list_namespaces` / `get_nodes` for the most common reads, but lose every less-common diagnostic verb.

## Decision

Add a third info tool `execute_info_read_only` (mutation=False) gated by an **explicit closed allowlist** of safe verbs. The existing two mutation tools are unchanged.

| Tool | Profile | Verb scope |
|---|---|---|
| `execute_info` | FULL only | any |
| `execute_info_on_node` | FULL only | any |
| `execute_info_read_only` (NEW) | READ_ONLY + FULL | whitelist only |

## Tool surface

```python
@tool(category="info", mutation=False)
async def execute_info_read_only(
    conn_id: str,
    command: str,
    node_name: str | None = None,
) -> dict[str, str]:
    """Run a whitelisted asinfo verb. Returns {"node": str, "response": str}.

    node_name=None  -> info_all + first non-error response (node is real)
    node_name="X"   -> info_all + filter to X
    node_name=""    -> coerced to None (JSON-friendly empty-as-unset)
    """
```

## Whitelist (24 verbs)

```python
READ_ONLY_INFO_VERBS: frozenset[str] = frozenset({
    # Cluster meta (8)
    "version", "build", "build-os", "build-time",
    "node", "service", "services", "services-alumni",
    # Cluster topology / health (7)
    "nodes", "cluster-name", "cluster-stable",
    "cluster-generation", "cluster-info",
    "health-outliers", "health-stats",
    # Namespace / set / index (4)
    "namespaces", "namespace",
    "sets", "sindex",
    # Stats (3)
    "statistics", "latencies", "udf-list",
    # Strong-consistency / rack (2)
    "roster", "racks",
})
```

### Excluded with rationale

| Verb / family | Why excluded |
|---|---|
| `bins`, `bins/<ns>` | Deprecated in Aerospike 7.0 (when the bin-name limit was removed), warns since 7.1, scheduled for removal in 9.x. Use `sindex` for index introspection or `namespace/<ns>` for bin-count summary. |
| `xdr-dc`, `dc`, `dcs`, `get-dc-config` | Not available in Aerospike CE — XDR is enterprise-only. Allowlisting them would let the LLM confidently recommend verbs that error confusingly on CE clusters. |
| `dump-*` family | All verbs in this family — implemented and unrecognized — write to the server log file (or are not implemented at all in CE 8.1) and never return data over the network. Audited per-verb against `aerospike/aerospike-server:8.1.2.1`; results in [Appendix A](#appendix-a-dump--verb-audit-ce-812). Closed by #308. |
| `latency:` (legacy) | Deprecated in CE 8.1. Use `latencies`. |
| `quiesces`, `quiesce-undo` | Mutation. |
| `set-config:`, `truncate-namespace:`, `recluster:`, `set-roster:`, `create-roster:`, `sindex-create:`, `sindex-delete:` | Mutation. |
| `eviction` | Read but rarely useful, conservative cut. Add when a real use case appears. |
| `release` (8.1.1.0+), `edition` (legacy) | Could be added; deferred to a follow-up that decides whether the consolidated `release` verb supersedes `version`+`build`+`edition`. |
| `peers-clear-std`, `peers-tls-std`, `alumni-clear-std` | Modern replacements for `services` / `services-alumni`. Considered but kept the older verbs for backward-compat with existing operator playbooks; revisit when CE deprecates the older form. |

## Verb parsing

```python
_VERB_TERMINATORS = (":", "/", ";", "\n", " ", "\t")

def extract_verb(command: str) -> str:
    cmd = command.strip()
    if not cmd:
        raise InfoVerbNotAllowed("")
    head = cmd
    for sep in _VERB_TERMINATORS:
        head = head.split(sep, 1)[0]
    return head
```

- Splits on the first occurrence of any character in `_VERB_TERMINATORS`.
- Tolerates the canonical asinfo-CLI form `namespaces;` (trailing `;` is the wire-level separator when piping multiple commands).
- Tolerates embedded whitespace / tabs / newlines between the verb and its args.
- Whitespace trimmed from both ends first.
- Empty / whitespace-only → rejected.
- Case-sensitive (asinfo is case-sensitive).

## Error code

`code="invalid_argument"`, NOT `access_denied`. Reason: `access_denied` implies a policy block where the LLM should escalate; here the LLM should pick a different verb. `invalid_argument` is the correct retry signal.

Error message includes a curated 5-verb hint (`namespaces, version, nodes, statistics, latencies`) plus a pointer to `info_verbs.READ_ONLY_INFO_VERBS` for the full set.

## File map

| File | Change |
|---|---|
| `api/src/aerospike_cluster_manager_api/info_verbs.py` | NEW — `READ_ONLY_INFO_VERBS`, `_HINT_VERBS`, `InfoVerbNotAllowed`, `extract_verb`, `assert_read_only` (returns the parsed verb on success for telemetry). Top-level (matches `pk.py`/`predicate.py`) so the service layer can import without crossing the `mcp/` boundary. |
| `api/src/aerospike_cluster_manager_api/services/clusters_service.py` | Add `execute_info_read_only(conn_id, command, node_name)`. Top-level import of `info_verbs.assert_read_only`. The `node_name=None` branch now uses `info_all` + first-non-error so the returned `node` is the real cluster node (no `<random>` sentinel). |
| `api/src/aerospike_cluster_manager_api/mcp/tools/info_commands.py` | Add `execute_info_read_only` tool wrapper. Coerce empty-string `node_name` to `None`. Update `execute_info` / `execute_info_on_node` docstrings to point at the new tool. |
| `api/src/aerospike_cluster_manager_api/mcp/errors.py` | Map `InfoVerbNotAllowed` → `MCPToolError(code="invalid_argument")`. |
| `README.md` | Tool count `21` → `22`; `Info (2)` → `Info (3)`; mutation-block description no longer uses the misleading `execute_info*` glob. |
| `api/tests/test_info_verbs.py` | NEW — domain unit tests, including a literal-equality pin so silent ADDITIONS to the whitelist are caught at review time. |
| `api/tests/test_clusters_service.py` | Service-layer tests for `execute_info_read_only` (distinct per-node markers prove the filter works, not just the first-result accident). |
| `api/tests/mcp/test_info_tools.py` | MCP tool tests (allow + block paths). `test_passes_under_full_profile_too` actually asserts the whitelist invariant under FULL by attempting a write verb. |
| `api/tests/mcp/test_e2e_readonly.py` | Add positive case under READ_ONLY + invalid_argument case for unwhitelisted verbs. |
| `api/tests/mcp/test_errors.py` | Mapping unit test pinning the cause chain. |
| `api/tests/mcp/conftest.py` | `EXPECTED_TOOL_COUNT = 21` → `22`. |
| `api/tests/mcp/test_auto_discovery.py` | Add `execute_info_read_only` to the named-presence assertion (was missing — the total-count check at line 43 would catch a removed tool, but the named list was incomplete). |
| `api/tests/mcp/test_connection_tools.py` | Stale "the other 21 tools" comment → no count. |

## Out of scope (Phase 2.1+)

- `release` and `edition` verb decisions (consolidation question) — defer to a later PR.
- `eviction` and other lesser-used reads (add as use cases surface).
- Per-Aerospike-version whitelist (CE 8.1 only for now).
- Streaming `info_all` mode (current spec is single-node response per call).

## Appendix A — `dump-*` verb audit (CE 8.1)

**Image audited**: `docker.io/aerospike/aerospike-server:8.1.2.1` (single-node default config).
**Method**: per-verb `asinfo -v <verb>` round-trip, observe (a) wire response length and content, (b) server log line delta over a 0.5s settle window. Reproduced by `tests/test_info_verbs.py::TestDumpVerbCatalog`.

| Verb | Wire response | Log lines added | Category | Whitelist? |
|---|---|---:|---|:---:|
| `dump-cluster` | `ok` | 12 (CL paxos / exchange state) | log-only | ✗ |
| `dump-fabric` | `ok` | 2 (fabric node table) | log-only | ✗ |
| `dump-hb` | `ok` | 10 (heartbeat state) | log-only | ✗ |
| `dump-hlc` | `ok` | 1 (HLC state) | log-only | ✗ |
| `dump-migrates` | `ok` | 7 (migration state) | log-only | ✗ |
| `dump-rw` | `ok` | 1 (`rw_request_hash dump not yet implemented`) | log-only / partial impl | ✗ |
| `dump-skew` | `ok` | 1 (`cluster-clock-skew=0`) | log-only | ✗ |
| `dump-wb-summary` | requires `namespace=...;verbose=...` | (multi-arg, log dump) | log-only | ✗ |
| `dump-msgs` | `ERROR:4:unrecognized command` | — | not in CE 8.1 | ✗ |
| `dump-namespace` | `ERROR:4:unrecognized command` | — | not in CE 8.1 | ✗ |
| `dump-nsup` | `ERROR:4:unrecognized command` | — | not in CE 8.1 | ✗ |
| `dump-paxos` | `ERROR:4:unrecognized command` | — | not in CE 8.1 | ✗ |
| `dump-si` | `ERROR:4:unrecognized command` | — | not in CE 8.1 | ✗ |
| `dump-smd` | `ERROR:4:unrecognized command` | — | not in CE 8.1 | ✗ |
| `dump-stats` | `ERROR:4:unrecognized command` | — | not in CE 8.1 | ✗ |
| `dump-tsvc` | `ERROR:4:unrecognized command` | — | not in CE 8.1 | ✗ |
| `dump-wb` | `ERROR:4:unrecognized command` | — | not in CE 8.1 | ✗ |
| `dump-wr` | `ERROR:4:unrecognized command` | — | not in CE 8.1 | ✗ |

**Conclusion.** No `dump-*` verb returns data on the wire in CE 8.1.2.1 — every implemented verb dumps its output to the server log file and replies `ok`. Adding any to `READ_ONLY_INFO_VERBS` would let a `READ_ONLY` caller spam the server log (rotation pressure, audit-trail noise) for zero diagnostic data the LLM can read back. All `dump-*` verbs remain excluded.

The catalog above is encoded in `tests/test_info_verbs.py::DUMP_VERB_CATALOG` and asserted against `assert_read_only`. If a future Aerospike release converts a `dump-*` verb from log-only to wire-returned, the audit must be re-run and the catalog updated; if a release reintroduces a `not_in_ce_8_1` verb, the test fails until a deliberate include/exclude decision is made.
