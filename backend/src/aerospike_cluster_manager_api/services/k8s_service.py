"""Business logic helpers for Kubernetes-based Aerospike cluster management.

These functions are extracted from the K8s clusters router to keep the
router thin and focused on HTTP concerns.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from aerospike_cluster_manager_api.models.k8s_cluster import (
    ClusterHealthResponse,
    CreateK8sClusterRequest,
    CreateK8sTemplateRequest,
    K8sClusterCondition,
    K8sClusterDetail,
    K8sClusterSummary,
    K8sPodStatus,
    K8sTemplateSummary,
    OperationStatusResponse,
    RackConfig,
    RackDistribution,
    UpdateK8sClusterRequest,
)


def calculate_age(creation_timestamp: str | None) -> str | None:
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


def extract_summary(item: dict[str, Any], connection_id: str | None = None) -> K8sClusterSummary:
    metadata = item.get("metadata", {})
    spec = item.get("spec", {})
    status = item.get("status", {})
    return K8sClusterSummary(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        size=spec.get("size", 0),
        image=spec.get("image", ""),
        phase=status.get("phase", "Unknown"),
        age=calculate_age(metadata.get("creationTimestamp")),
        connectionId=connection_id,
    )


def build_rack_list(racks: list[RackConfig]) -> list[dict[str, Any]]:
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


def build_pod_scheduling(sched: Any) -> dict[str, Any]:
    """Convert PodSchedulingConfig to CR-compatible podSpec fields."""
    result: dict[str, Any] = {}
    if sched.node_selector:
        result["nodeSelector"] = sched.node_selector
    if sched.tolerations:
        tols = []
        for t in sched.tolerations:
            tol: dict[str, Any] = {}
            if t.key is not None:
                tol["key"] = t.key
            tol["operator"] = t.operator
            if t.value is not None:
                tol["value"] = t.value
            if t.effect is not None:
                tol["effect"] = t.effect
            if t.toleration_seconds is not None:
                tol["tolerationSeconds"] = t.toleration_seconds
            tols.append(tol)
        result["tolerations"] = tols
    if sched.multi_pod_per_host is not None:
        result["multiPodPerHost"] = sched.multi_pod_per_host
    if sched.host_network is not None:
        result["hostNetwork"] = sched.host_network
    if sched.service_account_name:
        result["serviceAccountName"] = sched.service_account_name
    if sched.termination_grace_period is not None:
        result["terminationGracePeriodSeconds"] = sched.termination_grace_period
    return result


def build_monitoring(mon: Any) -> dict[str, Any]:
    """Convert MonitoringConfig to CR-compatible monitoring dict."""
    result: dict[str, Any] = {
        "enabled": mon.enabled,
        "port": mon.port,
    }
    if mon.exporter_image:
        result["exporterImage"] = mon.exporter_image
    if mon.service_monitor:
        sm: dict[str, Any] = {"enabled": mon.service_monitor.enabled}
        if mon.service_monitor.interval:
            sm["interval"] = mon.service_monitor.interval
        if mon.service_monitor.labels:
            sm["labels"] = mon.service_monitor.labels
        result["serviceMonitor"] = sm
    if mon.prometheus_rule:
        pr: dict[str, Any] = {"enabled": mon.prometheus_rule.enabled}
        if mon.prometheus_rule.labels:
            pr["labels"] = mon.prometheus_rule.labels
        result["prometheusRule"] = pr
    return result


def build_network_policy(policy) -> dict[str, Any]:
    """Convert a network policy model into a CR-compatible dict."""
    net_policy: dict[str, Any] = {"accessType": policy.access_type}
    if policy.alternate_access_type:
        net_policy["alternateAccessType"] = policy.alternate_access_type
    if policy.fabric_type:
        net_policy["fabricType"] = policy.fabric_type
    return net_policy


def build_cr(req: CreateK8sClusterRequest) -> dict[str, Any]:
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
        data_vol: dict[str, Any] = {
            "name": "data-vol",
            "source": {
                "persistentVolume": {
                    "storageClass": req.storage.storage_class,
                    "size": req.storage.size,
                    "volumeMode": "Filesystem",
                }
            },
            "aerospike": {"path": req.storage.mount_path},
            "cascadeDelete": req.storage.cascade_delete,
        }
        if req.storage.init_method:
            data_vol["initMethod"] = req.storage.init_method
        if req.storage.wipe_method:
            data_vol["wipeMethod"] = req.storage.wipe_method
        cr["spec"]["storage"] = {
            "volumes": [
                data_vol,
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
        cr["spec"]["monitoring"] = build_monitoring(req.monitoring)

    # Pod scheduling
    if req.pod_scheduling:
        pod_spec = cr["spec"].get("podSpec", {})
        pod_spec.update(build_pod_scheduling(req.pod_scheduling))
        cr["spec"]["podSpec"] = pod_spec

    # Template reference and overrides
    if req.template_ref:
        ref: dict[str, str] = {"name": req.template_ref.name}
        if req.template_ref.namespace:
            ref["namespace"] = req.template_ref.namespace
        cr["spec"]["templateRef"] = ref
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
        cr["spec"]["rackConfig"] = {"racks": build_rack_list(req.rack_config.racks)}

    # Network access policy
    if req.network_policy:
        cr["spec"]["aerospikeNetworkPolicy"] = build_network_policy(req.network_policy)

    # K8s node block list
    if req.k8s_node_block_list:
        cr["spec"]["k8sNodeBlockList"] = req.k8s_node_block_list

    return cr


def compute_rack_distribution(pods_status: dict) -> list[RackDistribution]:
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


def build_template_cr(req: CreateK8sTemplateRequest) -> dict[str, Any]:
    """Convert CreateK8sTemplateRequest to AerospikeClusterTemplate CR dict."""
    cr: dict[str, Any] = {
        "apiVersion": "acko.io/v1alpha1",
        "kind": "AerospikeClusterTemplate",
        "metadata": {
            "name": req.name,
            "namespace": req.namespace,
        },
        "spec": {},
    }

    if req.description:
        cr["spec"]["description"] = req.description
    if req.image:
        cr["spec"]["image"] = req.image
    if req.size is not None:
        cr["spec"]["size"] = req.size
    if req.resources:
        cr["spec"]["resources"] = {
            "requests": {"cpu": req.resources.requests.cpu, "memory": req.resources.requests.memory},
            "limits": {"cpu": req.resources.limits.cpu, "memory": req.resources.limits.memory},
        }
    if req.monitoring:
        cr["spec"]["monitoring"] = {"enabled": req.monitoring.enabled, "port": req.monitoring.port}
    if req.scheduling:
        scheduling: dict[str, Any] = {}
        if req.scheduling.pod_anti_affinity_level:
            scheduling["podAntiAffinityLevel"] = req.scheduling.pod_anti_affinity_level
        if req.scheduling.pod_management_policy:
            scheduling["podManagementPolicy"] = req.scheduling.pod_management_policy
        if scheduling:
            cr["spec"]["scheduling"] = scheduling
    if req.storage:
        storage: dict[str, Any] = {}
        if req.storage.storage_class_name:
            storage["storageClassName"] = req.storage.storage_class_name
        if req.storage.volume_mode:
            storage["volumeMode"] = req.storage.volume_mode
        if req.storage.access_modes:
            storage["accessModes"] = req.storage.access_modes
        if req.storage.size:
            storage["resources"] = {"requests": {"storage": req.storage.size}}
        if storage:
            cr["spec"]["storage"] = storage
    if req.network_policy:
        cr["spec"]["aerospikeNetworkPolicy"] = build_network_policy(req.network_policy)
    if req.aerospike_config:
        cr["spec"]["aerospikeConfig"] = {"namespaceDefaults": req.aerospike_config}

    return cr


def extract_detail(item: dict[str, Any], pods_raw: list[dict[str, Any]]) -> K8sClusterDetail:
    """Build a K8sClusterDetail from a raw CR dict and pod list."""
    metadata = item.get("metadata", {})
    spec = item.get("spec", {})
    status = item.get("status", {})

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
            id=op_status_raw.get("id"),
            kind=op_status_raw.get("kind"),
            phase=op_status_raw.get("phase"),
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
        age=calculate_age(metadata.get("creationTimestamp")),
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


def extract_health(item: dict[str, Any]) -> ClusterHealthResponse:
    """Build a ClusterHealthResponse from a raw CR dict."""
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
        rackDistribution=compute_rack_distribution(pods_status),
    )


def has_update_fields(body: UpdateK8sClusterRequest) -> bool:
    """Return True if at least one updatable field is set on the request."""
    return any(
        v is not None
        for v in (
            body.size,
            body.image,
            body.resources,
            body.monitoring,
            body.paused,
            body.enable_dynamic_config,
            body.aerospike_config,
            body.rolling_update_batch_size,
            body.max_unavailable,
            body.disable_pdb,
            body.rack_config,
            body.network_policy,
            body.k8s_node_block_list,
            body.pod_scheduling,
        )
    )


def build_update_patch(body: UpdateK8sClusterRequest) -> dict[str, Any]:
    """Build a JSON-merge patch dict from UpdateK8sClusterRequest fields."""
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
        patch["spec"]["monitoring"] = build_monitoring(body.monitoring)
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
            patch["spec"]["rackConfig"] = {"racks": build_rack_list(body.rack_config.racks)}
        else:
            patch["spec"]["rackConfig"] = {"racks": []}
    if body.network_policy is not None:
        patch["spec"]["aerospikeNetworkPolicy"] = build_network_policy(body.network_policy)
    if body.k8s_node_block_list is not None:
        patch["spec"]["k8sNodeBlockList"] = body.k8s_node_block_list
    if body.pod_scheduling is not None:
        pod_spec = patch["spec"].get("podSpec", {})
        pod_spec.update(build_pod_scheduling(body.pod_scheduling))
        patch["spec"]["podSpec"] = pod_spec
    return patch


def extract_template_summary(item: dict[str, Any]) -> K8sTemplateSummary:
    """Build a K8sTemplateSummary from a raw template CR dict."""
    metadata = item.get("metadata", {})
    spec = item.get("spec", {})
    return K8sTemplateSummary(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        image=spec.get("image"),
        size=spec.get("size"),
        age=calculate_age(metadata.get("creationTimestamp")),
        description=spec.get("description"),
    )


def clean_cr_for_export(item: dict[str, Any]) -> dict[str, Any]:
    """Strip internal metadata fields from a CR for clean YAML export."""
    metadata = dict(item.get("metadata", {}))
    for key in ("managedFields", "resourceVersion", "uid", "generation", "creationTimestamp"):
        metadata.pop(key, None)
    # Strip internal annotations that may contain sensitive data
    annotations = metadata.get("annotations")
    if annotations and isinstance(annotations, dict):
        annotations = {k: v for k, v in annotations.items() if k != "kubectl.kubernetes.io/last-applied-configuration"}
        metadata["annotations"] = annotations if annotations else None
    return {
        "apiVersion": item.get("apiVersion", "acko.io/v1alpha1"),
        "kind": item.get("kind", "AerospikeCluster"),
        "metadata": metadata,
        "spec": item.get("spec", {}),
    }
