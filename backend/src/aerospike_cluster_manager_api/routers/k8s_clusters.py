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

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel

from aerospike_cluster_manager_api import config, db
from aerospike_cluster_manager_api.client_manager import client_manager
from aerospike_cluster_manager_api.k8s_client import K8sApiError, k8s_client
from aerospike_cluster_manager_api.models.connection import ConnectionProfile
from aerospike_cluster_manager_api.models.k8s_cluster import (
    CreateK8sClusterRequest,
    K8sClusterCondition,
    K8sClusterDetail,
    K8sClusterEvent,
    K8sClusterSummary,
    K8sPodStatus,
    K8sTemplateDetail,
    K8sTemplateSummary,
    OperationRequest,
    ScaleK8sClusterRequest,
    UpdateK8sClusterRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/k8s", tags=["k8s-clusters"])

# Reusable K8s DNS-compatible name constraint for path parameters.
_K8S_NAME = Path(..., min_length=1, max_length=63, pattern=r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$")
_K8S_NAMESPACE = Path(..., min_length=1, max_length=253, pattern=r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$")


class DeleteResponse(BaseModel):
    message: str


def _require_k8s() -> None:
    if not config.K8S_MANAGEMENT_ENABLED:
        raise HTTPException(status_code=404, detail="Kubernetes management is not enabled")


def _map_k8s_error(e: K8sApiError) -> HTTPException:
    """Map K8sApiError status codes to appropriate HTTPException responses."""
    status_map = {404: 404, 409: 409, 422: 422, 403: 403, 401: 401}
    http_status = status_map.get(e.status, 500)
    return HTTPException(status_code=http_status, detail=e.message or e.reason)


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


def _calculate_age(creation_timestamp: str | None) -> str | None:
    if not creation_timestamp:
        return None
    try:
        created = datetime.fromisoformat(creation_timestamp.replace("Z", "+00:00"))
        delta = datetime.now(UTC) - created
        days = delta.days
        if days > 0:
            return f"{days}d"
        hours = delta.seconds // 3600
        if hours > 0:
            return f"{hours}h"
        minutes = delta.seconds // 60
        return f"{minutes}m"
    except Exception:
        return None


def _extract_summary(item: dict[str, Any], connection_id: str | None = None) -> K8sClusterSummary:
    metadata = item.get("metadata", {})
    spec = item.get("spec", {})
    status = item.get("status", {})
    return K8sClusterSummary(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        size=spec.get("size", 0),
        image=spec.get("image", ""),
        phase=status.get("phase", "Unknown"),
        age=_calculate_age(metadata.get("creationTimestamp")),
        connectionId=connection_id,
    )


def _build_cr(req: CreateK8sClusterRequest) -> dict[str, Any]:
    """Convert CreateK8sClusterRequest to AerospikeCluster CR dict."""
    ns_configs = []
    for ns in req.namespaces:
        storage_engine: dict[str, Any] = {"type": ns.storage_engine.type}
        if ns.storage_engine.type == "memory":
            storage_engine["data-size"] = ns.storage_engine.data_size or 1073741824
        else:
            mount_path = req.storage.mount_path if req.storage else "/opt/aerospike/data"
            storage_engine["file"] = ns.storage_engine.file or f"{mount_path}/{ns.name}.dat"
            storage_engine["filesize"] = ns.storage_engine.filesize or 4294967296

        ns_configs.append(
            {
                "name": ns.name,
                "replication-factor": ns.replication_factor,
                "storage-engine": storage_engine,
            }
        )

    cr: dict[str, Any] = {
        "apiVersion": "acko.io/v1alpha1",
        "kind": "AerospikeCluster",
        "metadata": {
            "name": req.name,
            "namespace": req.namespace,
        },
        "spec": {
            "size": req.size,
            "image": req.image,
            "aerospikeConfig": {
                "service": {
                    "cluster-name": req.name,
                    "proto-fd-max": 15000,
                },
                "network": {
                    "service": {"address": "any", "port": 3000},
                    "heartbeat": {"mode": "mesh", "port": 3002},
                    "fabric": {"address": "any", "port": 3001},
                },
                "namespaces": ns_configs,
                "logging": [
                    {"name": "/var/log/aerospike/aerospike.log", "context": "any info"},
                ],
            },
        },
    }

    # Storage volumes
    if req.storage:
        cr["spec"]["storage"] = {
            "volumes": [
                {
                    "name": "data-vol",
                    "source": {
                        "persistentVolume": {
                            "storageClass": req.storage.storage_class,
                            "size": req.storage.size,
                            "volumeMode": "Filesystem",
                        }
                    },
                    "aerospike": {"path": req.storage.mount_path},
                    "cascadeDelete": True,
                },
                {
                    "name": "workdir",
                    "source": {"emptyDir": {}},
                    "aerospike": {"path": "/opt/aerospike/work"},
                },
            ]
        }

    # Pod resources
    if req.resources:
        cr["spec"]["podSpec"] = {
            "aerospikeContainer": {
                "resources": {
                    "requests": {
                        "cpu": req.resources.requests.cpu,
                        "memory": req.resources.requests.memory,
                    },
                    "limits": {
                        "cpu": req.resources.limits.cpu,
                        "memory": req.resources.limits.memory,
                    },
                }
            }
        }

    # Monitoring
    if req.monitoring:
        cr["spec"]["monitoring"] = {
            "enabled": req.monitoring.enabled,
            "port": req.monitoring.port,
        }

    # Template reference
    if req.template_ref:
        cr["spec"]["templateRef"] = {"name": req.template_ref}

    # Dynamic config update
    if req.enable_dynamic_config:
        cr["spec"]["enableDynamicConfigUpdate"] = True

    return cr


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/clusters", summary="List K8s Aerospike clusters")
@_k8s_endpoint("list Kubernetes clusters")
async def list_k8s_clusters(namespace: str | None = None) -> list[K8sClusterSummary]:
    _require_k8s()
    items = await k8s_client.list_clusters(namespace)
    return [_extract_summary(item) for item in items]


@router.get("/clusters/{namespace}/{name}", summary="Get K8s Aerospike cluster detail")
@_k8s_endpoint("get Kubernetes cluster")
async def get_k8s_cluster(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterDetail:
    _require_k8s()
    item = await k8s_client.get_cluster(namespace, name)
    metadata = item.get("metadata", {})
    spec = item.get("spec", {})
    status = item.get("status", {})

    # Fetch pods for this cluster
    pods_raw = await k8s_client.list_pods(
        namespace, f"app.kubernetes.io/name=aerospike-cluster,app.kubernetes.io/instance={name}"
    )
    pods = [K8sPodStatus(**p) for p in pods_raw]

    # Extract conditions from operator status
    conditions = []
    for cond in status.get("conditions", []):
        conditions.append(
            K8sClusterCondition(
                type=cond.get("type", ""),
                status=cond.get("status", ""),
                reason=cond.get("reason"),
                message=cond.get("message"),
                lastTransitionTime=cond.get("lastTransitionTime"),
            )
        )

    return K8sClusterDetail(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        size=spec.get("size", 0),
        image=spec.get("image", ""),
        phase=status.get("phase", "Unknown"),
        phaseReason=status.get("phaseReason"),
        age=_calculate_age(metadata.get("creationTimestamp")),
        spec=spec,
        status=status,
        pods=pods,
        conditions=conditions,
    )


@router.post("/clusters", status_code=201, summary="Create K8s Aerospike cluster")
@_k8s_endpoint("create Kubernetes cluster")
async def create_k8s_cluster(body: CreateK8sClusterRequest) -> K8sClusterSummary:
    _require_k8s()

    # Validate that the target namespace exists in K8s
    existing_namespaces = await k8s_client.list_namespaces()
    if body.namespace not in existing_namespaces:
        raise HTTPException(
            status_code=400,
            detail=f"Namespace '{body.namespace}' does not exist in the Kubernetes cluster. "
            f"Available namespaces: {', '.join(sorted(existing_namespaces))}",
        )

    cr = _build_cr(body)
    result = await k8s_client.create_cluster(body.namespace, cr)

    # Auto-connect: create a connection profile pointing to the headless service
    connection_id: str | None = None
    auto_connect_warning: str | None = None
    if body.auto_connect:
        try:
            service_host = f"{body.name}.{body.namespace}.svc.cluster.local"
            now = datetime.now(UTC).isoformat()
            conn = ConnectionProfile(
                id=f"conn-{uuid.uuid4().hex[:12]}",
                name=f"[K8s] {body.name}",
                hosts=[service_host],
                port=3000,
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

    summary = _extract_summary(result, connection_id=connection_id)
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

    # Validate that at least one field is provided
    if (
        body.size is None
        and body.image is None
        and body.resources is None
        and body.monitoring is None
        and body.paused is None
    ):
        raise HTTPException(status_code=400, detail="At least one field must be provided")

    patch: dict[str, Any] = {"spec": {}}
    if body.size is not None:
        patch["spec"]["size"] = body.size
    if body.image is not None:
        patch["spec"]["image"] = body.image
    if body.resources is not None:
        patch["spec"]["podSpec"] = {
            "aerospikeContainer": {
                "resources": {
                    "requests": {"cpu": body.resources.requests.cpu, "memory": body.resources.requests.memory},
                    "limits": {"cpu": body.resources.limits.cpu, "memory": body.resources.limits.memory},
                }
            }
        }
    if body.monitoring is not None:
        patch["spec"]["monitoring"] = {
            "enabled": body.monitoring.enabled,
            "port": body.monitoring.port,
        }
    if body.paused is not None:
        patch["spec"]["paused"] = body.paused
    result = await k8s_client.patch_cluster(namespace, name, patch)
    return _extract_summary(result)


@router.delete("/clusters/{namespace}/{name}", status_code=202, summary="Delete K8s Aerospike cluster")
@_k8s_endpoint("delete Kubernetes cluster")
async def delete_k8s_cluster(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> DeleteResponse:
    _require_k8s()
    await k8s_client.delete_cluster(namespace, name)

    # Clean up auto-connected connection profiles for this cluster
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
    return _extract_summary(result)


@router.get("/namespaces", summary="List Kubernetes namespaces")
@_k8s_endpoint("list Kubernetes namespaces")
async def list_k8s_namespaces() -> list[str]:
    _require_k8s()
    return await k8s_client.list_namespaces()


@router.get("/storageclasses", summary="List Kubernetes storage classes")
@_k8s_endpoint("list Kubernetes storage classes")
async def list_k8s_storage_classes() -> list[str]:
    _require_k8s()
    return await k8s_client.list_storage_classes()


# ---------------------------------------------------------------------------
# Template endpoints
# ---------------------------------------------------------------------------


@router.get("/templates", summary="List K8s AerospikeClusterTemplates")
@_k8s_endpoint("list Kubernetes templates")
async def list_k8s_templates(namespace: str | None = None) -> list[K8sTemplateSummary]:
    _require_k8s()
    items = await k8s_client.list_templates(namespace)
    summaries = []
    for item in items:
        metadata = item.get("metadata", {})
        spec = item.get("spec", {})
        summaries.append(
            K8sTemplateSummary(
                name=metadata.get("name", ""),
                namespace=metadata.get("namespace", ""),
                image=spec.get("image"),
                size=spec.get("size"),
                age=_calculate_age(metadata.get("creationTimestamp")),
            )
        )
    return summaries


@router.get("/templates/{namespace}/{name}", summary="Get K8s AerospikeClusterTemplate detail")
@_k8s_endpoint("get Kubernetes template")
async def get_k8s_template(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sTemplateDetail:
    _require_k8s()
    item = await k8s_client.get_template(namespace, name)
    metadata = item.get("metadata", {})
    return K8sTemplateDetail(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        spec=item.get("spec", {}),
        age=_calculate_age(metadata.get("creationTimestamp")),
    )


# ---------------------------------------------------------------------------
# Cluster event & operation endpoints
# ---------------------------------------------------------------------------


@router.get("/clusters/{namespace}/{name}/events", summary="Get K8s cluster events")
@_k8s_endpoint("get Kubernetes cluster events")
async def get_k8s_cluster_events(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> list[K8sClusterEvent]:
    _require_k8s()
    field_selector = f"involvedObject.name={name},involvedObject.kind=AerospikeCluster"
    events_raw = await k8s_client.list_events(namespace, field_selector)
    return [K8sClusterEvent(**e) for e in events_raw]


@router.post("/clusters/{namespace}/{name}/operations", summary="Trigger operation on K8s cluster")
@_k8s_endpoint("trigger operation on Kubernetes cluster")
async def trigger_k8s_cluster_operation(
    body: OperationRequest,
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> K8sClusterSummary:
    _require_k8s()
    operation: dict[str, Any] = {"type": body.type}
    if body.pod_names:
        operation["podNames"] = body.pod_names
    patch: dict[str, Any] = {"spec": {"operations": [operation]}}
    result = await k8s_client.patch_cluster(namespace, name, patch)
    return _extract_summary(result)
