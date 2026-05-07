"""MCP access profile gate.

A call-time read-only mode for the MCP surface: the registry exposes
all tools to the model, but ``is_blocked`` rejects writes at call time
when the deployment is configured ``READ_ONLY``. Keeping the gate at the
call site (rather than at registration time) means the same FastMCP
instance can serve both read-only and full deployments — only the
profile differs.

This module is intentionally dependency-free (stdlib only). ``config.py``
imports from here, so importing ``config`` back from this module would
create a cycle. Don't.

Authoritative WRITE list — do not extend without updating
``docs/plans/2026-05-07-acm-mcp-design.md`` Section 4. ``execute_info``
and ``execute_info_on_node`` are WRITE because asinfo can mutate cluster
configuration (``set-config``, ``recluster``, etc.).
"""

from __future__ import annotations

from enum import StrEnum


class AccessProfile(StrEnum):
    """Deployment-level capability gate for MCP tool calls."""

    FULL = "full"
    READ_ONLY = "read_only"


# Kept in sync with ``@tool(mutation=True)`` decorations via the
# registry-time consistency assertion in ``mcp/registry.py`` (M3). When
# you add a new mutation tool you MUST update both this set and the
# decorator on the tool function — the assertion will refuse the import
# if they disagree, which is the desired behavior (fail loudly rather
# than silently fail-open under READ_ONLY).
WRITE_TOOLS: frozenset[str] = frozenset(
    {
        "create_connection",
        "update_connection",
        "delete_connection",
        "create_record",
        "update_record",
        "delete_record",
        "delete_bin",
        "truncate_set",
        "execute_info",
        "execute_info_on_node",
        # K8s — patches AerospikeCluster CR ``spec.size``; gated under READ_ONLY.
        "scale_k8s_cluster",
    }
)


def is_blocked(tool_name: str, profile: AccessProfile) -> bool:
    """Return True iff ``tool_name`` must be rejected under ``profile``.

    Unknown tool names are not blocked (default-allow). The MCP registry
    decides which names exist; this gate only filters what's allowed to
    run within that set.
    """
    return profile is AccessProfile.READ_ONLY and tool_name in WRITE_TOOLS


def parse_profile(value: str) -> AccessProfile:
    """Parse a case-insensitive profile string. Raises ``ValueError`` on unknown."""
    try:
        return AccessProfile(value.strip().lower())
    except ValueError as e:
        valid = ", ".join(p.value for p in AccessProfile)
        raise ValueError(f"Unknown access profile {value!r}; valid values: {valid}") from e
