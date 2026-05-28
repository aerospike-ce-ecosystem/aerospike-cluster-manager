"""Kubernetes-based Aerospike CE cluster management endpoints.

All endpoints are guarded by K8S_MANAGEMENT_ENABLED config flag.
When disabled, a 404 is returned so the frontend can hide K8s features.
"""

from __future__ import annotations

import asyncio
import copy
import functools
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from opentelemetry import trace
from pydantic import BaseModel, Field

from aerospike_cluster_manager_api import config, db
from aerospike_cluster_manager_api.client_manager import client_manager
from aerospike_cluster_manager_api.dependencies import CallerOwnerId
from aerospike_cluster_manager_api.k8s_client import K8sApiError, k8s_client
from aerospike_cluster_manager_api.models.connection import ConnectionProfile
from aerospike_cluster_manager_api.models.k8s_cluster import (
    ClusterHealthResponse,
    ConfigDriftResponse,
    CreateK8sClusterRequest,
    CreateK8sTemplateRequest,
    HPAConfig,
    HPAResponse,
    ImportClusterRequest,
    K8sClusterDetail,
    K8sClusterEvent,
    K8sClusterListResponse,
    K8sClusterSummary,
    K8sPodStatus,
    K8sTemplateDetail,
    K8sTemplateSummary,
    MigrationStatusResponse,
    NodeBlocklistRequest,
    OperationRequest,
    PVCInfo,
    ReconciliationHealthResponse,
    ReconciliationStatus,
    ScaleK8sClusterRequest,
    UpdateK8sClusterRequest,
    UpdateK8sTemplateRequest,
)
from aerospike_cluster_manager_api.models.workspace import DEFAULT_WORKSPACE_ID, SYSTEM_OWNER_ID
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.services.k8s_service import (
    build_cr,
    build_template_cr,
    build_template_update_patch,
    build_update_patch,
    calculate_age,
    categorize_event,
    clean_cr_for_export,
    compute_config_drift,
    extract_detail,
    extract_health,
    extract_hpa_response,
    extract_migration_status,
    extract_reconciliation_health,
    extract_reconciliation_status,
    extract_summary,
    extract_template_summary,
    has_update_fields,
)

logger = logging.getLogger(__name__)
_tracer = trace.get_tracer("aerospike_cluster_manager_api.routers.k8s_clusters")


def _require_k8s() -> None:
    if not config.K8S_MANAGEMENT_ENABLED:
        raise HTTPException(status_code=404, detail="Kubernetes management is not enabled")


_WORKSPACE_LABEL = "acm.aerospike.com/workspace"


def _cr_workspace_id(item: dict[str, Any]) -> str | None:
    """Return the workspace id stamped on a CR's metadata labels, if any.

    CRs without the workspace label are treated as system-shared — the
    same rule the connection-profile ACL applies for ``SYSTEM_OWNER_ID``.
    Returning ``None`` lets the caller decide whether to gate (mutations
    require an owned workspace, reads with no label show to everyone).
    """
    labels = item.get("metadata", {}).get("labels") or {}
    raw = labels.get(_WORKSPACE_LABEL)
    return raw if isinstance(raw, str) and raw else None


async def _is_workspace_visible(workspace_id: str, caller_owner_id: str) -> bool:
    """Return True iff the caller can see ``workspace_id``.

    Visibility = ``ownerId == caller`` OR ``ownerId == SYSTEM_OWNER_ID``.
    Missing rows are invisible. Mirrors the rule used by
    :func:`dependencies._get_verified_connection` for connection
    profiles, so K8s and connection ACLs stay in lock-step.

    When the workspace metaDB has not been initialised (unit-test paths
    that exercise the K8s router in isolation), the check degrades to
    permissive -- the same convention notes / records use to keep
    legacy single-tenant fixtures green.
    """
    try:
        ws = await db.get_workspace(workspace_id)
    except db.DBNotInitialized:
        return True
    if ws is None:
        return False
    return ws.ownerId == caller_owner_id or ws.ownerId == SYSTEM_OWNER_ID


async def _assert_caller_owns_k8s_cluster(
    namespace: str,
    name: str,
    caller_owner_id: str,
) -> dict[str, Any]:
    """Default-deny ACL gate for K8s cluster mutations.

    Resolves the cluster CR, reads its ``acm.aerospike.com/workspace``
    label, and verifies the caller can see that workspace. Clusters with
    no workspace label are treated as system-shared (visible to every
    authenticated caller) so legacy CRs created before workspace
    labelling stay reachable. Returns the CR dict for callers that need
    it, so we don't pay the ``get_cluster`` round trip twice.

    Raises ``HTTPException(404)`` for a missing cluster (matching
    ``K8sApiError`` mapping) or for a cluster the caller cannot see
    (identity-404 to prevent enumeration).
    """
    try:
        cr = await k8s_client.get_cluster(namespace, name)
    except K8sApiError as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail=f"Cluster '{namespace}/{name}' not found") from e
        raise _map_k8s_error(e) from e
    workspace_id = _cr_workspace_id(cr)
    if workspace_id is None:
        return cr
    if not await _is_workspace_visible(workspace_id, caller_owner_id):
        raise HTTPException(status_code=404, detail=f"Cluster '{namespace}/{name}' not found")
    return cr


router = APIRouter(prefix="/k8s", tags=["k8s-clusters"], dependencies=[Depends(_require_k8s)])

# Reusable K8s DNS-compatible name constraint for path parameters.
_K8S_NAME = Path(..., min_length=1, max_length=63, pattern=r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$")
_K8S_NAMESPACE = Path(..., min_length=1, max_length=253, pattern=r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")


class DeleteResponse(BaseModel):
    message: str


def _map_k8s_error(e: K8sApiError) -> HTTPException:
    """Map K8sApiError status codes to appropriate HTTPException responses."""
    status_map = {400: 400, 401: 401, 403: 403, 404: 404, 408: 408, 409: 409, 422: 422, 429: 429, 503: 503}
    http_status = status_map.get(e.status, 500)
    return HTTPException(status_code=http_status, detail=e.message or e.reason)


def _k8s_endpoint(operation: str):
    """Decorator that wraps K8s endpoint handlers with standard error handling
    and an OTel span named after the *operation* string.

    Catches HTTPException (re-raises), K8sApiError (maps to HTTPException),
    and general Exception (logs and raises 500). The span name is
    ``asm.k8s.<slug>`` where slug is the operation lowercased with spaces
    turned into dots — e.g. "create Kubernetes cluster" → "asm.k8s.create.kubernetes.cluster".
    """

    span_name = "asm.k8s." + operation.lower().replace(" ", ".")

    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            with _tracer.start_as_current_span(span_name, attributes={"asm.k8s.operation": operation}):
                try:
                    return await func(*args, **kwargs)
                except HTTPException:
                    raise
                except K8sApiError as e:
                    raise _map_k8s_error(e) from e
                except Exception as e:
                    logger.exception("Failed to %s", operation)
                    raise HTTPException(status_code=500, detail=f"Failed to {operation}") from e

        return wrapper

    return decorator


# ---------------------------------------------------------------------------
# Cluster endpoints
# ---------------------------------------------------------------------------


@router.get("/clusters", summary="List K8s Aerospike clusters")
@_k8s_endpoint("list Kubernetes clusters")
async def list_k8s_clusters(
    caller_owner_id: CallerOwnerId,
    namespace: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    continue_token: str | None = Query(None, alias="continueToken"),
    label_selector: str | None = Query(None, alias="labelSelector"),
) -> K8sClusterListResponse:

    items, next_token = await k8s_client.list_clusters(
        namespace, limit=limit, continue_token=continue_token, label_selector=label_selector
    )

    # Filter CRs by workspace visibility. CRs with no workspace label are
    # treated as system-shared (legacy compatibility). Visibility checks run
    # in parallel via ``asyncio.gather`` so a 100-cluster page does not
    # serialize 100 ``db.get_workspace`` round trips — the prior loop turned
    # a fan-out lookup into an O(N) blocking chain.
    workspace_ids: set[str] = set()
    for item in items:
        ws_id = _cr_workspace_id(item)
        if ws_id is not None:
            workspace_ids.add(ws_id)
    ws_id_list = list(workspace_ids)
    visibility_results = await asyncio.gather(
        *(_is_workspace_visible(ws_id, caller_owner_id) for ws_id in ws_id_list),
    )
    visible_workspaces: dict[str, bool] = dict(zip(ws_id_list, visibility_results, strict=True))
    items = [item for item in items if (ws := _cr_workspace_id(item)) is None or visible_workspaces.get(ws, False)]

    # Build the connection-id correlation table from connections visible to the
    # caller only. Without this filter, a tenant would receive another tenant's
    # connectionId on a CR that happens to share a name/host -- a cross-tenant
    # data leak. Mirrors the visibility rule used by
    # ``services/connections_service.list_connections``.
    connections = await db.get_all_connections()
    if caller_owner_id is not None:
        try:
            all_workspaces = await db.get_all_workspaces()
        except db.DBNotInitialized:
            all_workspaces = []
        visible_ws_ids = {
            ws.id for ws in all_workspaces if ws.ownerId == caller_owner_id or ws.ownerId == SYSTEM_OWNER_ID
        }
        connections = [c for c in connections if (c.workspaceId or DEFAULT_WORKSPACE_ID) in visible_ws_ids]
    conn_by_host: dict[str, str] = {}
    conn_by_name: dict[str, str] = {}
    for conn in connections:
        for host in conn.hosts:
            conn_by_host[host.lower()] = conn.id
        conn_by_name[conn.name] = conn.id

    def _find_connection_id(item: dict[str, Any]) -> str | None:
        meta = item.get("metadata", {})
        name = meta.get("name", "")
        ns = meta.get("namespace", "")
        # In-cluster DNS match
        svc = f"{name}.{ns}.svc.cluster.local"
        conn_id = conn_by_host.get(svc.lower())
        if conn_id:
            return conn_id
        return conn_by_name.get(f"[K8s] {name}")

    summaries = [extract_summary(item, connection_id=_find_connection_id(item)) for item in items]

    return K8sClusterListResponse(
        items=summaries,
        continueToken=next_token,
        hasMore=next_token is not None,
    )


@router.get("/clusters/{namespace}/{name}", summary="Get K8s Aerospike cluster detail")
@_k8s_endpoint("get Kubernetes cluster")
async def get_k8s_cluster(
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterDetail:

    item = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    pods_raw = await k8s_client.list_pods(
        namespace, f"app.kubernetes.io/name=aerospike-cluster,app.kubernetes.io/instance={name}"
    )
    return extract_detail(item, pods_raw)


@router.get(
    "/clusters/{namespace}/{name}/pods",
    summary="List pods of a K8s Aerospike cluster",
)
@_k8s_endpoint("list Kubernetes cluster pods")
async def list_k8s_cluster_pods(
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> list[K8sPodStatus]:
    """Return pod status for an AerospikeCluster CR.

    Mirrors the pods slice of :func:`get_k8s_cluster` so ackoctl (and any
    other API consumer) can fetch pods without paying for the full
    ``K8sClusterDetail`` payload (operations status, conditions, full
    spec/status). Same workspace ACL gate -- identity-404 for invisible
    or missing clusters.
    """

    await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    pods_raw = await k8s_client.list_pods(
        namespace,
        f"app.kubernetes.io/name=aerospike-cluster,app.kubernetes.io/instance={name}",
    )
    return [K8sPodStatus(**p) for p in pods_raw]


@router.get("/clusters/{namespace}/{name}/config-drift", summary="Get cluster config drift")
@_k8s_endpoint("get cluster config drift")
async def get_cluster_config_drift(
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
):
    """Compare desired spec vs applied spec and detect configuration drift."""

    cr = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    result = compute_config_drift(cr)
    return ConfigDriftResponse(**result)


@router.get("/clusters/{namespace}/{name}/health", summary="Get cluster health summary")
@_k8s_endpoint("get cluster health")
async def get_k8s_cluster_health(
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> ClusterHealthResponse:

    item = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    return extract_health(item)


@router.get("/clusters/{namespace}/{name}/reconciliation-status", summary="Get reconciliation health")
@_k8s_endpoint("get reconciliation status")
async def get_cluster_reconciliation_status(
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
):
    """Get reconciliation health including circuit breaker state."""

    cr = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    result = extract_reconciliation_status(cr)
    return ReconciliationStatus(**result)


@router.get("/clusters/{namespace}/{name}/migration-status", summary="Get cluster migration status")
@_k8s_endpoint("get cluster migration status")
async def get_migration_status(
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
):
    """Get migration status including per-pod migration info."""

    cr = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    result = extract_migration_status(cr)
    return MigrationStatusResponse(**result)


@router.get(
    "/clusters/{namespace}/{name}/reconciliation-health",
    summary="Get reconciliation health",
)
@_k8s_endpoint("get reconciliation health")
async def get_cluster_reconciliation_health(
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
):
    """Get reconciliation health including phase, error info, and health status."""

    cr = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    result = extract_reconciliation_health(cr)
    return ReconciliationHealthResponse(**result)


@router.get("/clusters/{namespace}/{name}/pods/{pod}/logs", summary="Get pod logs")
@_k8s_endpoint("get pod logs")
async def get_k8s_pod_logs(
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
    pod: str = Path(..., min_length=1, max_length=253),
    tail: int = Query(default=500, ge=1, le=10000, description="Number of tail lines"),
    container: str | None = Query(default=None, description="Container name"),
    since_seconds: int | None = Query(
        default=None,
        ge=1,
        le=86400,
        description="Restrict logs to lines emitted within this many seconds (max 24h)",
    ),
) -> dict[str, Any]:

    await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    cluster_pods = await k8s_client.list_pods(namespace, f"app.kubernetes.io/instance={name}")
    pod_names = {p["name"] for p in cluster_pods}
    if pod not in pod_names:
        raise HTTPException(status_code=404, detail=f"Pod '{pod}' does not belong to cluster '{name}'")
    logs = await k8s_client.read_pod_log(
        namespace, pod, container=container, tail_lines=tail, since_seconds=since_seconds
    )
    response: dict[str, Any] = {"pod": pod, "logs": logs, "tailLines": tail}
    if since_seconds is not None:
        response["sinceSeconds"] = since_seconds
    return response


@router.get("/clusters/{namespace}/{name}/yaml", summary="Get cluster CR as YAML")
@_k8s_endpoint("export cluster YAML")
async def get_k8s_cluster_yaml(
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> dict[str, Any]:

    item = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    return {"yaml": clean_cr_for_export(item)}


@router.get("/clusters/{namespace}/{name}/pvcs", summary="List PVCs for K8s Aerospike cluster")
@_k8s_endpoint("list PVCs for Kubernetes cluster")
async def list_k8s_cluster_pvcs(
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> list[PVCInfo]:
    """List PersistentVolumeClaims associated with the cluster's StatefulSets."""

    await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    label_selector = f"app.kubernetes.io/instance={name}"
    pvcs_raw, pod_pvc_map = await asyncio.gather(
        k8s_client.list_pvcs(namespace, label_selector),
        k8s_client.get_pod_pvc_map(namespace, label_selector),
    )

    pvcs = []
    for pvc in pvcs_raw:
        pvc_name = pvc.get("name", "")
        bp = pod_pvc_map.get(pvc_name)
        pvc["boundPod"] = bp
        pvc["isOrphan"] = bp is None and pvc.get("status") == "Bound"
        pvcs.append(PVCInfo(**pvc))
    return pvcs


@router.delete(
    "/clusters/{namespace}/{name}/pvcs/{pvc_name}",
    summary="Delete a PVC",
    response_model=dict,
)
@limiter.limit("20/minute")
@_k8s_endpoint("delete PVC")
async def delete_pvc(
    request: Request,
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
    pvc_name: str = Path(..., min_length=1, max_length=253),
) -> dict[str, str]:
    """Delete an orphaned PVC. The PVC must belong to the cluster (label check)."""
    await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    label_selector = f"app.kubernetes.io/instance={name}"
    pvcs_raw = await k8s_client.list_pvcs(namespace, label_selector)
    pvc_names = [p.get("name") for p in pvcs_raw]
    if pvc_name not in pvc_names:
        raise HTTPException(status_code=404, detail=f"PVC '{pvc_name}' not found for cluster '{name}'")

    await k8s_client.delete_pvc(namespace, pvc_name)
    return {"message": f"PVC '{pvc_name}' deleted", "namespace": namespace}


@router.post(
    "/clusters/{namespace}/{name}/force-reconcile",
    summary="Force reconcile a drifted cluster",
)
@limiter.limit("20/minute")
@_k8s_endpoint("force reconcile Kubernetes cluster")
async def force_reconcile_k8s_cluster(
    request: Request,
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterSummary:
    """Add a force-reconcile annotation to trigger the operator to re-reconcile."""

    cr = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    patch: dict[str, Any] = {
        "metadata": {
            "annotations": {
                "acko.io/force-reconcile": datetime.now(UTC).isoformat(),
            }
        }
    }
    result = await k8s_client.patch_cluster(namespace, name, patch, expected_workspace_id=_cr_workspace_id(cr))
    return extract_summary(result)


@router.post(
    "/clusters/{namespace}/{name}/reset-circuit-breaker",
    summary="Reset operator circuit breaker",
    response_model=dict,
)
@limiter.limit("20/minute")
@_k8s_endpoint("reset circuit breaker")
async def reset_circuit_breaker(
    request: Request,
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> dict[str, str]:
    """Reset the circuit breaker by patching status counters and annotating the CR."""
    cr = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    # 1. Reset status subresource (clear error state).
    # ``expected_workspace_id`` closes the TOCTOU window between the
    # ACL check above and the status apply: a concurrent re-label
    # aborts with 409 instead of mutating a CR the caller no longer
    # owns. Mirrors the guard already on patch_cluster below.
    await k8s_client.patch_cluster_status(
        namespace,
        name,
        {
            "failedReconcileCount": 0,
            "lastReconcileError": "",
        },
        expected_workspace_id=_cr_workspace_id(cr),
    )
    # 2. Annotate to trigger fresh reconciliation
    patch: dict[str, Any] = {
        "metadata": {
            "annotations": {
                "acko.io/circuit-breaker-reset": datetime.now(UTC).isoformat(),
            }
        }
    }
    await k8s_client.patch_cluster(namespace, name, patch, expected_workspace_id=_cr_workspace_id(cr))
    return {"message": "Circuit breaker reset triggered", "namespace": namespace, "name": name}


@router.post("/clusters/import", status_code=201, summary="Import K8s Aerospike cluster from CR")
@limiter.limit("20/minute")
@_k8s_endpoint("import Kubernetes cluster")
async def import_k8s_cluster(
    request: Request,
    body: ImportClusterRequest,
    caller_owner_id: CallerOwnerId,
) -> K8sClusterSummary:
    """Create a cluster from a raw AerospikeCluster CR (JSON/YAML)."""

    cr = body.cr
    metadata = cr.get("metadata", {})
    cr_namespace = body.namespace or metadata.get("namespace")
    if not cr_namespace:
        raise HTTPException(status_code=400, detail="Namespace is required (set in CR metadata or request body)")

    cr_name = metadata.get("name")
    if not cr_name:
        raise HTTPException(status_code=400, detail="CR metadata.name is required")

    # Ensure correct apiVersion and kind
    cr["apiVersion"] = "acko.io/v1alpha1"
    cr["kind"] = "AerospikeCluster"
    cr.setdefault("metadata", {})["namespace"] = cr_namespace

    # Strip status and managed fields for clean import
    cr.pop("status", None)
    metadata = cr.get("metadata", {})
    metadata.pop("resourceVersion", None)
    metadata.pop("uid", None)
    metadata.pop("creationTimestamp", None)
    metadata.pop("generation", None)
    metadata.pop("managedFields", None)

    # Reject CRs that carry a workspace label the caller cannot see.
    # Without this gate the caller could attach a CR to another tenant's
    # workspace and inherit visibility through the workspace fan-out.
    cr_workspace_id = _cr_workspace_id(cr)
    if cr_workspace_id is not None and not await _is_workspace_visible(cr_workspace_id, caller_owner_id):
        raise HTTPException(
            status_code=404,
            detail=f"Workspace '{cr_workspace_id}' not found",
        )
    # P1-3: stamp the caller's default workspace label when the imported
    # CR has none. Without this fix, an import landed unlabelled and was
    # therefore visible to every authenticated caller (matching the
    # pre-#307 system-shared bucket). Mirrors the create_k8s_cluster
    # pattern at routers/k8s_clusters.py:~603.
    if cr_workspace_id is None:
        labels = cr.setdefault("metadata", {}).setdefault("labels", {})
        labels[_WORKSPACE_LABEL] = DEFAULT_WORKSPACE_ID

    existing_namespaces = await k8s_client.list_namespaces()
    if cr_namespace not in existing_namespaces:
        raise HTTPException(
            status_code=400,
            detail=f"Namespace '{cr_namespace}' does not exist. Available: {', '.join(sorted(existing_namespaces))}",
        )

    result = await k8s_client.create_cluster(cr_namespace, cr)
    return extract_summary(result)


@router.post("/clusters", status_code=201, summary="Create K8s Aerospike cluster")
@limiter.limit("20/minute")
@_k8s_endpoint("create Kubernetes cluster")
async def create_k8s_cluster(
    request: Request,
    body: CreateK8sClusterRequest,
    caller_owner_id: CallerOwnerId,
) -> K8sClusterSummary:

    # Reject creation in a workspace the caller cannot see. ``workspace_id``
    # may be None (legacy clients) — fall through to the default workspace
    # which is shared via SYSTEM_OWNER_ID.
    if body.workspace_id is not None and not await _is_workspace_visible(body.workspace_id, caller_owner_id):
        raise HTTPException(status_code=404, detail=f"Workspace '{body.workspace_id}' not found")

    existing_namespaces = await k8s_client.list_namespaces()
    if body.namespace not in existing_namespaces:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Namespace '{body.namespace}' does not exist in the Kubernetes cluster. "
                f"Available namespaces: {', '.join(sorted(existing_namespaces))}"
            ),
        )

    cr = build_cr(body)
    # Stamp the workspace label so subsequent ACL checks (list/get/mutate)
    # can recognise the CR's tenant. Skipped when no workspace is named —
    # the cluster lands in the system-shared bucket and stays visible to
    # everyone, matching the legacy pre-#307 contract.
    if body.workspace_id is not None:
        labels = cr.setdefault("metadata", {}).setdefault("labels", {})
        labels[_WORKSPACE_LABEL] = body.workspace_id
    result = await k8s_client.create_cluster(body.namespace, cr)

    connection_id: str | None = None
    auto_connect_warning: str | None = None
    if body.auto_connect:
        try:
            service_host = f"{body.name}.{body.namespace}.svc.cluster.local"
            service_port = 3000

            # Honour the workspace the user was operating in when they hit
            # "Create Cluster". Fall back to the built-in default if the
            # field is missing (legacy clients) or points at a workspace that
            # was deleted between request and reconcile.
            target_workspace_id = body.workspace_id or DEFAULT_WORKSPACE_ID
            if not await db.get_workspace(target_workspace_id):
                target_workspace_id = DEFAULT_WORKSPACE_ID

            now = datetime.now(UTC).isoformat()
            conn = ConnectionProfile(
                id=f"conn-{uuid.uuid4().hex[:12]}",
                name=f"[K8s] {body.name}",
                hosts=[service_host],
                port=service_port,
                clusterName=f"{body.namespace}/{body.name}",
                color="#10B981",
                # ACKO-managed clusters land in the `env=default` group until the
                # user assigns a more specific value via Edit. Passed explicitly
                # so the contract does not depend on the model validator's default.
                labels={"env": "default"},
                workspaceId=target_workspace_id,
                createdAt=now,
                updatedAt=now,
            )
            await db.create_connection(conn)
            connection_id = conn.id
            logger.info(
                "Auto-created connection profile for K8s cluster %s/%s in workspace %s",
                body.namespace,
                body.name,
                target_workspace_id,
            )
        except Exception:
            auto_connect_warning = f"Cluster created but auto-connect failed for {body.namespace}/{body.name}"
            logger.warning("Failed to auto-create connection for %s/%s", body.namespace, body.name, exc_info=True)

    summary = extract_summary(result, connection_id=connection_id)
    summary.autoConnectWarning = auto_connect_warning
    return summary


@router.patch("/clusters/{namespace}/{name}", summary="Update K8s Aerospike cluster")
@limiter.limit("20/minute")
@_k8s_endpoint("update Kubernetes cluster")
async def update_k8s_cluster(
    request: Request,
    body: UpdateK8sClusterRequest,
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterSummary:

    if not has_update_fields(body):
        raise HTTPException(status_code=400, detail="At least one field must be provided")

    cr = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    patch = build_update_patch(body)
    result = await k8s_client.patch_cluster(namespace, name, patch, expected_workspace_id=_cr_workspace_id(cr))
    return extract_summary(result)


@router.delete("/clusters/{namespace}/{name}", status_code=202, summary="Delete K8s Aerospike cluster")
@limiter.limit("20/minute")
@_k8s_endpoint("delete Kubernetes cluster")
async def delete_k8s_cluster(
    request: Request,
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> DeleteResponse:

    await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    await k8s_client.delete_cluster(namespace, name)

    try:
        all_conns = await db.get_all_connections()
        k8s_prefix = f"[K8s] {name}"
        service_host = f"{name}.{namespace}.svc.cluster.local"
        for conn in all_conns:
            if conn.name == k8s_prefix or service_host in conn.hosts:
                # Gate on workspace visibility so we never delete another
                # tenant's connection profile that happens to share a
                # hostname/name with the cluster being torn down.
                conn_ws = conn.workspaceId or DEFAULT_WORKSPACE_ID
                if not await _is_workspace_visible(conn_ws, caller_owner_id):
                    logger.info(
                        "Skipping connection cleanup for %s (workspace %s not visible to caller)",
                        conn.id,
                        conn_ws,
                    )
                    continue
                await db.delete_connection(conn.id)
                await client_manager.close_client(conn.id)
                logger.info("Cleaned up auto-connect profile %s for deleted cluster %s/%s", conn.id, namespace, name)
    except Exception:
        logger.warning("Failed to clean up connection profiles for %s/%s", namespace, name, exc_info=True)

    return DeleteResponse(message=f"Cluster {namespace}/{name} deletion initiated")


@router.post("/clusters/{namespace}/{name}/scale", summary="Scale K8s Aerospike cluster")
@limiter.limit("20/minute")
@_k8s_endpoint("scale Kubernetes cluster")
async def scale_k8s_cluster(
    request: Request,
    body: ScaleK8sClusterRequest,
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterSummary:

    cr = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    patch = {"spec": {"size": body.size}}
    result = await k8s_client.patch_cluster(namespace, name, patch, expected_workspace_id=_cr_workspace_id(cr))
    return extract_summary(result)


@router.patch(
    "/clusters/{namespace}/{name}/node-blocklist",
    summary="Update node blocklist for K8s Aerospike cluster",
)
@limiter.limit("20/minute")
@_k8s_endpoint("update node blocklist")
async def update_node_blocklist(
    request: Request,
    body: NodeBlocklistRequest,
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterSummary:
    """Patch spec.k8sNodeBlockList on the AerospikeCluster CR."""

    cr = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    patch: dict[str, Any] = {"spec": {"k8sNodeBlockList": body.node_names}}
    result = await k8s_client.patch_cluster(namespace, name, patch, expected_workspace_id=_cr_workspace_id(cr))
    return extract_summary(result)


# ---------------------------------------------------------------------------
# HPA endpoints
# ---------------------------------------------------------------------------


@router.get("/clusters/{namespace}/{name}/hpa", summary="Get HPA for K8s Aerospike cluster")
@_k8s_endpoint("get HPA for Kubernetes cluster")
async def get_k8s_cluster_hpa(
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> HPAResponse:

    await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    raw = await k8s_client.get_hpa(namespace, name)
    return extract_hpa_response(raw)


@router.post("/clusters/{namespace}/{name}/hpa", summary="Create or update HPA for K8s Aerospike cluster")
@limiter.limit("20/minute")
@_k8s_endpoint("create/update HPA for Kubernetes cluster")
async def create_or_update_k8s_cluster_hpa(
    request: Request,
    response: Response,
    body: HPAConfig,
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> HPAResponse:

    if body.cpu_target_percent is None and body.memory_target_percent is None:
        raise HTTPException(
            status_code=400, detail="At least one of cpu_target_percent or memory_target_percent is required"
        )
    await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    # Check if HPA already exists — update if so, create if not
    try:
        await k8s_client.get_hpa(namespace, name)
        raw = await k8s_client.update_hpa(
            namespace,
            name,
            body.min_replicas,
            body.max_replicas,
            body.cpu_target_percent,
            body.memory_target_percent,
        )
        response.status_code = 200
    except K8sApiError as e:
        if e.status == 404:
            raw = await k8s_client.create_hpa(
                namespace,
                name,
                body.min_replicas,
                body.max_replicas,
                body.cpu_target_percent,
                body.memory_target_percent,
            )
            response.status_code = 201
        else:
            raise
    return extract_hpa_response(raw)


@router.delete("/clusters/{namespace}/{name}/hpa", status_code=202, summary="Delete HPA for K8s Aerospike cluster")
@limiter.limit("20/minute")
@_k8s_endpoint("delete HPA for Kubernetes cluster")
async def delete_k8s_cluster_hpa(
    request: Request,
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> DeleteResponse:

    await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    await k8s_client.delete_hpa(namespace, name)
    return DeleteResponse(message=f"HPA for {namespace}/{name} deleted")


# ---------------------------------------------------------------------------
# Infrastructure lookup endpoints
# ---------------------------------------------------------------------------


async def _visible_cluster_namespaces(caller_owner_id: str) -> set[str]:
    """Return the K8s namespaces hosting an AerospikeCluster the caller can see.

    Used to bound infrastructure-level lookups (secrets) to namespaces the
    caller has any cluster footprint in. Namespaces without a labelled CR
    (legacy / system-shared) remain reachable.
    """
    items, _ = await k8s_client.list_clusters(limit=200)
    workspace_ids: set[str] = {ws_id for item in items if (ws_id := _cr_workspace_id(item)) is not None}
    # Parallelize visibility lookups — see ``list_k8s_clusters`` for the
    # rationale: a serial ``await`` per workspace turns into N round-trips.
    ws_id_list = list(workspace_ids)
    visibility_results = await asyncio.gather(
        *(_is_workspace_visible(ws_id, caller_owner_id) for ws_id in ws_id_list),
    )
    visible_workspaces: dict[str, bool] = dict(zip(ws_id_list, visibility_results, strict=True))
    namespaces: set[str] = set()
    for item in items:
        ws_id = _cr_workspace_id(item)
        if ws_id is None or visible_workspaces.get(ws_id, False):
            ns = (item.get("metadata", {}) or {}).get("namespace")
            if ns:
                namespaces.add(ns)
    return namespaces


@router.get("/namespaces", summary="List Kubernetes namespaces")
@_k8s_endpoint("list Kubernetes namespaces")
async def list_k8s_namespaces(caller_owner_id: CallerOwnerId) -> list[str]:
    # Namespaces are infrastructure-level metadata: returned cluster-wide so
    # users can pick one when creating a new cluster. The ``caller_owner_id``
    # dependency still requires an authenticated caller.
    _ = caller_owner_id
    return await k8s_client.list_namespaces()


@router.get("/nodes", summary="List Kubernetes nodes with zone info")
@_k8s_endpoint("list Kubernetes nodes")
async def list_k8s_nodes(caller_owner_id: CallerOwnerId) -> list[dict[str, Any]]:
    # Nodes are cluster-level infrastructure -- enumerated for placement
    # planning. Authenticated callers only.
    _ = caller_owner_id
    return await k8s_client.list_nodes()


@router.get("/storageclasses", summary="List Kubernetes storage classes")
@_k8s_endpoint("list Kubernetes storage classes")
async def list_k8s_storage_classes(caller_owner_id: CallerOwnerId) -> list[str]:
    # Storage classes are cluster-level infrastructure metadata.
    # Authenticated callers only.
    _ = caller_owner_id
    return await k8s_client.list_storage_classes()


@router.get("/secrets", summary="List K8s Secrets in a namespace")
@_k8s_endpoint("list Kubernetes secrets")
async def list_k8s_secrets(caller_owner_id: CallerOwnerId, namespace: str = "aerospike") -> list[str]:
    # Secrets are sensitive: only return them for namespaces the caller has
    # at least one visible AerospikeCluster CR in. Namespaces with no
    # labelled CR (legacy / system-shared) remain reachable so existing
    # single-tenant deployments keep working.
    visible = await _visible_cluster_namespaces(caller_owner_id)
    if visible and namespace not in visible:
        # Identity-404 (empty list) so callers cannot enumerate other
        # tenants' namespaces.
        return []
    return await k8s_client.list_secrets(namespace)


# ---------------------------------------------------------------------------
# Template endpoints
# ---------------------------------------------------------------------------


async def _assert_template_visible(name: str, caller_owner_id: str, *, for_mutation: bool = False) -> dict[str, Any]:
    """Default-deny ACL gate for template reads / mutations.

    Templates with no ``acm.aerospike.com/workspace`` label are surfaced
    ONLY to the system caller -- legacy/pre-labelling rows stay reachable
    for migration but never leak across tenants. Labelled CRs are visible
    to the workspace owner (or ``SYSTEM_OWNER_ID``). Returns the CR dict
    when visible; raises 404 otherwise (identity-404 to prevent
    enumeration).

    With newly-created templates always carrying a workspace label
    (post-#307 fix), the only unlabelled rows in production are pre-fix
    legacy fixtures; system-only access is the safe default.
    """
    try:
        item = await k8s_client.get_template(name)
    except K8sApiError as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail=f"Template '{name}' not found") from e
        raise _map_k8s_error(e) from e
    workspace_id = _cr_workspace_id(item)
    if workspace_id is None:
        # Unlabelled: only the system caller may read or mutate.
        # ``for_mutation`` is kept on the signature so existing call
        # sites stay explicit, but the visibility rule is now the same
        # for both paths -- the pre-fix gap let any caller mutate
        # unlabelled templates iff they had created one (round-tripping
        # the create-without-label bug).
        if caller_owner_id == SYSTEM_OWNER_ID:
            return item
        raise HTTPException(status_code=404, detail=f"Template '{name}' not found")
    if not await _is_workspace_visible(workspace_id, caller_owner_id):
        raise HTTPException(status_code=404, detail=f"Template '{name}' not found")
    return item


@router.get("/templates", summary="List K8s AerospikeClusterTemplates")
@_k8s_endpoint("list Kubernetes templates")
async def list_k8s_templates(caller_owner_id: CallerOwnerId) -> list[K8sTemplateSummary]:

    items = await k8s_client.list_templates()
    # Filter labelled templates by workspace visibility. Unlabelled
    # templates are surfaced ONLY to the system caller -- legacy/pre-#307
    # rows stay reachable for migration but no tenant can read another
    # tenant's untagged templates. The pre-fix behaviour returned
    # unlabelled templates to every caller, which leaked another tenant's
    # untagged template metadata.
    workspace_ids: set[str] = {ws_id for item in items if (ws_id := _cr_workspace_id(item)) is not None}
    # Parallelize visibility lookups (same pattern as ``list_k8s_clusters``).
    ws_id_list = list(workspace_ids)
    visibility_results = await asyncio.gather(
        *(_is_workspace_visible(ws_id, caller_owner_id) for ws_id in ws_id_list),
    )
    visible_workspaces: dict[str, bool] = dict(zip(ws_id_list, visibility_results, strict=True))
    is_system_caller = caller_owner_id == SYSTEM_OWNER_ID

    def _template_visible(item: dict[str, Any]) -> bool:
        ws = _cr_workspace_id(item)
        if ws is None:
            return is_system_caller
        return visible_workspaces.get(ws, False)

    items = [item for item in items if _template_visible(item)]
    return [extract_template_summary(item) for item in items]


@router.get("/templates/{name}", summary="Get K8s AerospikeClusterTemplate detail")
@_k8s_endpoint("get Kubernetes template")
async def get_k8s_template(
    caller_owner_id: CallerOwnerId,
    name: str = _K8S_NAME,
) -> K8sTemplateDetail:

    item = await _assert_template_visible(name, caller_owner_id)
    metadata = item.get("metadata", {})
    return K8sTemplateDetail(
        name=metadata.get("name", ""),
        spec=item.get("spec", {}),
        status=item.get("status", {}),
        age=calculate_age(metadata.get("creationTimestamp")),
    )


@router.post("/templates", status_code=201, summary="Create K8s AerospikeClusterTemplate")
@limiter.limit("20/minute")
@_k8s_endpoint("create Kubernetes template")
async def create_k8s_template(
    request: Request,
    body: CreateK8sTemplateRequest,
    caller_owner_id: CallerOwnerId,
) -> K8sTemplateSummary:

    # Resolve the target workspace -- explicit body field wins, otherwise
    # fall back to the caller's default workspace bucket so the new CR
    # gets stamped with a label and the ACL gates (list / mutate) work
    # downstream. Pre-fix the body had no field at all and the CR was
    # created unlabelled -- visible to every authenticated caller and
    # write-locked because ``_assert_template_visible(for_mutation=True)``
    # rejected unlabelled rows (#P0-2).
    if body.workspace_id is not None and not await _is_workspace_visible(body.workspace_id, caller_owner_id):
        raise HTTPException(
            status_code=404,
            detail=f"Workspace '{body.workspace_id}' not found",
        )
    target_workspace_id = body.workspace_id or DEFAULT_WORKSPACE_ID

    cr = build_template_cr(body)
    # Stamp the workspace label so subsequent ACL gates can recognise the
    # template's tenant -- mirrors the create_k8s_cluster pattern at
    # routers/k8s_clusters.py:~603. Always labels (even for the default
    # bucket) so list/get/mutate gates can apply uniform rules.
    labels = cr.setdefault("metadata", {}).setdefault("labels", {})
    labels[_WORKSPACE_LABEL] = target_workspace_id
    result = await k8s_client.create_template(cr)
    return extract_template_summary(result)


@router.patch("/templates/{name}", summary="Update K8s AerospikeClusterTemplate")
@limiter.limit("20/minute")
@_k8s_endpoint("update Kubernetes template")
async def update_k8s_template(
    request: Request,
    body: UpdateK8sTemplateRequest,
    caller_owner_id: CallerOwnerId,
    name: str = _K8S_NAME,
) -> K8sTemplateSummary:

    item = await _assert_template_visible(name, caller_owner_id, for_mutation=True)
    patch = build_template_update_patch(body)
    if not patch.get("spec"):
        raise HTTPException(status_code=400, detail="No fields to update")
    # ``expected_workspace_id`` closes the TOCTOU window between
    # ``_assert_template_visible`` and the patch apply: a concurrent
    # re-labelling of the template aborts with 409 Conflict instead
    # of mutating a template the caller no longer owns. Mirrors the
    # guard on patch_cluster for AerospikeCluster CRs.
    result = await k8s_client.patch_template(name, patch, expected_workspace_id=_cr_workspace_id(item))
    return extract_template_summary(result)


@router.delete("/templates/{name}", status_code=202, summary="Delete K8s AerospikeClusterTemplate")
@limiter.limit("20/minute")
@_k8s_endpoint("delete Kubernetes template")
async def delete_k8s_template(
    request: Request,
    caller_owner_id: CallerOwnerId,
    name: str = _K8S_NAME,
) -> DeleteResponse:

    await _assert_template_visible(name, caller_owner_id, for_mutation=True)

    # Fetch all clusters (unpaginated) to check for template references
    all_clusters: list[dict[str, Any]] = []
    token: str | None = None
    while True:
        items, token = await k8s_client.list_clusters(continue_token=token)
        all_clusters.extend(items)
        if not token:
            break

    referencing = [
        c.get("metadata", {}).get("name", "")
        for c in all_clusters
        if c.get("spec", {}).get("templateRef", {}).get("name") == name
    ]
    if referencing:
        raise HTTPException(
            status_code=409,
            detail=f"Template '{name}' is referenced by cluster(s): {', '.join(referencing)}. "
            "Remove the template reference from these clusters before deleting.",
        )
    await k8s_client.delete_template(name)
    return DeleteResponse(message=f"Template {name} deletion initiated")


# ---------------------------------------------------------------------------
# Cluster event & operation endpoints
# ---------------------------------------------------------------------------


@router.get("/clusters/{namespace}/{name}/events", summary="Get K8s cluster events")
@_k8s_endpoint("get Kubernetes cluster events")
async def get_k8s_cluster_events(
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
    limit: int = Query(default=50, ge=1, le=500, description="Maximum number of events to return"),
    category: str | None = Query(default=None, description="Filter events by category"),
) -> list[K8sClusterEvent]:

    await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    field_selector = f"involvedObject.name={name},involvedObject.kind=AerospikeCluster"
    events_raw = await k8s_client.list_events(namespace, field_selector)
    events = [K8sClusterEvent(**e) for e in events_raw]
    for event in events:
        event.category = categorize_event(event.reason)
    if category:
        events = [e for e in events if e.category == category]
    return events[:limit]


@router.post(
    "/clusters/{namespace}/{name}/resync-template",
    summary="Trigger template resync for K8s Aerospike cluster",
)
@limiter.limit("20/minute")
@_k8s_endpoint("resync template for Kubernetes cluster")
async def resync_k8s_cluster_template(
    request: Request,
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterSummary:

    cr = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    patch: dict[str, Any] = {"metadata": {"annotations": {"acko.io/resync-template": "true"}}}
    result = await k8s_client.patch_cluster(namespace, name, patch, expected_workspace_id=_cr_workspace_id(cr))
    return extract_summary(result)


class CloneClusterRequest(BaseModel):
    """Request to clone an existing cluster with a new name."""

    name: str = Field(
        min_length=1,
        max_length=63,
        pattern=r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
        description="Name for the cloned cluster",
    )
    namespace: str | None = Field(
        default=None,
        max_length=63,
        pattern=r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$",
        description="Target namespace (defaults to source namespace)",
    )


@router.post(
    "/clusters/{namespace}/{name}/clone",
    status_code=201,
    summary="Clone an existing K8s Aerospike cluster",
)
@limiter.limit("20/minute")
@_k8s_endpoint("clone Kubernetes cluster")
async def clone_k8s_cluster(
    request: Request,
    body: CloneClusterRequest,
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterSummary:
    """Clone a cluster by copying its spec into a new cluster with a different name."""

    source = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    target_ns = body.namespace or namespace

    existing_namespaces = await k8s_client.list_namespaces()
    if target_ns not in existing_namespaces:
        raise HTTPException(
            status_code=400,
            detail=f"Namespace '{target_ns}' does not exist. Available: {', '.join(sorted(existing_namespaces))}",
        )

    cr: dict[str, Any] = {
        "apiVersion": "acko.io/v1alpha1",
        "kind": "AerospikeCluster",
        "metadata": {"name": body.name, "namespace": target_ns},
        "spec": copy.deepcopy(source.get("spec", {})),
    }
    # Carry the workspace label so the clone inherits the source's tenancy.
    # Without this the cloned CR would land in the system-shared bucket and
    # become reachable to every authenticated caller.
    source_workspace_id = _cr_workspace_id(source)
    if source_workspace_id is not None:
        cr["metadata"].setdefault("labels", {})[_WORKSPACE_LABEL] = source_workspace_id
    # Remove operation state that shouldn't carry over
    cr["spec"].pop("operations", None)
    cr["spec"].pop("paused", None)
    cr["spec"].pop("templateRef", None)

    # Replace cluster-name with the new cluster name to prevent accidental
    # mesh merges between source and cloned clusters. The webhook defaulter
    # only sets cluster-name if it doesn't exist, so we must update it here.
    aerospike_config = cr["spec"].get("aerospikeConfig", {})
    service_section = aerospike_config.get("service", {})
    if "cluster-name" in service_section:
        service_section["cluster-name"] = body.name

    try:
        result = await k8s_client.create_cluster(target_ns, cr)
    except K8sApiError as e:
        if e.status == 409:
            raise HTTPException(
                status_code=409,
                detail=f"Cluster with name '{body.name}' already exists in namespace '{target_ns}'",
            ) from e
        raise
    return extract_summary(result)


@router.post("/clusters/{namespace}/{name}/operations", summary="Trigger operation on K8s cluster")
@limiter.limit("20/minute")
@_k8s_endpoint("trigger operation on Kubernetes cluster")
async def trigger_k8s_cluster_operation(
    request: Request,
    body: OperationRequest,
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterSummary:

    cr = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    op_id = body.id or f"ui-{uuid.uuid4().hex[:8]}"
    operation: dict[str, Any] = {"kind": body.kind, "id": op_id}
    if body.pod_list:
        operation["podList"] = body.pod_list
    patch: dict[str, Any] = {"spec": {"operations": [operation]}}
    result = await k8s_client.patch_cluster(namespace, name, patch, expected_workspace_id=_cr_workspace_id(cr))
    return extract_summary(result)


@router.delete(
    "/clusters/{namespace}/{name}/operations",
    summary="Clear operations on K8s cluster",
)
@limiter.limit("20/minute")
@_k8s_endpoint("clear operations on Kubernetes cluster")
async def clear_k8s_cluster_operations(
    request: Request,
    caller_owner_id: CallerOwnerId,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterSummary:
    """Clear spec.operations to unblock a stuck cluster."""
    cr = await _assert_caller_owns_k8s_cluster(namespace, name, caller_owner_id)
    patch: dict[str, Any] = {"spec": {"operations": []}}
    result = await k8s_client.patch_cluster(namespace, name, patch, expected_workspace_id=_cr_workspace_id(cr))
    return extract_summary(result)
