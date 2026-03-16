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
    HPACondition,
    HPAConfig,
    HPAResponse,
    HPAStatus,
    K8sClusterCondition,
    K8sClusterDetail,
    K8sClusterSummary,
    K8sPodStatus,
    K8sTemplateSummary,
    OperationStatusResponse,
    RackConfig,
    RackDistribution,
    StorageSpec,
    StorageVolumeConfig,
    TemplateServiceConfig,
    TemplateSnapshotStatus,
    UpdateK8sClusterRequest,
    UpdateK8sTemplateRequest,
    VolumeSpec,
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
        if rack.rack_label:
            r["rackLabel"] = rack.rack_label
        if rack.node_name:
            r["nodeName"] = rack.node_name
        if rack.aerospike_config:
            r["aerospikeConfig"] = rack.aerospike_config
        if rack.storage and rack.storage.volumes:
            r["storage"] = {"volumes": rack.storage.volumes}
        if rack.pod_spec:
            pod_spec: dict[str, Any] = {}
            if rack.pod_spec.affinity:
                pod_spec["affinity"] = rack.pod_spec.affinity
            if rack.pod_spec.tolerations:
                tols = []
                for t in rack.pod_spec.tolerations:
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
                pod_spec["tolerations"] = tols
            if rack.pod_spec.node_selector:
                pod_spec["nodeSelector"] = rack.pod_spec.node_selector
            if pod_spec:
                r["podSpec"] = pod_spec
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
    if sched.readiness_gate_enabled is not None:
        result["readinessGateEnabled"] = sched.readiness_gate_enabled
    if sched.pod_management_policy:
        result["podManagementPolicy"] = sched.pod_management_policy
    if sched.dns_policy:
        result["dnsPolicy"] = sched.dns_policy
    if sched.image_pull_secrets:
        result["imagePullSecrets"] = [{"name": s} for s in sched.image_pull_secrets]
    if sched.security_context:
        result["securityContext"] = sched.security_context
    if sched.topology_spread_constraints:
        result["topologySpreadConstraints"] = sched.topology_spread_constraints
    if sched.metadata:
        meta: dict[str, Any] = {}
        if sched.metadata.labels:
            meta["labels"] = sched.metadata.labels
        if sched.metadata.annotations:
            meta["annotations"] = sched.metadata.annotations
        if meta:
            result["metadata"] = meta
    if sched.priority_class_name:
        result["priorityClassName"] = sched.priority_class_name
    return result


def build_monitoring(mon: Any) -> dict[str, Any]:
    """Convert MonitoringConfig to CR-compatible monitoring dict."""
    result: dict[str, Any] = {
        "enabled": mon.enabled,
        "port": mon.port,
    }
    if mon.exporter_image:
        result["exporterImage"] = mon.exporter_image
    if mon.resources:
        resources: dict[str, Any] = {}
        if mon.resources.requests:
            resources["requests"] = {"cpu": mon.resources.requests.cpu, "memory": mon.resources.requests.memory}
        if mon.resources.limits:
            resources["limits"] = {"cpu": mon.resources.limits.cpu, "memory": mon.resources.limits.memory}
        if resources:
            result["resources"] = resources
    if mon.metric_labels:
        result["metricLabels"] = mon.metric_labels
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
        if mon.prometheus_rule.custom_rules:
            pr["customRules"] = mon.prometheus_rule.custom_rules
        result["prometheusRule"] = pr
    if mon.exporter_env:
        result["env"] = mon.exporter_env
    return result


def build_network_policy(policy) -> dict[str, Any]:
    """Convert a network policy model into a CR-compatible dict."""
    net_policy: dict[str, Any] = {"accessType": policy.access_type}
    if policy.alternate_access_type:
        net_policy["alternateAccessType"] = policy.alternate_access_type
    if policy.fabric_type:
        net_policy["fabricType"] = policy.fabric_type
    if policy.custom_access_network_names:
        net_policy["customAccessNetworkNames"] = policy.custom_access_network_names
    if policy.custom_alternate_access_network_names:
        net_policy["customAlternateAccessNetworkNames"] = policy.custom_alternate_access_network_names
    if policy.custom_fabric_network_names:
        net_policy["customFabricNetworkNames"] = policy.custom_fabric_network_names
    return net_policy


def build_seeds_finder_services(sfs) -> dict[str, Any]:
    """Convert SeedsFinderServicesConfig to CR-compatible dict."""
    result: dict[str, Any] = {}
    if sfs.load_balancer:
        lb: dict[str, Any] = {
            "port": sfs.load_balancer.port,
            "targetPort": sfs.load_balancer.target_port,
        }
        if sfs.load_balancer.annotations:
            lb["annotations"] = sfs.load_balancer.annotations
        if sfs.load_balancer.labels:
            lb["labels"] = sfs.load_balancer.labels
        if sfs.load_balancer.external_traffic_policy:
            lb["externalTrafficPolicy"] = sfs.load_balancer.external_traffic_policy
        if sfs.load_balancer.load_balancer_source_ranges:
            lb["loadBalancerSourceRanges"] = sfs.load_balancer.load_balancer_source_ranges
        result["loadBalancer"] = lb
    return result


def _build_volume_cr(vol: VolumeSpec) -> dict[str, Any]:
    """Convert a VolumeSpec model to an operator CRD volume dict."""
    v: dict[str, Any] = {"name": vol.name}

    # Build source
    source: dict[str, Any] = {}
    if vol.source == "persistentVolume" and vol.persistent_volume:
        pv: dict[str, Any] = {"size": vol.persistent_volume.size}
        if vol.persistent_volume.storage_class:
            pv["storageClass"] = vol.persistent_volume.storage_class
        if vol.persistent_volume.volume_mode:
            pv["volumeMode"] = vol.persistent_volume.volume_mode
        if vol.persistent_volume.access_modes:
            pv["accessModes"] = vol.persistent_volume.access_modes
        if vol.persistent_volume.labels:
            pv.setdefault("metadata", {})["labels"] = vol.persistent_volume.labels
        if vol.persistent_volume.annotations:
            pv.setdefault("metadata", {})["annotations"] = vol.persistent_volume.annotations
        if vol.persistent_volume.selector:
            pv["selector"] = vol.persistent_volume.selector
        source["persistentVolume"] = pv
    elif vol.source == "emptyDir":
        source["emptyDir"] = vol.empty_dir or {}
    elif vol.source == "secret" and vol.secret:
        source["secret"] = vol.secret
    elif vol.source == "configMap" and vol.config_map:
        source["configMap"] = vol.config_map
    elif vol.source == "hostPath" and vol.host_path:
        source["hostPath"] = vol.host_path
    v["source"] = source

    # Aerospike container mount
    if vol.aerospike:
        aero: dict[str, Any] = {"path": vol.aerospike.path}
        if vol.aerospike.read_only:
            aero["readOnly"] = True
        if vol.aerospike.sub_path:
            aero["subPath"] = vol.aerospike.sub_path
        if vol.aerospike.sub_path_expr:
            aero["subPathExpr"] = vol.aerospike.sub_path_expr
        if vol.aerospike.mount_propagation:
            aero["mountPropagation"] = vol.aerospike.mount_propagation
        v["aerospike"] = aero

    # Sidecar and init container mounts
    for field_name, cr_key in [("sidecars", "sidecars"), ("init_containers", "initContainers")]:
        attachments = getattr(vol, field_name)
        if attachments:
            items = []
            for att in attachments:
                item: dict[str, Any] = {"containerName": att.container_name, "path": att.path}
                if att.read_only:
                    item["readOnly"] = True
                if att.sub_path:
                    item["subPath"] = att.sub_path
                if att.sub_path_expr:
                    item["subPathExpr"] = att.sub_path_expr
                if att.mount_propagation:
                    item["mountPropagation"] = att.mount_propagation
                items.append(item)
            v[cr_key] = items

    # Lifecycle
    if vol.init_method:
        v["initMethod"] = vol.init_method
    if vol.wipe_method:
        v["wipeMethod"] = vol.wipe_method
    if vol.cascade_delete:
        v["cascadeDelete"] = True

    return v


def _build_storage_spec_cr(storage: StorageSpec) -> dict[str, Any]:
    """Convert a StorageSpec model to an operator CRD storage dict."""
    result: dict[str, Any] = {
        "volumes": [_build_volume_cr(vol) for vol in storage.volumes],
    }
    if storage.filesystem_volume_policy is not None:
        result["filesystemVolumePolicy"] = storage.filesystem_volume_policy
    if storage.block_volume_policy is not None:
        result["blockVolumePolicy"] = storage.block_volume_policy
    if storage.cleanup_threads is not None:
        result["cleanupThreads"] = storage.cleanup_threads
    if storage.local_storage_classes is not None:
        result["localStorageClasses"] = storage.local_storage_classes
    if storage.delete_local_storage_on_restart:
        result["deleteLocalStorageOnRestart"] = True
    return result


def build_cr(req: CreateK8sClusterRequest) -> dict[str, Any]:
    """Convert CreateK8sClusterRequest to AerospikeCluster CR dict."""
    # Determine the mount path for device-based namespaces
    _default_mount = "/opt/aerospike/data"
    if req.storage:
        if isinstance(req.storage, StorageVolumeConfig):
            _default_mount = req.storage.mount_path
        elif isinstance(req.storage, StorageSpec):
            # Use the first persistentVolume's aerospike path as the default
            for _v in req.storage.volumes:
                if _v.source == "persistentVolume" and _v.aerospike:
                    _default_mount = _v.aerospike.path
                    break

    ns_configs = []
    for ns in req.namespaces:
        storage_engine: dict[str, Any] = {"type": ns.storage_engine.type}
        if ns.storage_engine.type == "memory":
            storage_engine["data-size"] = ns.storage_engine.data_size or 1073741824
        else:
            storage_engine["file"] = ns.storage_engine.file or f"{_default_mount}/{ns.name}.dat"
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
        if isinstance(req.storage, StorageSpec):
            # New multi-volume format — pass through directly
            cr["spec"]["storage"] = _build_storage_spec_cr(req.storage)
        else:
            # Legacy single-volume format — convert to CRD volumes
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
            storage_spec: dict[str, Any] = {
                "volumes": [
                    data_vol,
                    {
                        "name": "workdir",
                        "source": {"emptyDir": {}},
                        "aerospike": {"path": "/opt/aerospike/work"},
                    },
                ]
            }
            if req.storage.cleanup_threads is not None:
                storage_spec["cleanupThreads"] = req.storage.cleanup_threads
            if req.storage.filesystem_volume_policy is not None:
                storage_spec["filesystemVolumePolicy"] = req.storage.filesystem_volume_policy
            if req.storage.block_volume_policy is not None:
                storage_spec["blockVolumePolicy"] = req.storage.block_volume_policy
            if req.storage.local_storage_classes is not None:
                storage_spec["localStorageClasses"] = req.storage.local_storage_classes
            if req.storage.delete_local_storage_on_restart is not None:
                storage_spec["deleteLocalStorageOnRestart"] = req.storage.delete_local_storage_on_restart
            cr["spec"]["storage"] = storage_spec

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
        cr["spec"]["templateRef"] = {"name": req.template_ref.name}
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
            if req.template_overrides.monitoring:
                overrides["monitoring"] = {
                    "enabled": req.template_overrides.monitoring.enabled,
                    "port": req.template_overrides.monitoring.port,
                }
            if req.template_overrides.network_policy:
                overrides["aerospikeNetworkPolicy"] = build_network_policy(req.template_overrides.network_policy)
            if req.template_overrides.enable_dynamic_config is not None:
                overrides["enableDynamicConfigUpdate"] = req.template_overrides.enable_dynamic_config
            if req.template_overrides.scheduling:
                sched = req.template_overrides.scheduling
                sched_dict: dict[str, Any] = {}
                if sched.pod_anti_affinity_level is not None:
                    sched_dict["podAntiAffinityLevel"] = sched.pod_anti_affinity_level
                if sched.pod_management_policy is not None:
                    sched_dict["podManagementPolicy"] = sched.pod_management_policy
                if sched.tolerations is not None:
                    sched_dict["tolerations"] = sched.tolerations
                if sched.node_affinity is not None:
                    sched_dict["nodeAffinity"] = sched.node_affinity
                if sched.topology_spread_constraints is not None:
                    sched_dict["topologySpreadConstraints"] = sched.topology_spread_constraints
                if sched_dict:
                    overrides["scheduling"] = sched_dict
            if req.template_overrides.storage:
                stor = req.template_overrides.storage
                stor_dict: dict[str, Any] = {}
                if stor.storage_class_name is not None:
                    stor_dict["storageClassName"] = stor.storage_class_name
                if stor.volume_mode is not None:
                    stor_dict["volumeMode"] = stor.volume_mode
                if stor.access_modes is not None:
                    stor_dict["accessModes"] = stor.access_modes
                if stor.size is not None:
                    stor_dict["size"] = stor.size
                if stor.local_pv_required is not None:
                    stor_dict["localPVRequired"] = stor.local_pv_required
                if stor_dict:
                    overrides["storage"] = stor_dict
            if req.template_overrides.rack_config:
                rc = req.template_overrides.rack_config
                rc_dict: dict[str, Any] = {}
                if rc.max_racks_per_node is not None:
                    rc_dict["maxRacksPerNode"] = rc.max_racks_per_node
                if rc_dict:
                    overrides["rackConfig"] = rc_dict
            if req.template_overrides.aerospike_config is not None:
                overrides["aerospikeConfig"] = req.template_overrides.aerospike_config
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
        rack_config: dict[str, Any] = {"racks": build_rack_list(req.rack_config.racks)}
        if req.rack_config.namespaces:
            rack_config["namespaces"] = req.rack_config.namespaces
        if req.rack_config.scale_down_batch_size:
            rack_config["scaleDownBatchSize"] = req.rack_config.scale_down_batch_size
        if req.rack_config.max_ignorable_pods:
            rack_config["maxIgnorablePods"] = req.rack_config.max_ignorable_pods
        if req.rack_config.rolling_update_batch_size:
            rack_config["rollingUpdateBatchSize"] = req.rack_config.rolling_update_batch_size
        cr["spec"]["rackConfig"] = rack_config

    # Network access policy
    if req.network_policy:
        cr["spec"]["aerospikeNetworkPolicy"] = build_network_policy(req.network_policy)

    # K8s node block list
    if req.k8s_node_block_list:
        cr["spec"]["k8sNodeBlockList"] = req.k8s_node_block_list

    # Seeds finder services (LoadBalancer for external seed discovery)
    if req.seeds_finder_services:
        cr["spec"]["seedsFinderServices"] = build_seeds_finder_services(req.seeds_finder_services)

    # Auto-generate K8s NetworkPolicy
    if req.network_policy_config:
        cr["spec"]["networkPolicyConfig"] = {
            "enabled": req.network_policy_config.enabled,
            "type": req.network_policy_config.type,
        }

    # Bandwidth shaping
    if req.bandwidth_config:
        bw: dict[str, str] = {}
        if req.bandwidth_config.ingress:
            bw["ingress"] = req.bandwidth_config.ingress
        if req.bandwidth_config.egress:
            bw["egress"] = req.bandwidth_config.egress
        if bw:
            cr["spec"]["bandwidthConfig"] = bw

    # Validation policy
    if req.validation_policy:
        cr["spec"]["validationPolicy"] = {
            "skipWorkDirValidate": req.validation_policy.skip_work_dir_validate,
        }

    # Headless service metadata
    if req.headless_service:
        svc_meta: dict[str, Any] = {}
        if req.headless_service.annotations:
            svc_meta["metadata"] = {"annotations": req.headless_service.annotations}
        if req.headless_service.labels:
            svc_meta.setdefault("metadata", {})["labels"] = req.headless_service.labels
        if svc_meta:
            cr["spec"]["headlessService"] = svc_meta

    # Pod service metadata
    if req.pod_service:
        pod_svc_meta: dict[str, Any] = {}
        if req.pod_service.annotations:
            pod_svc_meta["metadata"] = {"annotations": req.pod_service.annotations}
        if req.pod_service.labels:
            pod_svc_meta.setdefault("metadata", {})["labels"] = req.pod_service.labels
        if pod_svc_meta:
            cr["spec"]["podService"] = pod_svc_meta

    # Enable rack ID override
    if req.enable_rack_id_override is not None:
        cr["spec"]["enableRackIDOverride"] = req.enable_rack_id_override

    # Pod metadata (extra labels/annotations on pods)
    if req.pod_metadata:
        pod_spec = cr["spec"].get("podSpec", {})
        meta: dict[str, Any] = {}
        if req.pod_metadata.labels:
            meta["labels"] = req.pod_metadata.labels
        if req.pod_metadata.annotations:
            meta["annotations"] = req.pod_metadata.annotations
        if meta:
            pod_spec["metadata"] = meta
            cr["spec"]["podSpec"] = pod_spec

    # Sidecars and init containers
    if req.sidecars:
        pod_spec = cr["spec"].get("podSpec", {})
        pod_spec["sidecars"] = [s.model_dump(exclude_none=True) for s in req.sidecars]
        cr["spec"]["podSpec"] = pod_spec
    if req.init_containers:
        pod_spec = cr["spec"].get("podSpec", {})
        pod_spec["initContainers"] = [c.model_dump(exclude_none=True) for c in req.init_containers]
        cr["spec"]["podSpec"] = pod_spec

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


# Keys managed by explicit TemplateServiceConfig fields; must not be
# overwritten by extra_params so that typed fields always take precedence.
_SERVICE_CONFIG_KNOWN_KEYS = frozenset({"proto-fd-max", "feature-key-file"})


def _build_aerospike_cfg(
    aerospike_config: dict[str, Any] | None,
    service_config: TemplateServiceConfig | None,
) -> dict[str, Any]:
    """Build the ``aerospikeConfig`` sub-tree shared by create and update paths.

    ``extra_params`` is applied *first* so that explicit fields always win, and
    known keys are also stripped from ``extra_params`` to prevent accidental
    overwrites.
    """
    aerospike_cfg: dict[str, Any] = {}
    if aerospike_config is not None:
        aerospike_cfg["namespaceDefaults"] = aerospike_config
    if service_config is not None:
        svc_cfg: dict[str, Any] = {}
        # Apply extra_params first so explicit fields can overwrite them.
        if service_config.extra_params:
            svc_cfg.update(
                {k: v for k, v in service_config.extra_params.items() if k not in _SERVICE_CONFIG_KNOWN_KEYS}
            )
        if service_config.feature_key_file:
            svc_cfg["feature-key-file"] = service_config.feature_key_file
        if service_config.proto_fd_max is not None:
            svc_cfg["proto-fd-max"] = service_config.proto_fd_max
        if svc_cfg:
            aerospike_cfg["service"] = svc_cfg
    return aerospike_cfg


def build_template_cr(req: CreateK8sTemplateRequest) -> dict[str, Any]:
    """Convert CreateK8sTemplateRequest to AerospikeClusterTemplate CR dict."""
    cr: dict[str, Any] = {
        "apiVersion": "acko.io/v1alpha1",
        "kind": "AerospikeClusterTemplate",
        "metadata": {
            "name": req.name,
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
        cr["spec"]["monitoring"] = build_monitoring(req.monitoring)
    if req.scheduling:
        scheduling: dict[str, Any] = {}
        if req.scheduling.pod_anti_affinity_level:
            scheduling["podAntiAffinityLevel"] = req.scheduling.pod_anti_affinity_level
        if req.scheduling.pod_management_policy:
            scheduling["podManagementPolicy"] = req.scheduling.pod_management_policy
        if req.scheduling.tolerations:
            scheduling["tolerations"] = req.scheduling.tolerations
        if req.scheduling.node_affinity:
            scheduling["nodeAffinity"] = req.scheduling.node_affinity
        if req.scheduling.topology_spread_constraints:
            scheduling["topologySpreadConstraints"] = req.scheduling.topology_spread_constraints
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
        if req.storage.local_pv_required is not None:
            storage["localPVRequired"] = req.storage.local_pv_required
        if storage:
            cr["spec"]["storage"] = storage
    if req.network_policy:
        cr["spec"]["aerospikeNetworkPolicy"] = build_network_policy(req.network_policy)
    # Build aerospikeConfig with namespaceDefaults and service sub-sections
    aerospike_cfg = _build_aerospike_cfg(req.aerospike_config, req.service_config)
    if aerospike_cfg:
        cr["spec"]["aerospikeConfig"] = aerospike_cfg
    if req.network_config:
        net_cfg: dict[str, Any] = {}
        if req.network_config.heartbeat_mode:
            net_cfg["heartbeatMode"] = req.network_config.heartbeat_mode
        if req.network_config.heartbeat_port is not None:
            net_cfg["heartbeatPort"] = req.network_config.heartbeat_port
        if req.network_config.heartbeat_interval is not None:
            net_cfg["heartbeatInterval"] = req.network_config.heartbeat_interval
        if req.network_config.heartbeat_timeout is not None:
            net_cfg["heartbeatTimeout"] = req.network_config.heartbeat_timeout
        if net_cfg:
            cr["spec"]["networkConfig"] = net_cfg
    if req.rack_config:
        rack_cfg: dict[str, Any] = {}
        if req.rack_config.max_racks_per_node is not None:
            rack_cfg["maxRacksPerNode"] = req.rack_config.max_racks_per_node
        if rack_cfg:
            cr["spec"]["rackConfig"] = rack_cfg

    return cr


def build_template_update_patch(body: UpdateK8sTemplateRequest) -> dict[str, Any]:
    """Build a JSON-merge patch dict from UpdateK8sTemplateRequest fields."""
    patch: dict[str, Any] = {"spec": {}}
    if body.description is not None:
        patch["spec"]["description"] = body.description
    if body.image is not None:
        patch["spec"]["image"] = body.image
    if body.size is not None:
        patch["spec"]["size"] = body.size
    if body.resources is not None:
        patch["spec"]["resources"] = {
            "requests": {"cpu": body.resources.requests.cpu, "memory": body.resources.requests.memory},
            "limits": {"cpu": body.resources.limits.cpu, "memory": body.resources.limits.memory},
        }
    if body.monitoring is not None:
        patch["spec"]["monitoring"] = build_monitoring(body.monitoring)
    if body.scheduling is not None:
        scheduling: dict[str, Any] = {}
        if body.scheduling.pod_anti_affinity_level:
            scheduling["podAntiAffinityLevel"] = body.scheduling.pod_anti_affinity_level
        if body.scheduling.pod_management_policy:
            scheduling["podManagementPolicy"] = body.scheduling.pod_management_policy
        if body.scheduling.tolerations:
            scheduling["tolerations"] = body.scheduling.tolerations
        if body.scheduling.node_affinity:
            scheduling["nodeAffinity"] = body.scheduling.node_affinity
        if body.scheduling.topology_spread_constraints:
            scheduling["topologySpreadConstraints"] = body.scheduling.topology_spread_constraints
        if scheduling:
            patch["spec"]["scheduling"] = scheduling
    if body.storage is not None:
        storage: dict[str, Any] = {}
        if body.storage.storage_class_name:
            storage["storageClassName"] = body.storage.storage_class_name
        if body.storage.volume_mode:
            storage["volumeMode"] = body.storage.volume_mode
        if body.storage.access_modes:
            storage["accessModes"] = body.storage.access_modes
        if body.storage.size:
            storage["resources"] = {"requests": {"storage": body.storage.size}}
        if body.storage.local_pv_required is not None:
            storage["localPVRequired"] = body.storage.local_pv_required
        if storage:
            patch["spec"]["storage"] = storage
    if body.network_policy is not None:
        patch["spec"]["aerospikeNetworkPolicy"] = build_network_policy(body.network_policy)
    # Build aerospikeConfig with namespaceDefaults and service sub-sections
    aerospike_cfg = _build_aerospike_cfg(body.aerospike_config, body.service_config)
    if aerospike_cfg:
        patch["spec"]["aerospikeConfig"] = aerospike_cfg
    if body.network_config is not None:
        net_cfg: dict[str, Any] = {}
        if body.network_config.heartbeat_mode:
            net_cfg["heartbeatMode"] = body.network_config.heartbeat_mode
        if body.network_config.heartbeat_port is not None:
            net_cfg["heartbeatPort"] = body.network_config.heartbeat_port
        if body.network_config.heartbeat_interval is not None:
            net_cfg["heartbeatInterval"] = body.network_config.heartbeat_interval
        if body.network_config.heartbeat_timeout is not None:
            net_cfg["heartbeatTimeout"] = body.network_config.heartbeat_timeout
        if net_cfg:
            patch["spec"]["networkConfig"] = net_cfg
    if body.rack_config is not None:
        rack_cfg: dict[str, Any] = {}
        if body.rack_config.max_racks_per_node is not None:
            rack_cfg["maxRacksPerNode"] = body.rack_config.max_racks_per_node
        if rack_cfg:
            patch["spec"]["rackConfig"] = rack_cfg
    return patch


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
        # Extended operator status fields
        access_endpoints = cr_pod.get("accessEndpoints")
        p["accessEndpoints"] = access_endpoints if isinstance(access_endpoints, list) else None
        readiness_gate = cr_pod.get("readinessGateSatisfied")
        p["readinessGateSatisfied"] = readiness_gate if isinstance(readiness_gate, bool) else None
        unstable_since = cr_pod.get("unstableSince")
        p["unstableSince"] = unstable_since if isinstance(unstable_since, str) else None
        # Port and cluster fields
        service_port = cr_pod.get("servicePort")
        p["servicePort"] = service_port if isinstance(service_port, int) else None
        pod_port = cr_pod.get("podPort")
        p["podPort"] = pod_port if isinstance(pod_port, int) else None
        cluster_name = cr_pod.get("clusterName")
        p["clusterName"] = cluster_name if isinstance(cluster_name, str) else None
        # Volume status fields
        dirty_volumes = cr_pod.get("dirtyVolumes")
        p["dirtyVolumes"] = dirty_volumes if isinstance(dirty_volumes, list) else None
        initialized_volumes = cr_pod.get("initializedVolumes")
        p["initializedVolumes"] = initialized_volumes if isinstance(initialized_volumes, list) else None
        pods.append(K8sPodStatus(**p))

    # Extract operation status
    op_status_raw = status.get("operationStatus")
    operation_status = None
    if op_status_raw:
        # Resolve target pod list from spec operations matching by id
        op_id = op_status_raw.get("id")
        op_pod_list: list[str] = []
        for op in spec.get("operations", []):
            if op.get("id") == op_id:
                op_pod_list = op.get("podList", [])
                break
        operation_status = OperationStatusResponse(
            id=op_id,
            kind=op_status_raw.get("kind"),
            phase=op_status_raw.get("phase"),
            completedPods=op_status_raw.get("completedPods", []),
            failedPods=op_status_raw.get("failedPods", []),
            podList=op_pod_list,
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

    # Extract template snapshot sync status
    template_snapshot = None
    ts_raw = status.get("templateSnapshot")
    if ts_raw and isinstance(ts_raw, dict):
        template_snapshot = TemplateSnapshotStatus(
            name=ts_raw.get("name"),
            resourceVersion=ts_raw.get("resourceVersion"),
            snapshotTimestamp=ts_raw.get("snapshotTimestamp"),
            synced=ts_raw.get("synced"),
        )

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
        templateSnapshot=template_snapshot,
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
            body.seeds_finder_services,
            body.network_policy_config,
            body.acl,
            body.bandwidth_config,
            body.validation_policy,
            body.headless_service,
            body.pod_service,
            body.enable_rack_id_override,
            body.pod_metadata,
            body.sidecars,
            body.init_containers,
        )
    )


def build_update_patch(body: UpdateK8sClusterRequest) -> dict[str, Any]:
    """Build a JSON-merge patch dict from UpdateK8sClusterRequest fields."""
    patch: dict[str, Any] = {"spec": {}}
    if body.size is not None:
        patch["spec"]["size"] = body.size
    if body.image is not None:
        patch["spec"]["image"] = body.image
    if body.storage is not None:
        patch["spec"]["storage"] = _build_storage_spec_cr(body.storage)
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
            rc: dict[str, Any] = {"racks": build_rack_list(body.rack_config.racks)}
            if body.rack_config.namespaces:
                rc["namespaces"] = body.rack_config.namespaces
            if body.rack_config.scale_down_batch_size:
                rc["scaleDownBatchSize"] = body.rack_config.scale_down_batch_size
            if body.rack_config.max_ignorable_pods:
                rc["maxIgnorablePods"] = body.rack_config.max_ignorable_pods
            if body.rack_config.rolling_update_batch_size:
                rc["rollingUpdateBatchSize"] = body.rack_config.rolling_update_batch_size
            patch["spec"]["rackConfig"] = rc
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
    if body.seeds_finder_services is not None:
        patch["spec"]["seedsFinderServices"] = build_seeds_finder_services(body.seeds_finder_services)
    if body.network_policy_config is not None:
        patch["spec"]["networkPolicyConfig"] = {
            "enabled": body.network_policy_config.enabled,
            "type": body.network_policy_config.type,
        }
    if body.acl is not None:
        if body.acl.enabled:
            patch["spec"]["aerospikeAccessControl"] = {
                "roles": [
                    {"name": r.name, "privileges": r.privileges, **({"whitelist": r.whitelist} if r.whitelist else {})}
                    for r in (body.acl.roles or [])
                ],
                "users": [
                    {"name": u.name, "secretName": u.secret_name, "roles": u.roles} for u in (body.acl.users or [])
                ],
                "adminPolicy": {"timeout": body.acl.admin_policy_timeout},
            }
            patch["spec"].setdefault("aerospikeConfig", {})["security"] = {}
        else:
            patch["spec"]["aerospikeAccessControl"] = None
    if body.bandwidth_config is not None:
        bw: dict[str, str] = {}
        if body.bandwidth_config.ingress:
            bw["ingress"] = body.bandwidth_config.ingress
        if body.bandwidth_config.egress:
            bw["egress"] = body.bandwidth_config.egress
        patch["spec"]["bandwidthConfig"] = bw if bw else None
    if body.validation_policy is not None:
        patch["spec"]["validationPolicy"] = {
            "skipWorkDirValidate": body.validation_policy.skip_work_dir_validate,
        }
    if body.headless_service is not None:
        svc_meta: dict[str, Any] = {"metadata": {}}
        if body.headless_service.annotations:
            svc_meta["metadata"]["annotations"] = body.headless_service.annotations
        if body.headless_service.labels:
            svc_meta["metadata"]["labels"] = body.headless_service.labels
        patch["spec"]["headlessService"] = svc_meta
    if body.pod_service is not None:
        pod_svc: dict[str, Any] = {"metadata": {}}
        if body.pod_service.annotations:
            pod_svc["metadata"]["annotations"] = body.pod_service.annotations
        if body.pod_service.labels:
            pod_svc["metadata"]["labels"] = body.pod_service.labels
        patch["spec"]["podService"] = pod_svc
    if body.enable_rack_id_override is not None:
        patch["spec"]["enableRackIDOverride"] = body.enable_rack_id_override
    if body.pod_metadata is not None:
        pod_spec = patch["spec"].get("podSpec", {})
        pod_meta: dict[str, Any] = {}
        if body.pod_metadata.labels:
            pod_meta["labels"] = body.pod_metadata.labels
        if body.pod_metadata.annotations:
            pod_meta["annotations"] = body.pod_metadata.annotations
        pod_spec["metadata"] = pod_meta if pod_meta else None
        patch["spec"]["podSpec"] = pod_spec
    if body.sidecars is not None:
        pod_spec = patch["spec"].get("podSpec", {})
        pod_spec["sidecars"] = [s.model_dump(exclude_none=True) for s in body.sidecars]
        patch["spec"]["podSpec"] = pod_spec
    if body.init_containers is not None:
        pod_spec = patch["spec"].get("podSpec", {})
        pod_spec["initContainers"] = [c.model_dump(exclude_none=True) for c in body.init_containers]
        patch["spec"]["podSpec"] = pod_spec
    return patch


def extract_template_summary(item: dict[str, Any]) -> K8sTemplateSummary:
    """Build a K8sTemplateSummary from a raw template CR dict."""
    metadata = item.get("metadata", {})
    spec = item.get("spec", {})
    status = item.get("status", {})
    used_by = status.get("usedBy", []) if isinstance(status, dict) else []
    return K8sTemplateSummary(
        name=metadata.get("name", ""),
        image=spec.get("image"),
        size=spec.get("size"),
        age=calculate_age(metadata.get("creationTimestamp")),
        description=spec.get("description"),
        usedBy=used_by if isinstance(used_by, list) else [],
    )


_EVENT_CATEGORY_MAP: dict[str, str] = {
    # Rolling Restart
    "RollingRestartStarted": "Rolling Restart",
    "RollingRestartCompleted": "Rolling Restart",
    "RestartFailed": "Rolling Restart",
    "PodRestarted": "Rolling Restart",
    # Quiesce
    "QuiesceStarted": "Rolling Restart",
    "QuiesceCompleted": "Rolling Restart",
    "QuiesceFailed": "Rolling Restart",
    # Config
    "ConfigMapCreated": "Configuration",
    "ConfigMapUpdated": "Configuration",
    "DynamicConfigApplied": "Configuration",
    "DynamicConfigStatusFailed": "Configuration",
    "DynamicConfigRollback": "Configuration",
    # StatefulSet / Rack
    "StatefulSetCreated": "Rack Management",
    "StatefulSetUpdated": "Rack Management",
    "RackScaled": "Scaling",
    "RackRemoved": "Rack Management",
    # ACL
    "ACLSyncStarted": "ACL Security",
    "ACLSyncCompleted": "ACL Security",
    "ACLSyncFailed": "ACL Security",
    # PDB
    "PDBCreated": "Network",
    "PDBUpdated": "Network",
    # Service
    "ServiceCreated": "Network",
    "ServiceUpdated": "Network",
    # Lifecycle
    "ClusterCreated": "Lifecycle",
    "ClusterDeletionStarted": "Lifecycle",
    "FinalizerRemoved": "Lifecycle",
    "ReconcileError": "Lifecycle",
    # Template
    "TemplateApplied": "Template",
    "TemplateOutOfSync": "Template",
    # Readiness
    "ReadinessGateUpdated": "Lifecycle",
    # PVC
    "PVCCleanupCompleted": "Scaling",
    "PVCCleanupFailed": "Scaling",
    # Circuit Breaker
    "CircuitBreakerActive": "Circuit Breaker",
    "CircuitBreakerReset": "Circuit Breaker",
    # Misc
    "WarmRestartTriggered": "Rolling Restart",
    "PodRestartTriggered": "Rolling Restart",
    "NetworkPolicyCreated": "Network",
    "NetworkPolicyUpdated": "Network",
    "MonitoringConfigured": "Monitoring",
}


def categorize_event(reason: str | None) -> str:
    if not reason:
        return "Other"
    return _EVENT_CATEGORY_MAP.get(reason, "Other")


def compute_config_drift(cr: dict) -> dict:
    """Compare spec vs status.appliedSpec and group pods by config hash."""
    spec = cr.get("spec", {})
    status = cr.get("status", {})
    applied_spec = status.get("appliedSpec", {})

    # Find changed fields between spec and appliedSpec
    changed_fields = []
    if applied_spec:
        for key in set(list(spec.keys()) + list(applied_spec.keys())):
            if key in ("aerospikeConfig",):
                # Deep compare for aerospikeConfig
                spec_val = spec.get(key, {})
                applied_val = applied_spec.get(key, {})
                if spec_val != applied_val:
                    changed_fields.append(key)
            else:
                if spec.get(key) != applied_spec.get(key):
                    changed_fields.append(key)

    has_drift = len(changed_fields) > 0

    # Group pods by configHash + podSpecHash
    pods_status = status.get("pods", {})
    hash_groups: dict[str, dict] = {}
    desired_config_hash = None

    for pod_name, pod_status in pods_status.items():
        if isinstance(pod_status, dict):
            config_hash = pod_status.get("configHash", "")
            pod_spec_hash = pod_status.get("podSpecHash", "")
            key = f"{config_hash}|{pod_spec_hash}"

            if key not in hash_groups:
                hash_groups[key] = {
                    "configHash": config_hash,
                    "podSpecHash": pod_spec_hash,
                    "pods": [],
                    "isCurrent": False,
                }
            hash_groups[key]["pods"].append(pod_name)

    # The most common hash group is likely "current"
    if hash_groups:
        max_group_key = max(hash_groups, key=lambda k: len(hash_groups[k]["pods"]))
        hash_groups[max_group_key]["isCurrent"] = True
        desired_config_hash = hash_groups[max_group_key].get("configHash")

    # Check if pods have mismatched hashes (pod-level drift)
    if len(hash_groups) > 1:
        has_drift = True

    # Extract aerospikeConfig for desired vs applied comparison
    desired_config = spec.get("aerospikeConfig")
    applied_config = applied_spec.get("aerospikeConfig") if applied_spec else None

    return {
        "hasDrift": has_drift,
        "inSync": not has_drift,
        "changedFields": changed_fields,
        "podHashGroups": list(hash_groups.values()),
        "desiredConfigHash": desired_config_hash,
        "desiredConfig": desired_config,
        "appliedConfig": applied_config,
    }


def extract_migration_status(cluster_cr: dict) -> dict:
    """Extract migration info from the CR's status section.

    Handles gracefully when migration status fields are missing/null,
    which is expected when the operator hasn't populated them yet.
    """
    status = cluster_cr.get("status", {})

    # Extract top-level migration status from status.migrationStatus
    migration_status = status.get("migrationStatus", {}) or {}
    in_progress = migration_status.get("inProgress", False)
    remaining_partitions = migration_status.get("remainingPartitions", 0)
    last_checked = migration_status.get("lastChecked")

    # Extract per-pod migration info from status.pods[].migratingPartitions
    pods_status = status.get("pods", {}) or {}
    pod_migration_list = []
    total_migrating = 0

    if isinstance(pods_status, dict):
        for pod_name, pod_info in pods_status.items():
            if isinstance(pod_info, dict):
                migrating_partitions = pod_info.get("migratingPartitions", 0) or 0
                total_migrating += migrating_partitions
                if migrating_partitions > 0:
                    pod_migration_list.append(
                        {
                            "podName": pod_name,
                            "migratingPartitions": migrating_partitions,
                        }
                    )
    elif isinstance(pods_status, list):
        for pod_info in pods_status:
            if isinstance(pod_info, dict):
                pod_name = pod_info.get("name", pod_info.get("podName", "unknown"))
                migrating_partitions = pod_info.get("migratingPartitions", 0) or 0
                total_migrating += migrating_partitions
                if migrating_partitions > 0:
                    pod_migration_list.append(
                        {
                            "podName": pod_name,
                            "migratingPartitions": migrating_partitions,
                        }
                    )

    # If top-level migration status is missing, infer from per-pod data
    if not migration_status:
        in_progress = total_migrating > 0
        remaining_partitions = total_migrating

    # Also check phase for migration indication
    phase = status.get("phase", "")
    if phase == "WaitingForMigration" and not in_progress:
        in_progress = True

    # Ensure consistency: if not in progress, don't report migrating pods
    if not in_progress:
        pod_migration_list = []
        remaining_partitions = 0

    return {
        "inProgress": in_progress,
        "remainingPartitions": remaining_partitions,
        "lastChecked": last_checked,
        "pods": pod_migration_list,
    }


def extract_reconciliation_status(cr: dict) -> dict:
    """Extract reconciliation health info including circuit breaker state."""
    status = cr.get("status", {})
    phase = status.get("phase", "Unknown")
    failed_count = status.get("failedReconcileCount", 0)
    last_error = status.get("lastReconcileError")
    last_time = status.get("lastReconcileTime")

    threshold = 10
    circuit_breaker_active = failed_count >= threshold

    # Estimate backoff: min(30s * 2^count, 300s)
    backoff_seconds = None
    if circuit_breaker_active:
        backoff_seconds = min(30 * (2**failed_count), 300)

    return {
        "circuitBreakerActive": circuit_breaker_active,
        "failedReconcileCount": failed_count,
        "circuitBreakerThreshold": threshold,
        "lastReconcileError": last_error,
        "lastReconcileTime": last_time,
        "estimatedBackoffSeconds": backoff_seconds,
        "phase": phase,
    }


def extract_reconciliation_health(cr: dict) -> dict:
    """Extract reconciliation health summary from the CR status fields."""
    status = cr.get("status", {})
    phase = status.get("phase", "Unknown")
    phase_reason = status.get("phaseReason")
    failed_count = status.get("failedReconcileCount", 0)
    last_error = status.get("lastReconcileError")
    operator_version = status.get("operatorVersion")

    # Determine health_status based on phase and failed count
    if phase in ("Running", "Completed"):
        if failed_count == 0:
            health_status = "healthy"
        elif failed_count < 5:
            health_status = "warning"
        else:
            health_status = "critical"
    elif phase in ("Error", "Failed"):
        health_status = "critical"
    elif phase in ("Pending", "Initializing", "ScalingUp", "ScalingDown", "RollingRestart"):
        health_status = "warning" if failed_count > 0 else "healthy"
    else:
        health_status = "warning" if failed_count > 0 else "healthy"

    return {
        "failedReconcileCount": failed_count,
        "lastReconcileError": last_error,
        "phase": phase,
        "phaseReason": phase_reason,
        "operatorVersion": operator_version,
        "healthStatus": health_status,
    }


def extract_hpa_response(raw: dict[str, Any]) -> HPAResponse:
    """Build an HPAResponse from a raw HPA dict (from to_dict())."""
    spec = raw.get("spec", {})
    status_raw = raw.get("status", {})

    min_replicas = spec.get("min_replicas", 1)
    max_replicas = spec.get("max_replicas", 1)

    cpu_target: int | None = None
    memory_target: int | None = None
    for metric in spec.get("metrics", []):
        resource = metric.get("resource", {})
        target = resource.get("target", {})
        metric_name = resource.get("name", "")
        if metric_name == "cpu" and target.get("average_utilization") is not None:
            cpu_target = target["average_utilization"]
        elif metric_name == "memory" and target.get("average_utilization") is not None:
            memory_target = target["average_utilization"]

    conditions = []
    for cond in status_raw.get("conditions", []) or []:
        last_time = cond.get("last_transition_time")
        if last_time and not isinstance(last_time, str):
            last_time = last_time.isoformat() if hasattr(last_time, "isoformat") else str(last_time)
        conditions.append(
            HPACondition(
                type=cond.get("type", ""),
                status=cond.get("status", ""),
                reason=cond.get("reason"),
                message=cond.get("message"),
                lastTransitionTime=last_time,
            )
        )

    # Use model_construct to bypass the at_least_one_metric validator — this function reads
    # an existing K8s HPA which may have custom/external metrics not tracked by our model.
    config = HPAConfig.model_construct(
        min_replicas=min_replicas,
        max_replicas=max_replicas,
        cpu_target_percent=cpu_target,
        memory_target_percent=memory_target,
    )
    return HPAResponse(
        enabled=True,
        config=config,
        status=HPAStatus(
            currentReplicas=status_raw.get("current_replicas", 0),
            desiredReplicas=status_raw.get("desired_replicas", 0),
            conditions=conditions,
        ),
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
