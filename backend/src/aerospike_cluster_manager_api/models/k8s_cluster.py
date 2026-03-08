from __future__ import annotations

import logging
import re
import warnings
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

logger = logging.getLogger(__name__)


class AerospikeNamespaceStorage(BaseModel):
    model_config = {"populate_by_name": True}

    type: Literal["memory", "device"] = Field(default="memory", description="memory or device")
    data_size: int | None = Field(default=1073741824, alias="dataSize", description="For memory type, in bytes")
    file: str | None = Field(default=None, description="For device type, data file path")
    filesize: int | None = Field(default=None, description="For device type, max data file size in bytes")


class AerospikeNamespaceConfig(BaseModel):
    model_config = {"populate_by_name": True}

    name: str = Field(default="test", min_length=1, max_length=63)
    replication_factor: int = Field(default=1, ge=1, le=8, alias="replicationFactor")
    storage_engine: AerospikeNamespaceStorage = Field(default_factory=AerospikeNamespaceStorage, alias="storageEngine")


class StorageVolumeConfig(BaseModel):
    model_config = {"populate_by_name": True}

    storage_class: str = Field(default="standard", alias="storageClass")
    size: str = Field(default="10Gi", pattern=r"^[0-9]+[KMGTPE]i$")
    mount_path: str = Field(default="/opt/aerospike/data", alias="mountPath")
    init_method: Literal["none", "deleteFiles", "dd", "blkdiscard", "headerCleanup"] | None = Field(
        default=None, alias="initMethod", description="Volume initialization method"
    )
    wipe_method: (
        Literal["none", "deleteFiles", "dd", "blkdiscard", "headerCleanup", "blkdiscardWithHeaderCleanup"] | None
    ) = Field(default=None, alias="wipeMethod", description="Volume wipe method for dirty volumes")
    cascade_delete: bool = Field(default=True, alias="cascadeDelete", description="Delete PVCs on CR deletion")


class NetworkAccessConfig(BaseModel):
    """Network access type configuration for clients."""

    model_config = {"populate_by_name": True}

    access_type: Literal["pod", "hostInternal", "hostExternal", "configuredIP"] = Field(
        default="pod", alias="accessType", description="How clients access Aerospike service"
    )
    alternate_access_type: Literal["pod", "hostInternal", "hostExternal", "configuredIP"] | None = Field(
        default=None, alias="alternateAccessType", description="Alternate network access type"
    )
    fabric_type: Literal["pod", "hostInternal", "hostExternal", "configuredIP"] | None = Field(
        default=None, alias="fabricType", description="Network type for inter-node communication"
    )


def _parse_cpu_millis(cpu: str) -> float:
    """Convert K8s CPU string to millicores for comparison."""
    if cpu.endswith("m"):
        return float(cpu[:-1])
    return float(cpu) * 1000


_MEMORY_UNITS: dict[str, int] = {"Ki": 1, "Mi": 2, "Gi": 3, "Ti": 4, "Pi": 5, "Ei": 6}


def _parse_memory_bytes(mem: str) -> float:
    """Convert K8s memory string to bytes for comparison."""
    m = re.match(r"^([0-9]+(?:\.[0-9]+)?)([KMGTPE]i)$", mem)
    if not m:
        return 0
    value = float(m.group(1))
    unit = m.group(2)
    return value * (1024 ** _MEMORY_UNITS.get(unit, 0))


# Minimum recommended resource thresholds for Aerospike pods.
_MIN_CPU_MILLIS = 100  # 100m
_MIN_MEMORY_BYTES = 256 * 1024 * 1024  # 256Mi


class ResourceSpec(BaseModel):
    cpu: str = Field(default="1", pattern=r"^[0-9]+(\.[0-9]+)?m?$")
    memory: str = Field(default="2Gi", pattern=r"^[0-9]+(\.[0-9]+)?[KMGTPE]i$")

    @field_validator("cpu")
    @classmethod
    def warn_cpu_minimum(cls, v: str) -> str:
        millis = _parse_cpu_millis(v)
        if millis < _MIN_CPU_MILLIS:
            warnings.warn(
                f"CPU value '{v}' ({millis:.0f}m) is below the recommended minimum of 100m. "
                "Aerospike may not function properly with insufficient CPU resources.",
                UserWarning,
                stacklevel=2,
            )
            logger.warning("CPU value '%s' is below recommended minimum of 100m", v)
        return v

    @field_validator("memory")
    @classmethod
    def warn_memory_minimum(cls, v: str) -> str:
        mem_bytes = _parse_memory_bytes(v)
        if mem_bytes < _MIN_MEMORY_BYTES:
            warnings.warn(
                f"Memory value '{v}' is below the recommended minimum of 256Mi. "
                "Aerospike may not function properly with insufficient memory.",
                UserWarning,
                stacklevel=2,
            )
            logger.warning("Memory value '%s' is below recommended minimum of 256Mi", v)
        return v


class ResourceConfig(BaseModel):
    requests: ResourceSpec = Field(default_factory=lambda: ResourceSpec(cpu="500m", memory="1Gi"))
    limits: ResourceSpec = Field(default_factory=lambda: ResourceSpec(cpu="2", memory="4Gi"))

    @model_validator(mode="after")
    def limits_gte_requests(self) -> ResourceConfig:
        if _parse_cpu_millis(self.limits.cpu) < _parse_cpu_millis(self.requests.cpu):
            raise ValueError(f"CPU limit ({self.limits.cpu}) must be >= request ({self.requests.cpu})")
        if _parse_memory_bytes(self.limits.memory) < _parse_memory_bytes(self.requests.memory):
            raise ValueError(f"Memory limit ({self.limits.memory}) must be >= request ({self.requests.memory})")
        return self


class TolerationConfig(BaseModel):
    """Kubernetes toleration for pod scheduling."""

    model_config = {"populate_by_name": True}

    key: str | None = None
    operator: Literal["Exists", "Equal"] = Field(default="Equal")
    value: str | None = None
    effect: Literal["NoSchedule", "PreferNoSchedule", "NoExecute", ""] | None = None
    toleration_seconds: int | None = Field(default=None, alias="tolerationSeconds")


class PodSchedulingConfig(BaseModel):
    """Pod scheduling configuration (nodeSelector, tolerations, affinity)."""

    model_config = {"populate_by_name": True}

    node_selector: dict[str, str] | None = Field(
        default=None, alias="nodeSelector", description="Node labels for pod scheduling"
    )
    tolerations: list[TolerationConfig] | None = Field(default=None, description="Pod tolerations")
    multi_pod_per_host: bool | None = Field(
        default=None, alias="multiPodPerHost", description="Allow multiple pods per node"
    )
    host_network: bool | None = Field(default=None, alias="hostNetwork", description="Enable host networking")
    service_account_name: str | None = Field(
        default=None, alias="serviceAccountName", description="ServiceAccount to use"
    )
    termination_grace_period: int | None = Field(
        default=None, ge=0, alias="terminationGracePeriodSeconds", description="Grace period for termination"
    )


class ServiceMonitorConfig(BaseModel):
    """ServiceMonitor configuration for Prometheus Operator."""

    model_config = {"populate_by_name": True}

    enabled: bool = Field(default=False)
    interval: str | None = Field(default=None, description="Scrape interval (e.g. '30s')")
    labels: dict[str, str] | None = Field(default=None, description="Additional labels for discovery")


class PrometheusRuleConfig(BaseModel):
    """PrometheusRule configuration for Aerospike alerts."""

    model_config = {"populate_by_name": True}

    enabled: bool = Field(default=False)
    labels: dict[str, str] | None = Field(default=None, description="Additional labels for discovery")


class MonitoringConfig(BaseModel):
    """Monitoring configuration for the cluster."""

    model_config = {"populate_by_name": True}

    enabled: bool = Field(default=False)
    port: int = Field(default=9145, ge=1024, le=65535)
    exporter_image: str | None = Field(default=None, alias="exporterImage", description="Prometheus exporter image")
    service_monitor: ServiceMonitorConfig | None = Field(
        default=None, alias="serviceMonitor", description="ServiceMonitor configuration"
    )
    prometheus_rule: PrometheusRuleConfig | None = Field(
        default=None, alias="prometheusRule", description="PrometheusRule configuration"
    )


class ACLRoleSpec(BaseModel):
    """Aerospike role definition."""

    model_config = {"populate_by_name": True}

    name: str = Field(min_length=1, max_length=63)
    privileges: list[str] = Field(default_factory=lambda: ["read-write"])
    whitelist: list[str] | None = Field(default=None, description="CIDR allowlist")


class ACLUserSpec(BaseModel):
    """Aerospike user definition."""

    model_config = {"populate_by_name": True}

    name: str = Field(min_length=1, max_length=63)
    secret_name: str = Field(alias="secretName", description="K8s Secret containing password")
    roles: list[str] = Field(default_factory=lambda: ["user-admin"])


class ACLConfig(BaseModel):
    """Access control configuration."""

    model_config = {"populate_by_name": True}

    enabled: bool = Field(default=False)
    roles: list[ACLRoleSpec] = Field(default_factory=list)
    users: list[ACLUserSpec] = Field(default_factory=list)
    admin_policy_timeout: int = Field(default=2000, ge=100, le=30000, alias="adminPolicyTimeout")


class RackConfig(BaseModel):
    """Rack configuration for zone-aware deployment."""

    model_config = {"populate_by_name": True}

    id: int = Field(ge=1, le=100, description="Rack ID (must be unique)")
    zone: str | None = Field(default=None, description="K8s zone for node affinity")
    region: str | None = Field(default=None, description="K8s region for node affinity")
    max_pods_per_node: int | None = Field(default=None, ge=1, alias="maxPodsPerNode")
    node_name: str | None = Field(default=None, alias="nodeName", description="Specific node name")


class RackAwareConfig(BaseModel):
    """Multi-rack deployment configuration."""

    model_config = {"populate_by_name": True}

    racks: list[RackConfig] = Field(default_factory=list, max_length=10)

    @field_validator("racks")
    @classmethod
    def unique_rack_ids(cls, v: list[RackConfig]) -> list[RackConfig]:
        ids = [r.id for r in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Rack IDs must be unique")
        return v


class RollingUpdateConfig(BaseModel):
    """Rolling update strategy configuration."""

    model_config = {"populate_by_name": True}

    batch_size: int | None = Field(default=None, ge=1, alias="batchSize", description="Pods to restart in parallel")
    max_unavailable: str | None = Field(
        default=None, alias="maxUnavailable", description="Max unavailable (e.g. '1' or '25%')"
    )
    disable_pdb: bool = Field(default=False, alias="disablePDB")


class OperationStatusResponse(BaseModel):
    """Current operation status from cluster status."""

    model_config = {"populate_by_name": True}

    id: str | None = None
    kind: str | None = None
    phase: str | None = None
    completed_pods: list[str] = Field(default_factory=list, alias="completedPods")
    failed_pods: list[str] = Field(default_factory=list, alias="failedPods")


class TemplateOverrides(BaseModel):
    """Overrides to apply on top of template defaults."""

    model_config = {"populate_by_name": True}

    image: str | None = None
    size: int | None = Field(default=None, ge=1, le=8)
    resources: ResourceConfig | None = None


class TemplateRefConfig(BaseModel):
    """Reference to an AerospikeClusterTemplate."""

    name: str
    namespace: str | None = None

    model_config = {"populate_by_name": True}


class CreateK8sClusterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=63, pattern=r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$")
    namespace: str = Field(
        default="aerospike",
        min_length=1,
        max_length=253,
        pattern=r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$",
    )
    size: int = Field(ge=1, le=8)
    image: str = Field(
        default="aerospike:ce-8.1.1.1",
        pattern=r"^[a-z0-9]([a-z0-9._/-]*[a-z0-9])?:[a-zA-Z0-9._-]+$",
    )
    namespaces: list[AerospikeNamespaceConfig] = Field(
        default_factory=lambda: [AerospikeNamespaceConfig()],
        max_length=5,
    )
    storage: StorageVolumeConfig | None = None
    resources: ResourceConfig | None = None
    monitoring: MonitoringConfig | None = None
    template_ref: TemplateRefConfig | None = Field(
        default=None,
        alias="templateRef",
        description="Reference to AerospikeClusterTemplate (name + optional namespace)",
    )

    @field_validator("template_ref", mode="before")
    @classmethod
    def _normalize_template_ref(cls, v: Any) -> Any:
        """Accept a plain string for backward compatibility."""
        if isinstance(v, str):
            return TemplateRefConfig(name=v)
        return v

    template_overrides: TemplateOverrides | None = Field(
        default=None, alias="templateOverrides", description="Fields to override from template"
    )
    acl: ACLConfig | None = Field(default=None, alias="acl")
    rolling_update: RollingUpdateConfig | None = Field(default=None, alias="rollingUpdate")
    rack_config: RackAwareConfig | None = Field(default=None, alias="rackConfig")
    enable_dynamic_config: bool = Field(default=False, alias="enableDynamicConfig")
    auto_connect: bool = Field(default=True, alias="autoConnect")
    network_policy: NetworkAccessConfig | None = Field(default=None, alias="networkPolicy")
    k8s_node_block_list: list[str] | None = Field(default=None, alias="k8sNodeBlockList")
    pod_scheduling: PodSchedulingConfig | None = Field(
        default=None, alias="podScheduling", description="Pod scheduling configuration"
    )

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def replication_factor_lte_size(self) -> CreateK8sClusterRequest:
        for ns in self.namespaces:
            if ns.replication_factor > self.size:
                raise ValueError(
                    f"Namespace '{ns.name}' replication-factor ({ns.replication_factor}) "
                    f"must be <= cluster size ({self.size})"
                )
        return self


class UpdateK8sClusterRequest(BaseModel):
    size: int | None = Field(default=None, ge=1, le=8)
    image: str | None = Field(
        default=None,
        pattern=r"^[a-z0-9]([a-z0-9._/-]*[a-z0-9])?:[a-zA-Z0-9._-]+$",
    )
    resources: ResourceConfig | None = None
    monitoring: MonitoringConfig | None = None
    paused: bool | None = None
    enable_dynamic_config: bool | None = Field(default=None, alias="enableDynamicConfig")
    aerospike_config: dict[str, Any] | None = Field(default=None, alias="aerospikeConfig")
    rolling_update_batch_size: int | None = Field(
        default=None, ge=1, alias="rollingUpdateBatchSize", description="Pods to restart in parallel"
    )
    max_unavailable: str | None = Field(
        default=None, alias="maxUnavailable", description="Max unavailable (e.g. '1' or '25%')"
    )
    disable_pdb: bool | None = Field(default=None, alias="disablePDB")
    rack_config: RackAwareConfig | None = Field(default=None, alias="rackConfig")
    network_policy: NetworkAccessConfig | None = Field(default=None, alias="networkPolicy")
    k8s_node_block_list: list[str] | None = Field(default=None, alias="k8sNodeBlockList")
    pod_scheduling: PodSchedulingConfig | None = Field(
        default=None, alias="podScheduling", description="Pod scheduling configuration"
    )

    model_config = {"populate_by_name": True}


class ScaleK8sClusterRequest(BaseModel):
    size: int = Field(ge=1, le=8)


class K8sPodStatus(BaseModel):
    name: str
    podIP: str | None = None
    hostIP: str | None = None
    isReady: bool = False
    phase: str = "Unknown"
    image: str | None = None
    dynamicConfigStatus: str | None = None
    lastRestartReason: str | None = None
    lastRestartTime: str | None = None
    nodeId: str | None = None
    rackId: int | None = None
    configHash: str | None = None
    podSpecHash: str | None = None


class K8sClusterSummary(BaseModel):
    name: str = Field(min_length=1)
    namespace: str = Field(min_length=1)
    size: int
    image: str
    phase: str = "Unknown"
    age: str | None = None
    connectionId: str | None = None
    autoConnectWarning: str | None = None


class K8sClusterCondition(BaseModel):
    """Condition from the operator's status.conditions[]."""

    model_config = {"populate_by_name": True}

    type: str
    status: str
    reason: str | None = None
    message: str | None = None
    lastTransitionTime: str | None = None


class K8sClusterDetail(BaseModel):
    model_config = {"populate_by_name": True}

    name: str
    namespace: str
    size: int
    image: str
    phase: str = "Unknown"
    phaseReason: str | None = None
    age: str | None = None
    spec: dict = Field(default_factory=dict)
    status: dict = Field(default_factory=dict)
    pods: list[K8sPodStatus] = Field(default_factory=list)
    conditions: list[K8sClusterCondition] = Field(default_factory=list)
    connectionId: str | None = None
    operation_status: OperationStatusResponse | None = Field(default=None, alias="operationStatus")
    failed_reconcile_count: int = Field(default=0, alias="failedReconcileCount")
    last_reconcile_error: str | None = Field(default=None, alias="lastReconcileError")
    aerospike_cluster_size: int | None = Field(default=None, alias="aerospikeClusterSize")
    pending_restart_pods: list[str] = Field(default_factory=list, alias="pendingRestartPods")
    last_reconcile_time: str | None = Field(default=None, alias="lastReconcileTime")
    operator_version: str | None = Field(default=None, alias="operatorVersion")


class K8sClusterEvent(BaseModel):
    type: str | None = None
    reason: str | None = None
    message: str | None = None
    count: int | None = None
    firstTimestamp: str | None = None
    lastTimestamp: str | None = None
    source: str | None = None


class K8sTemplateSummary(BaseModel):
    name: str
    namespace: str
    image: str | None = None
    size: int | None = None
    age: str | None = None
    description: str | None = None


class K8sTemplateDetail(BaseModel):
    name: str
    namespace: str
    spec: dict = Field(default_factory=dict)
    status: dict = Field(default_factory=dict)
    age: str | None = None


class TemplateSchedulingConfig(BaseModel):
    """Scheduling defaults for a template."""

    model_config = {"populate_by_name": True}

    pod_anti_affinity_level: Literal["none", "preferred", "required"] | None = Field(
        default=None, alias="podAntiAffinityLevel"
    )
    pod_management_policy: Literal["OrderedReady", "Parallel"] | None = Field(default=None, alias="podManagementPolicy")


class TemplateStorageConfig(BaseModel):
    """Storage defaults for a template."""

    model_config = {"populate_by_name": True}

    storage_class_name: str | None = Field(default=None, alias="storageClassName")
    volume_mode: Literal["Filesystem", "Block"] | None = Field(default=None, alias="volumeMode")
    access_modes: list[str] | None = Field(default=None, alias="accessModes")
    size: str | None = Field(default=None, description="Default volume size (e.g. 10Gi)")


class CreateK8sTemplateRequest(BaseModel):
    """Request to create an AerospikeClusterTemplate."""

    model_config = {"populate_by_name": True}

    name: str = Field(min_length=1, max_length=63, pattern=r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$")
    namespace: str = Field(
        default="aerospike",
        min_length=1,
        max_length=253,
        pattern=r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$",
    )
    image: str | None = Field(default=None, pattern=r"^[a-z0-9]([a-z0-9._/-]*[a-z0-9])?:[a-zA-Z0-9._-]+$")
    size: int | None = Field(default=None, ge=1, le=8)
    resources: ResourceConfig | None = None
    monitoring: MonitoringConfig | None = None
    scheduling: TemplateSchedulingConfig | None = None
    storage: TemplateStorageConfig | None = None
    description: str | None = Field(
        default=None, max_length=500, description="Human-readable description of this template"
    )
    network_policy: NetworkAccessConfig | None = Field(default=None, alias="networkPolicy")
    aerospike_config: dict[str, Any] | None = Field(
        default=None, alias="aerospikeConfig", description="Aerospike config defaults"
    )


class OperationRequest(BaseModel):
    """Request to trigger an operation on the cluster.

    Maps to the operator CRD OperationSpec:
      kind:    OperationKind (WarmRestart | PodRestart) — required
      id:      unique tracking ID (1-20 chars) — auto-generated if omitted
      podList: target pods (all pods if empty)
    """

    model_config = {"populate_by_name": True}

    kind: Literal["WarmRestart", "PodRestart"] = Field(
        description="Operation kind (maps to CRD spec.operations[].kind)"
    )
    id: str | None = Field(
        default=None, min_length=1, max_length=20, description="Unique operation ID (auto-generated if omitted)"
    )
    pod_list: list[str] | None = Field(default=None, alias="podList", description="Specific pods (all if empty)")


class RackDistribution(BaseModel):
    """Per-rack pod distribution."""

    id: int
    total: int
    ready: int


class ClusterHealthResponse(BaseModel):
    """Cluster health summary response."""

    model_config = {"populate_by_name": True}

    phase: str = "Unknown"
    total_pods: int = Field(default=0, alias="totalPods")
    ready_pods: int = Field(default=0, alias="readyPods")
    desired_pods: int = Field(default=0, alias="desiredPods")
    migrating: bool = False
    available: bool = False
    config_applied: bool = Field(default=False, alias="configApplied")
    acl_synced: bool = Field(default=True, alias="aclSynced")
    failed_reconcile_count: int = Field(default=0, alias="failedReconcileCount")
    pending_restart_count: int = Field(default=0, alias="pendingRestartCount")
    rack_distribution: list[RackDistribution] = Field(default_factory=list, alias="rackDistribution")
