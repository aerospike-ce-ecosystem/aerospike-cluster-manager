"""MCP tools for Kubernetes-managed AerospikeCluster CRs (Phase 2 -- #305).

Five tools that wrap :mod:`aerospike_cluster_manager_api.k8s_client` and the
helpers in :mod:`aerospike_cluster_manager_api.services.k8s_service`:

* ``list_k8s_clusters`` -- enumerate AerospikeCluster CRs (read)
* ``get_k8s_pods`` -- pod status for a cluster (read)
* ``get_k8s_events`` -- recent K8s events for a cluster, bounded by
  ``since_minutes`` (read)
* ``scale_k8s_cluster`` -- patch ``spec.size`` (mutation; gated under
  ``READ_ONLY``)
* ``get_k8s_logs`` -- bounded log snapshot for a pod (read)

Design notes (per ADR ``docs/plans/2026-05-07-k8s-mcp-tools-contract.md``):

* ``cluster_id`` is ``"<namespace>/<name>"`` -- same convention used by the
  ``K8sClusterSummary.id`` field and the REST router.
* All five tools accept an optional ``workspace_id`` so the Phase 0a
  registry workspace gate (which fires on ``conn_id`` *or* ``workspace_id``
  parameter names) wires up uniformly. The tool body itself does not
  re-check ownership -- the registry decorator is authoritative.
* When ``K8S_MANAGEMENT_ENABLED=false`` every tool raises
  ``MCPToolError(code="unavailable")`` immediately; no K8s client is
  initialised. The flag is checked at call time (not import time) so the
  same module loads cleanly in K8s-disabled deployments.
* ``since_minutes``, ``since_seconds`` and ``tail_lines`` have hard upper
  bounds (1440 / 3600 / 1000 respectively); out-of-range values raise
  ``MCPToolError(code="invalid_argument")``.
* ``K8sApiError`` propagates via the registry decorator's
  :func:`map_aerospike_errors` context manager, which translates 404 ->
  ``not_found``, 403 -> ``access_denied``, 409 -> ``conflict``, other 4xx ->
  ``invalid_argument``, 5xx -> ``internal_error``.
* No cluster create / delete tools -- those high-blast-radius actions stay
  in the REST surface (see ADR "Out of scope").
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from aerospike_cluster_manager_api import config, db
from aerospike_cluster_manager_api.k8s_client import K8sApiError, k8s_client
from aerospike_cluster_manager_api.mcp import serializers
from aerospike_cluster_manager_api.mcp.errors import MCPToolError
from aerospike_cluster_manager_api.mcp.registry import tool
from aerospike_cluster_manager_api.mcp.user_context import current_caller_claims
from aerospike_cluster_manager_api.models.k8s_cluster import (
    K8sClusterEvent,
    K8sClusterSummary,
    K8sPodStatus,
)
from aerospike_cluster_manager_api.models.workspace import SYSTEM_OWNER_ID
from aerospike_cluster_manager_api.services import k8s_service

logger = logging.getLogger(__name__)


_WORKSPACE_LABEL = "acm.aerospike.com/workspace"


# ---------------------------------------------------------------------------
# Bounds (per ADR section "Param decisions")
# ---------------------------------------------------------------------------

_MAX_SINCE_MINUTES = 1440  # 24h ceiling for event windows
_MAX_SINCE_SECONDS = 3600  # 1h ceiling for log windows
_MAX_TAIL_LINES = 1000  # cap on log lines returned per call


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _assert_k8s_enabled() -> None:
    """Reject the call early when K8s management is disabled at config time.

    Called at the top of every K8s tool body. Without this check, the
    underlying ``k8s_client`` would attempt to load in-cluster config /
    kubeconfig and surface a confusing ``RuntimeError`` to the LLM instead
    of a stable ``unavailable`` code. The flag is read live (not snapshotted
    at import) so test fixtures can flip it via ``monkeypatch``.
    """
    if not config.K8S_MANAGEMENT_ENABLED:
        raise MCPToolError(
            "Kubernetes management is not enabled on this deployment; "
            "set K8S_MANAGEMENT_ENABLED=true to expose the K8s tools.",
            code="unavailable",
        )


def _parse_cluster_id(cluster_id: str) -> tuple[str, str]:
    """Split ``"<namespace>/<name>"`` into ``(namespace, name)``.

    Raises ``MCPToolError(code="invalid_argument")`` on malformed input --
    the message includes the expected format so the LLM can recover.
    """
    if not isinstance(cluster_id, str) or "/" not in cluster_id:
        raise MCPToolError(
            f"cluster_id must be '<namespace>/<name>', got {cluster_id!r}",
            code="invalid_argument",
        )
    namespace, _, name = cluster_id.partition("/")
    if not namespace or not name or "/" in name:
        raise MCPToolError(
            f"cluster_id must be '<namespace>/<name>', got {cluster_id!r}",
            code="invalid_argument",
        )
    return namespace, name


def _check_bound(value: int, *, max_value: int, name: str) -> None:
    """Validate that ``value`` is within ``[1, max_value]``."""
    if value < 1 or value > max_value:
        raise MCPToolError(
            f"{name} must be between 1 and {max_value}, got {value}",
            code="invalid_argument",
        )


def _workspace_label_selector(workspace_id: str | None) -> str | None:
    """Build a label selector that filters CRs by workspace label.

    ``workspace_id=None`` returns ``None`` so the underlying call lists
    every CR the caller can see. Existing CRs without the label are
    invisible to a workspace-scoped lookup -- matching the REST API
    behaviour established by PR #297.
    """
    if workspace_id is None:
        return None
    return f"{_WORKSPACE_LABEL}={workspace_id}"


def _resolve_caller_owner_id() -> str:
    """Translate MCP caller claims into the service-layer owner id.

    Mirrors :func:`mcp.tools.connections._resolve_mcp_caller_owner_id`
    and :func:`dependencies._resolve_caller_owner_id` so the same ACL
    rule applies regardless of transport. Anonymous and bearer-token
    sessions degrade to :data:`SYSTEM_OWNER_ID` -- single-tenant
    deployments keep the legacy permissive behaviour.
    """
    claims = current_caller_claims()
    if claims is None:
        return SYSTEM_OWNER_ID
    if claims.get("_mcp_bearer"):
        return SYSTEM_OWNER_ID
    raw = claims.get(config.ACM_OIDC_OWNER_CLAIM)
    if not isinstance(raw, str) or not raw:
        return SYSTEM_OWNER_ID
    return raw


def _cr_workspace_id(item: dict[str, Any]) -> str | None:
    """Return the workspace id stamped on a CR, if any."""
    labels = item.get("metadata", {}).get("labels") or {}
    raw = labels.get(_WORKSPACE_LABEL)
    return raw if isinstance(raw, str) and raw else None


async def _assert_caller_owns_cluster(namespace: str, name: str) -> None:
    """Enforce the workspace ACL on a single cluster identified by namespace/name.

    Reads the CR's ``acm.aerospike.com/workspace`` label and confirms it
    is visible to the caller (same rule as the REST K8s router). CRs
    without the label are treated as system-shared. A missing cluster or
    invisible workspace surfaces as ``code="not_found"`` so the wire
    shape matches a non-existent CR -- prevents id enumeration via the
    MCP surface.

    When the workspace metaDB has not been initialised (unit-test paths
    that exercise the K8s tools in isolation) the visibility check
    short-circuits to "permissive" -- matches the legacy single-tenant
    behaviour used by the notes layer.
    """
    try:
        cr = await k8s_client.get_cluster(namespace, name)
    except K8sApiError as e:
        if e.status == 404:
            raise MCPToolError(
                f"Cluster '{namespace}/{name}' not found",
                code="not_found",
            ) from e
        raise
    workspace_id = _cr_workspace_id(cr)
    if workspace_id is None:
        return
    caller_owner_id = _resolve_caller_owner_id()
    try:
        ws = await db.get_workspace(workspace_id)
    except db.DBNotInitialized:
        # Workspace metaDB is not configured -- preserve the legacy
        # single-tenant fallback used by unit-test paths that exercise
        # the K8s tools in isolation. Mirrors the REST permissive leg
        # in :func:`routers.k8s_clusters._is_workspace_visible`.
        return
    if ws is None:
        # Orphan label: the workspace the CR was stamped against has
        # been deleted. Pre-fix the MCP tool returned silently, leaving
        # the cluster accessible to every caller. Mirror the REST gate
        # (``_is_workspace_visible`` returns False -> 404) and surface
        # an identity-not_found so the caller cannot enumerate
        # orphaned-label clusters across tenants.
        raise MCPToolError(
            f"Cluster '{namespace}/{name}' not found",
            code="not_found",
        )
    if ws.ownerId == caller_owner_id or ws.ownerId == SYSTEM_OWNER_ID:
        return
    raise MCPToolError(
        f"Cluster '{namespace}/{name}' not found",
        code="not_found",
    )


# ---------------------------------------------------------------------------
# Tool wrappers
# ---------------------------------------------------------------------------


@tool(category="k8s", mutation=False)
async def list_k8s_clusters(workspace_id: str | None = None) -> list[dict[str, Any]]:
    """List AerospikeCluster CRs visible to the caller.

    Returns a list of ``K8sClusterSummary`` dicts (camelCase keys per the
    REST OpenAPI shape: ``connectionId``, ``failedReconcileCount``,
    ``templateDrifted``).

    With ``workspace_id`` set the listing is restricted to CRs labelled
    ``acm.aerospike.com/workspace=<workspace_id>``. With ``workspace_id=None``
    (default) every visible CR is returned, including legacy CRs that
    pre-date workspace labelling.

    Without ``workspace_id`` the result is filtered down to CRs whose
    workspace label is visible to the caller (or whose label is missing
    -- the system-shared bucket). This mirrors the REST list endpoint so
    a multi-tenant MCP caller cannot enumerate other tenants' clusters
    just by omitting the filter.
    """
    _assert_k8s_enabled()
    label_selector = _workspace_label_selector(workspace_id)
    items, _ = await k8s_client.list_clusters(label_selector=label_selector)

    if workspace_id is None:
        caller_owner_id = _resolve_caller_owner_id()
        workspace_ids: set[str] = set()
        for item in items:
            ws_id = _cr_workspace_id(item)
            if ws_id is not None:
                workspace_ids.add(ws_id)
        visible: dict[str, bool] = {}
        try:
            for ws_id in workspace_ids:
                ws = await db.get_workspace(ws_id)
                visible[ws_id] = ws is not None and (ws.ownerId == caller_owner_id or ws.ownerId == SYSTEM_OWNER_ID)
        except db.DBNotInitialized:
            # Workspace metaDB not configured -- fall back to the legacy
            # permissive listing (every CR returned). Matches the notes
            # layer's tolerance for unit-test fixtures that don't drive
            # the workspace DB.
            visible = dict.fromkeys(workspace_ids, True)
        items = [item for item in items if (ws_id := _cr_workspace_id(item)) is None or visible.get(ws_id, False)]

    summaries = [k8s_service.extract_summary(item) for item in items]
    return [serializers.k8s_cluster_summary(s) for s in summaries]


@tool(category="k8s", mutation=False)
async def get_k8s_pods(
    cluster_id: str,
    workspace_id: str | None = None,
) -> list[dict[str, Any]]:
    """Return pod status for an AerospikeCluster CR.

    ``cluster_id`` is ``"<namespace>/<name>"`` as returned by
    ``list_k8s_clusters``. Cross-workspace access (when ``workspace_id`` is
    supplied) is rejected with ``code=workspace_mismatch`` by the registry
    gate before the tool body runs.

    Returns a list of ``K8sPodStatus`` dicts (camelCase keys: ``isReady``,
    ``podIP``, ``hostIP``, ``rackId``, etc.).
    """
    _assert_k8s_enabled()
    namespace, name = _parse_cluster_id(cluster_id)
    await _assert_caller_owns_cluster(namespace, name)
    pods_raw = await k8s_client.list_pods(
        namespace,
        f"app.kubernetes.io/name=aerospike-cluster,app.kubernetes.io/instance={name}",
    )
    pods = [K8sPodStatus(**p) for p in pods_raw]
    return [serializers.k8s_pod(p) for p in pods]


@tool(category="k8s", mutation=False)
async def get_k8s_events(
    cluster_id: str,
    workspace_id: str | None = None,
    since_minutes: int = 30,
) -> list[dict[str, Any]]:
    """Return Kubernetes events involving an AerospikeCluster CR.

    Bounded by ``since_minutes`` (default 30, max 1440). Events older than
    the window are dropped; ``invalid_argument`` is raised for values
    outside ``[1, 1440]``.

    Returns a list of ``K8sClusterEvent`` dicts with the operator-specific
    ``category`` field populated (Rolling Restart / Configuration /
    Scaling / etc.) so the LLM can group events without re-running the
    classifier.
    """
    _assert_k8s_enabled()
    _check_bound(since_minutes, max_value=_MAX_SINCE_MINUTES, name="since_minutes")
    namespace, name = _parse_cluster_id(cluster_id)
    await _assert_caller_owns_cluster(namespace, name)

    field_selector = f"involvedObject.name={name},involvedObject.kind=AerospikeCluster"
    events_raw = await k8s_client.list_events(namespace, field_selector)

    # Filter to the requested time window. ``lastTimestamp`` is RFC3339
    # from ``_list_events_sync``; fall back to ``firstTimestamp`` when the
    # event has not been seen since (single occurrence).
    cutoff = datetime.now(UTC) - timedelta(minutes=since_minutes)
    filtered = []
    for raw in events_raw:
        ts_str = raw.get("lastTimestamp") or raw.get("firstTimestamp")
        if ts_str:
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            except ValueError:
                ts = None
            if ts is not None and ts < cutoff:
                continue
        filtered.append(raw)

    events = [K8sClusterEvent(**e) for e in filtered]
    for event in events:
        event.category = k8s_service.categorize_event(event.reason)
    return [serializers.k8s_event(e) for e in events]


@tool(category="k8s", mutation=True)
async def scale_k8s_cluster(
    cluster_id: str,
    size: int,
    workspace_id: str | None = None,
) -> dict[str, Any]:
    """Patch ``spec.size`` on an AerospikeCluster CR.

    Returns ``{"clusterId": str, "previousSize": int, "newSize": int}`` --
    deliberately small so the LLM can confirm the patch landed without
    having to parse a full cluster snapshot.

    CE caps cluster size at 8 nodes. The CRD's OpenAPI schema validator
    rejects ``size > 8`` with a 422 ``Invalid`` response, which the error
    mapper surfaces as ``code="invalid_argument"``. Webhook-enforced
    invariants (e.g. modifying the operations list mid-flight) surface as
    ``code="conflict"`` from a 409 — but the size cap itself is the
    schema-level check, not the webhook.

    Mutation: requires ``ACM_MCP_ACCESS_PROFILE=full``; returns
    ``code=access_denied`` under READ_ONLY.
    """
    _assert_k8s_enabled()
    if size < 1:
        raise MCPToolError(
            f"size must be >= 1, got {size}",
            code="invalid_argument",
        )
    namespace, name = _parse_cluster_id(cluster_id)

    # ACL gate runs the same ``get_cluster`` we'd otherwise use to read
    # the previous size — fold the two reads into one to avoid a
    # redundant API hop. ``_assert_caller_owns_cluster`` raises before
    # we get here when the caller cannot see the workspace.
    await _assert_caller_owns_cluster(namespace, name)
    current = await k8s_client.get_cluster(namespace, name)
    previous_size = int(current.get("spec", {}).get("size", 0) or 0)

    patch = {"spec": {"size": size}}
    # P1-4: pass the workspace label observed during the ACL gate so the
    # patch loop aborts if a concurrent writer re-stamps the CR with a
    # different label between the gate and the apply (TOCTOU).
    result = await k8s_client.patch_cluster(
        namespace,
        name,
        patch,
        expected_workspace_id=_cr_workspace_id(current),
    )
    new_size = int(result.get("spec", {}).get("size", size) or size)

    # Use a non-aliased camelCase form directly so the response matches the
    # ADR shape regardless of Pydantic round-trips.
    return {
        "clusterId": cluster_id,
        "previousSize": previous_size,
        "newSize": new_size,
    }


@tool(category="k8s", mutation=False)
async def get_k8s_logs(
    cluster_id: str,
    pod_name: str,
    workspace_id: str | None = None,
    since_seconds: int = 300,
    tail_lines: int = 200,
) -> dict[str, Any]:
    """Return a bounded log snapshot for a pod inside an AerospikeCluster.

    ``pod_name`` must belong to the named cluster -- pods labelled
    ``app.kubernetes.io/instance=<cluster-name>``. Cross-cluster pod
    access is rejected with ``code=not_found``.

    ``since_seconds`` and ``tail_lines`` combine on the K8s API side:
    the response is the intersection (last ``tail_lines`` lines emitted
    within ``since_seconds`` of the request). This matches the Kubernetes
    ``sinceSeconds`` semantics. Both are bounds-checked.

    Bounds: ``since_seconds`` <= 3600, ``tail_lines`` <= 1000. Out-of-range
    values raise ``invalid_argument``.

    Returns ``{"podName": str, "lines": list[str], "truncated": bool}``.
    ``truncated`` is true when the pod returned at least ``tail_lines``
    lines (so older history was elided by the K8s API).
    """
    _assert_k8s_enabled()
    _check_bound(since_seconds, max_value=_MAX_SINCE_SECONDS, name="since_seconds")
    _check_bound(tail_lines, max_value=_MAX_TAIL_LINES, name="tail_lines")
    namespace, name = _parse_cluster_id(cluster_id)
    await _assert_caller_owns_cluster(namespace, name)

    # Match the same label pair ``get_k8s_pods`` uses so a pod from another
    # workload that happens to share the ``instance`` label cannot be
    # pulled by name and have its logs leaked through this tool. The
    # ACKO operator stamps both labels onto every cluster pod, so this
    # narrowing is invisible to legitimate callers.
    cluster_pods = await k8s_client.list_pods(
        namespace,
        f"app.kubernetes.io/name=aerospike-cluster,app.kubernetes.io/instance={name}",
    )
    pod_names = {p["name"] for p in cluster_pods}
    if pod_name not in pod_names:
        raise MCPToolError(
            f"Pod '{pod_name}' does not belong to cluster '{cluster_id}'",
            code="not_found",
        )

    raw_logs = await k8s_client.read_pod_log(
        namespace,
        pod_name,
        tail_lines=tail_lines,
        since_seconds=since_seconds,
    )
    # ``read_namespaced_pod_log`` returns a single string; split into lines
    # so the LLM gets a structured payload it can iterate over.
    lines = raw_logs.splitlines() if raw_logs else []
    truncated = len(lines) >= tail_lines
    return {
        "podName": pod_name,
        "lines": lines,
        "truncated": truncated,
    }


# Re-export the model classes for tests / introspection. Without these the
# test file would have to reach into ``models.k8s_cluster`` directly which
# couples the test to the model layout rather than the tool surface.
__all__ = [
    "K8sClusterEvent",
    "K8sClusterSummary",
    "K8sPodStatus",
    "get_k8s_events",
    "get_k8s_logs",
    "get_k8s_pods",
    "list_k8s_clusters",
    "scale_k8s_cluster",
]
