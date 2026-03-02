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
    K8sClusterCondition,
    K8sClusterDetail,
    K8sClusterEvent,
    K8sClusterSummary,
    K8sPodStatus,
    K8sTemplateDetail,
    K8sTemplateSummary,
    OperationRequest,
    OperationStatusResponse,
    RackDistribution,
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


def _build_rack_list(racks: list) -> list[dict[str, Any]]:
    """Convert RackConfig models into CR-compatible dicts."""
    result = []
    for rack in racks:
        r: dict[str, Any] = {"id": rack.id}
        if rack.zone:
            r["zone"] = rack.zone
        if rack.region:
            r["region"] = rack.region
        if rack.max_pods_per_node is not None:
            r["maxPodsPerNode"] = rack.max_pods_per_node
        if rack.node_name:
            r["nodeName"] = rack.node_name
        result.append(r)
    return result


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

    # Template reference and overrides
    if req.template_ref:
        cr["spec"]["templateRef"] = {"name": req.template_ref}
        if req.template_overrides:
            overrides: dict[str, Any] = {}
            if req.template_overrides.image:
                overrides["image"] = req.template_overrides.image
            if req.template_overrides.size is not None:
                overrides["size"] = req.template_overrides.size
            if req.template_overrides.resources:
                overrides["podSpec"] = {
                    "aerospikeContainer": {
                        "resources": {
                            "requests": {
                                "cpu": req.template_overrides.resources.requests.cpu,
                                "memory": req.template_overrides.resources.requests.memory,
                            },
                            "limits": {
                                "cpu": req.template_overrides.resources.limits.cpu,
                                "memory": req.template_overrides.resources.limits.memory,
                            },
                        }
                    }
                }
            if overrides:
                cr["spec"]["overrides"] = overrides

    # Dynamic config update
    if req.enable_dynamic_config:
        cr["spec"]["enableDynamicConfigUpdate"] = True

    # ACL / Access Control
    if req.acl and req.acl.enabled:
        acl_config = {
            "roles": [
                {"name": r.name, "privileges": r.privileges, **({"whitelist": r.whitelist} if r.whitelist else {})}
                for r in req.acl.roles
            ],
            "users": [{"name": u.name, "secretName": u.secret_name, "roles": u.roles} for u in req.acl.users],
            "adminPolicy": {"timeout": req.acl.admin_policy_timeout},
        }
        cr["spec"]["aerospikeAccessControl"] = acl_config
        # Enable security in aerospike config
        cr["spec"]["aerospikeConfig"]["security"] = {}

    # Rolling update strategy
    if req.rolling_update:
        if req.rolling_update.batch_size is not None:
            cr["spec"]["rollingUpdateBatchSize"] = req.rolling_update.batch_size
        if req.rolling_update.max_unavailable is not None:
            cr["spec"]["maxUnavailable"] = req.rolling_update.max_unavailable
        if req.rolling_update.disable_pdb:
            cr["spec"]["disablePDB"] = True

    # Rack config
    if req.rack_config and req.rack_config.racks:
        cr["spec"]["rackConfig"] = {"racks": _build_rack_list(req.rack_config.racks)}

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

    # Merge dynamic config status and extended fields from CR status.pods map
    cr_pods_status = status.get("pods", {})
    pods = []
    for p in pods_raw:
        pod_name = p.get("name", "")
        cr_pod = cr_pods_status.get(pod_name, {})
        p["dynamicConfigStatus"] = cr_pod.get("dynamicConfigStatus")
        p["lastRestartReason"] = cr_pod.get("lastRestartReason")
        last_restart_time = cr_pod.get("lastRestartTime")
        if last_restart_time and isinstance(last_restart_time, str):
            p["lastRestartTime"] = last_restart_time
        # Rich pod status fields from operator CR status
        p["nodeId"] = cr_pod.get("nodeID")
        rack_val = cr_pod.get("rack")
        p["rackId"] = rack_val if isinstance(rack_val, int) else None
        p["configHash"] = cr_pod.get("configHash")
        p["podSpecHash"] = cr_pod.get("podSpecHash")
        pods.append(K8sPodStatus(**p))

    # Extract operation status
    op_status_raw = status.get("operationStatus")
    operation_status = None
    if op_status_raw:
        operation_status = OperationStatusResponse(
            id=op_status_raw.get("id", ""),
            kind=op_status_raw.get("kind", ""),
            phase=op_status_raw.get("phase", ""),
            completedPods=op_status_raw.get("completedPods", []),
            failedPods=op_status_raw.get("failedPods", []),
        )

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

    # Extract lastReconcileTime — may be a string or an RFC3339 timestamp
    last_reconcile_time_raw = status.get("lastReconcileTime")
    last_reconcile_time = None
    if last_reconcile_time_raw and isinstance(last_reconcile_time_raw, str):
        last_reconcile_time = last_reconcile_time_raw

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
        operationStatus=operation_status,
        failedReconcileCount=status.get("failedReconcileCount", 0),
        lastReconcileError=status.get("lastReconcileError"),
        aerospikeClusterSize=status.get("aerospikeClusterSize"),
        pendingRestartPods=status.get("pendingRestartPods", []),
        lastReconcileTime=last_reconcile_time,
        operatorVersion=status.get("operatorVersion"),
    )


def _compute_rack_distribution(pods_status: dict) -> list[RackDistribution]:
    """Group pods by rack ID for distribution display."""
    racks: dict[int, dict[str, int]] = {}
    for pod_info in pods_status.values():
        rack_id = pod_info.get("rack", 0)
        if rack_id not in racks:
            racks[rack_id] = {"id": rack_id, "total": 0, "ready": 0}
        racks[rack_id]["total"] += 1
        if pod_info.get("isRunningAndReady"):
            racks[rack_id]["ready"] += 1
    return sorted([RackDistribution(**r) for r in racks.values()], key=lambda r: r.id)


@router.get("/clusters/{namespace}/{name}/health", summary="Get cluster health summary")
@_k8s_endpoint("get cluster health")
async def get_k8s_cluster_health(
    namespace: str = _K8S_NAMESPACE,
    name: str = _K8S_NAME,
) -> ClusterHealthResponse:
    _require_k8s()
    item = await k8s_client.get_cluster(namespace, name)
    status = item.get("status", {})
    spec = item.get("spec", {})

    pods_status = status.get("pods", {})
    total_pods = len(pods_status)
    ready_pods = sum(1 for p in pods_status.values() if p.get("isRunningAndReady"))

    conditions = {c.get("type"): c.get("status") == "True" for c in status.get("conditions", [])}

    return ClusterHealthResponse(
        phase=status.get("phase", "Unknown"),
        totalPods=total_pods,
        readyPods=ready_pods,
        desiredPods=spec.get("size", 0),
        migrating=not conditions.get("MigrationComplete", True),
        available=conditions.get("Available", False),
        configApplied=conditions.get("ConfigApplied", False),
        aclSynced=conditions.get("ACLSynced", True),
        failedReconcileCount=status.get("failedReconcileCount", 0),
        pendingRestartCount=len(status.get("pendingRestartPods", [])),
        rackDistribution=_compute_rack_distribution(pods_status),
    )


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
    # Strip internal metadata fields for cleaner export
    metadata = dict(item.get("metadata", {}))
    for key in ("managedFields", "resourceVersion", "uid", "generation", "creationTimestamp"):
        metadata.pop(key, None)
    clean_cr = {
        "apiVersion": item.get("apiVersion", "acko.io/v1alpha1"),
        "kind": item.get("kind", "AerospikeCluster"),
        "metadata": metadata,
        "spec": item.get("spec", {}),
    }
    return {"yaml": clean_cr}


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
        and body.enable_dynamic_config is None
        and body.aerospike_config is None
        and body.rolling_update_batch_size is None
        and body.max_unavailable is None
        and body.disable_pdb is None
        and body.rack_config is None
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
    if body.enable_dynamic_config is not None:
        patch["spec"]["enableDynamicConfigUpdate"] = body.enable_dynamic_config
    if body.aerospike_config is not None:
        patch["spec"]["aerospikeConfig"] = body.aerospike_config
    if body.rolling_update_batch_size is not None:
        patch["spec"]["rollingUpdateBatchSize"] = body.rolling_update_batch_size
    if body.max_unavailable is not None:
        patch["spec"]["maxUnavailable"] = body.max_unavailable
    if body.disable_pdb is not None:
        patch["spec"]["disablePDB"] = body.disable_pdb
    if body.rack_config is not None:
        if body.rack_config.racks:
            patch["spec"]["rackConfig"] = {"racks": _build_rack_list(body.rack_config.racks)}
        else:
            patch["spec"]["rackConfig"] = {"racks": []}
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
    limit: int = Query(default=50, ge=1, le=500, description="Maximum number of events to return"),
) -> list[K8sClusterEvent]:
    _require_k8s()
    field_selector = f"involvedObject.name={name},involvedObject.kind=AerospikeCluster"
    events_raw = await k8s_client.list_events(namespace, field_selector)
    events = [K8sClusterEvent(**e) for e in events_raw]
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
    patch: dict[str, Any] = {
        "metadata": {
            "annotations": {
                "acko.io/resync-template": "true",
            }
        }
    }
    result = await k8s_client.patch_cluster(namespace, name, patch)
    return _extract_summary(result)


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
    return _extract_summary(result)
