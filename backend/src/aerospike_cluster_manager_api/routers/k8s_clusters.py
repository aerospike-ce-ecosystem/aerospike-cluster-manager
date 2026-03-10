"""Kubernetes-based Aerospike CE cluster management endpoints.

All endpoints are guarded by K8S_MANAGEMENT_ENABLED config flag.
When disabled, a 404 is returned so the frontend can hide K8s features.
"""

from __future__ import annotations

import functools
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel

from aerospike_cluster_manager_api import config, db
from aerospike_cluster_manager_api.client_manager import client_manager
from aerospike_cluster_manager_api.k8s_client import K8sApiError, k8s_client
from aerospike_cluster_manager_api.models.connection import ConnectionProfile
from aerospike_cluster_manager_api.models.k8s_cluster import (
    ClusterHealthResponse,
    CreateK8sClusterRequest,
    CreateK8sTemplateRequest,
    HPAConfig,
    HPAResponse,
    K8sClusterDetail,
    K8sClusterEvent,
    K8sClusterSummary,
    K8sTemplateDetail,
    K8sTemplateSummary,
    OperationRequest,
    ScaleK8sClusterRequest,
    UpdateK8sClusterRequest,
    UpdateK8sTemplateRequest,
)
from aerospike_cluster_manager_api.services.k8s_service import (
    build_cr,
    build_template_cr,
    build_template_update_patch,
    build_update_patch,
    calculate_age,
    categorize_event,
    clean_cr_for_export,
    extract_detail,
    extract_health,
    extract_hpa_response,
    extract_reconciliation_status,
    extract_summary,
    extract_template_summary,
    has_update_fields,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/k8s", tags=["k8s-clusters"])

# Reusable K8s DNS-compatible name constraint for path parameters.
_K8S_NAME = Path(..., min_length=1, max_length=63, pattern=r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$")
_K8S_NAMESPACE = Path(..., min_length=1, max_length=253, pattern=r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$")


class DeleteResponse(BaseModel):
    message: str


def _map_k8s_error(e: K8sApiError) -> HTTPException:
    """Map K8sApiError status codes to appropriate HTTPException responses."""
    status_map = {404: 404, 409: 409, 422: 422, 403: 403, 401: 401}
    http_status = status_map.get(e.status, 500)
    return HTTPException(status_code=http_status, detail=e.message or e.reason)


def _require_k8s() -> None:
    if not config.K8S_MANAGEMENT_ENABLED:
        raise HTTPException(status_code=404, detail="Kubernetes management is not enabled")


def _k8s_endpoint(operation: str):
    """Decorator that wraps K8s endpoint handlers with standard error handling.

    Catches HTTPException (re-raises), K8sApiError (maps to HTTPException),
    and general Exception (logs and raises 500).
    """

    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
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
async def list_k8s_clusters(namespace: str | None = None) -> list[K8sClusterSummary]:
    _require_k8s()
    items = await k8s_client.list_clusters(namespace)

    connections = await db.get_all_connections()
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

    return [extract_summary(item, connection_id=_find_connection_id(item)) for item in items]


@router.get("/clusters/{namespace}/{name}", summary="Get K8s Aerospike cluster detail")
@_k8s_endpoint("get Kubernetes cluster")
async def get_k8s_cluster(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterDetail:
    _require_k8s()
    item = await k8s_client.get_cluster(namespace, name)
    pods_raw = await k8s_client.list_pods(
        namespace, f"app.kubernetes.io/name=aerospike-cluster,app.kubernetes.io/instance={name}"
    )
    return extract_detail(item, pods_raw)


@router.get("/clusters/{namespace}/{name}/config-drift", summary="Get cluster config drift")
@_k8s_endpoint("get cluster config drift")
async def get_cluster_config_drift(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
):
    """Compare desired spec vs applied spec and detect configuration drift."""
    from ..models.k8s_cluster import ConfigDriftResponse
    from ..services.k8s_service import compute_config_drift

    _require_k8s()
    cr = await k8s_client.get_cluster(namespace, name)
    result = compute_config_drift(cr)
    return ConfigDriftResponse(**result)


@router.get("/clusters/{namespace}/{name}/health", summary="Get cluster health summary")
@_k8s_endpoint("get cluster health")
async def get_k8s_cluster_health(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> ClusterHealthResponse:
    _require_k8s()
    item = await k8s_client.get_cluster(namespace, name)
    return extract_health(item)


@router.get("/clusters/{namespace}/{name}/reconciliation-status", summary="Get reconciliation health")
@_k8s_endpoint("get reconciliation status")
async def get_cluster_reconciliation_status(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
):
    """Get reconciliation health including circuit breaker state."""
    from ..models.k8s_cluster import ReconciliationStatus

    _require_k8s()
    cr = await k8s_client.get_cluster(namespace, name)
    result = extract_reconciliation_status(cr)
    return ReconciliationStatus(**result)


@router.get("/clusters/{namespace}/{name}/pods/{pod}/logs", summary="Get pod logs")
@_k8s_endpoint("get pod logs")
async def get_k8s_pod_logs(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
    pod: str = Path(..., min_length=1, max_length=253),
    tail: int = Query(default=500, ge=1, le=10000, description="Number of tail lines"),
    container: str | None = Query(default=None, description="Container name"),
) -> dict[str, Any]:
    _require_k8s()
    cluster_pods = await k8s_client.list_pods(namespace, f"app.kubernetes.io/instance={name}")
    pod_names = {p["name"] for p in cluster_pods}
    if pod not in pod_names:
        raise HTTPException(status_code=404, detail=f"Pod '{pod}' does not belong to cluster '{name}'")
    logs = await k8s_client.read_pod_log(namespace, pod, container=container, tail_lines=tail)
    return {"pod": pod, "logs": logs, "tailLines": tail}


@router.get("/clusters/{namespace}/{name}/yaml", summary="Get cluster CR as YAML")
@_k8s_endpoint("export cluster YAML")
async def get_k8s_cluster_yaml(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> dict[str, Any]:
    _require_k8s()
    item = await k8s_client.get_cluster(namespace, name)
    return {"yaml": clean_cr_for_export(item)}


@router.post("/clusters", status_code=201, summary="Create K8s Aerospike cluster")
@_k8s_endpoint("create Kubernetes cluster")
async def create_k8s_cluster(body: CreateK8sClusterRequest) -> K8sClusterSummary:
    _require_k8s()

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
    result = await k8s_client.create_cluster(body.namespace, cr)

    connection_id: str | None = None
    auto_connect_warning: str | None = None
    if body.auto_connect:
        try:
            service_host = f"{body.name}.{body.namespace}.svc.cluster.local"
            service_port = 3000

            now = datetime.now(UTC).isoformat()
            conn = ConnectionProfile(
                id=f"conn-{uuid.uuid4().hex[:12]}",
                name=f"[K8s] {body.name}",
                hosts=[service_host],
                port=service_port,
                clusterName=f"{body.namespace}/{body.name}",
                color="#10B981",
                createdAt=now,
                updatedAt=now,
            )
            await db.create_connection(conn)
            connection_id = conn.id
            logger.info("Auto-created connection profile for K8s cluster %s/%s", body.namespace, body.name)
        except Exception:
            auto_connect_warning = f"Cluster created but auto-connect failed for {body.namespace}/{body.name}"
            logger.warning("Failed to auto-create connection for %s/%s", body.namespace, body.name, exc_info=True)

    summary = extract_summary(result, connection_id=connection_id)
    summary.autoConnectWarning = auto_connect_warning
    return summary


@router.patch("/clusters/{namespace}/{name}", summary="Update K8s Aerospike cluster")
@_k8s_endpoint("update Kubernetes cluster")
async def update_k8s_cluster(
    body: UpdateK8sClusterRequest,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterSummary:
    _require_k8s()

    if not has_update_fields(body):
        raise HTTPException(status_code=400, detail="At least one field must be provided")

    patch = build_update_patch(body)
    result = await k8s_client.patch_cluster(namespace, name, patch)
    return extract_summary(result)


@router.delete("/clusters/{namespace}/{name}", status_code=202, summary="Delete K8s Aerospike cluster")
@_k8s_endpoint("delete Kubernetes cluster")
async def delete_k8s_cluster(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> DeleteResponse:
    _require_k8s()
    await k8s_client.delete_cluster(namespace, name)

    try:
        all_conns = await db.get_all_connections()
        k8s_prefix = f"[K8s] {name}"
        service_host = f"{name}.{namespace}.svc.cluster.local"
        for conn in all_conns:
            if conn.name == k8s_prefix or service_host in conn.hosts:
                await db.delete_connection(conn.id)
                await client_manager.close_client(conn.id)
                logger.info("Cleaned up auto-connect profile %s for deleted cluster %s/%s", conn.id, namespace, name)
    except Exception:
        logger.warning("Failed to clean up connection profiles for %s/%s", namespace, name, exc_info=True)

    return DeleteResponse(message=f"Cluster {namespace}/{name} deletion initiated")


@router.post("/clusters/{namespace}/{name}/scale", summary="Scale K8s Aerospike cluster")
@_k8s_endpoint("scale Kubernetes cluster")
async def scale_k8s_cluster(
    body: ScaleK8sClusterRequest,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterSummary:
    _require_k8s()
    patch = {"spec": {"size": body.size}}
    result = await k8s_client.patch_cluster(namespace, name, patch)
    return extract_summary(result)


# ---------------------------------------------------------------------------
# HPA endpoints
# ---------------------------------------------------------------------------


@router.get("/clusters/{namespace}/{name}/hpa", summary="Get HPA for K8s Aerospike cluster")
@_k8s_endpoint("get HPA for Kubernetes cluster")
async def get_k8s_cluster_hpa(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> HPAResponse:
    _require_k8s()
    raw = await k8s_client.get_hpa(namespace, name)
    return extract_hpa_response(raw)


@router.post(
    "/clusters/{namespace}/{name}/hpa", status_code=201, summary="Create or update HPA for K8s Aerospike cluster"
)
@_k8s_endpoint("create/update HPA for Kubernetes cluster")
async def create_or_update_k8s_cluster_hpa(
    body: HPAConfig,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> HPAResponse:
    _require_k8s()
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
        else:
            raise
    return extract_hpa_response(raw)


@router.delete("/clusters/{namespace}/{name}/hpa", status_code=202, summary="Delete HPA for K8s Aerospike cluster")
@_k8s_endpoint("delete HPA for Kubernetes cluster")
async def delete_k8s_cluster_hpa(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> DeleteResponse:
    _require_k8s()
    await k8s_client.delete_hpa(namespace, name)
    return DeleteResponse(message=f"HPA for {namespace}/{name} deleted")


# ---------------------------------------------------------------------------
# Infrastructure lookup endpoints
# ---------------------------------------------------------------------------


@router.get("/namespaces", summary="List Kubernetes namespaces")
@_k8s_endpoint("list Kubernetes namespaces")
async def list_k8s_namespaces() -> list[str]:
    _require_k8s()
    return await k8s_client.list_namespaces()


@router.get("/nodes", summary="List Kubernetes nodes with zone info")
@_k8s_endpoint("list Kubernetes nodes")
async def list_k8s_nodes() -> list[dict[str, Any]]:
    _require_k8s()
    return await k8s_client.list_nodes()


@router.get("/storageclasses", summary="List Kubernetes storage classes")
@_k8s_endpoint("list Kubernetes storage classes")
async def list_k8s_storage_classes() -> list[str]:
    _require_k8s()
    return await k8s_client.list_storage_classes()


@router.get("/secrets", summary="List K8s Secrets in a namespace")
@_k8s_endpoint("list Kubernetes secrets")
async def list_k8s_secrets(namespace: str = "aerospike") -> list[str]:
    _require_k8s()
    return await k8s_client.list_secrets(namespace)


# ---------------------------------------------------------------------------
# Template endpoints
# ---------------------------------------------------------------------------


@router.get("/templates", summary="List K8s AerospikeClusterTemplates")
@_k8s_endpoint("list Kubernetes templates")
async def list_k8s_templates() -> list[K8sTemplateSummary]:
    _require_k8s()
    items = await k8s_client.list_templates()
    return [extract_template_summary(item) for item in items]


@router.get("/templates/{name}", summary="Get K8s AerospikeClusterTemplate detail")
@_k8s_endpoint("get Kubernetes template")
async def get_k8s_template(
    name: str = _K8S_NAME,
) -> K8sTemplateDetail:
    _require_k8s()
    item = await k8s_client.get_template(name)
    metadata = item.get("metadata", {})
    return K8sTemplateDetail(
        name=metadata.get("name", ""),
        spec=item.get("spec", {}),
        status=item.get("status", {}),
        age=calculate_age(metadata.get("creationTimestamp")),
    )


@router.post("/templates", status_code=201, summary="Create K8s AerospikeClusterTemplate")
@_k8s_endpoint("create Kubernetes template")
async def create_k8s_template(body: CreateK8sTemplateRequest) -> K8sTemplateSummary:
    _require_k8s()
    cr = build_template_cr(body)
    result = await k8s_client.create_template(cr)
    return extract_template_summary(result)


@router.patch("/templates/{name}", summary="Update K8s AerospikeClusterTemplate")
@_k8s_endpoint("update Kubernetes template")
async def update_k8s_template(
    body: UpdateK8sTemplateRequest,
    name: str = _K8S_NAME,
) -> K8sTemplateSummary:
    _require_k8s()
    patch = build_template_update_patch(body)
    if not patch.get("spec"):
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await k8s_client.patch_template(name, patch)
    return extract_template_summary(result)


@router.delete("/templates/{name}", status_code=202, summary="Delete K8s AerospikeClusterTemplate")
@_k8s_endpoint("delete Kubernetes template")
async def delete_k8s_template(
    name: str = _K8S_NAME,
) -> DeleteResponse:
    _require_k8s()
    clusters = await k8s_client.list_clusters()
    referencing = [
        c.get("metadata", {}).get("name", "")
        for c in clusters
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
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
    limit: int = Query(default=50, ge=1, le=500, description="Maximum number of events to return"),
    category: str | None = Query(default=None, description="Filter events by category"),
) -> list[K8sClusterEvent]:
    _require_k8s()
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
@_k8s_endpoint("resync template for Kubernetes cluster")
async def resync_k8s_cluster_template(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterSummary:
    _require_k8s()
    patch: dict[str, Any] = {"metadata": {"annotations": {"acko.io/resync-template": "true"}}}
    result = await k8s_client.patch_cluster(namespace, name, patch)
    return extract_summary(result)


@router.post("/clusters/{namespace}/{name}/operations", summary="Trigger operation on K8s cluster")
@_k8s_endpoint("trigger operation on Kubernetes cluster")
async def trigger_k8s_cluster_operation(
    body: OperationRequest,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterSummary:
    _require_k8s()
    op_id = body.id or f"ui-{uuid.uuid4().hex[:8]}"
    operation: dict[str, Any] = {"kind": body.kind, "id": op_id}
    if body.pod_list:
        operation["podList"] = body.pod_list
    patch: dict[str, Any] = {"spec": {"operations": [operation]}}
    result = await k8s_client.patch_cluster(namespace, name, patch)
    return extract_summary(result)
