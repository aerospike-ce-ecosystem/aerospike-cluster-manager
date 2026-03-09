from __future__ import annotations

import logging
import re
import warnings
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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
    custom_access_network_names: list[str] | None = Field(
        default=None, alias="customAccessNetworkNames", description="Network names for configuredIP access type"
    )
    custom_alternate_access_network_names: list[str] | None = Field(
        default=None,
        alias="customAlternateAccessNetworkNames",
        description="Network names for configuredIP alternate access type",
    )
    custom_fabric_network_names: list[str] | None = Field(
        default=None, alias="customFabricNetworkNames", description="Network names for configuredIP fabric type"
    )

    @model_validator(mode="after")
    def configured_ip_requires_network_names(self) -> NetworkAccessConfig:
        """Validate that configuredIP types have corresponding network names."""
        if self.access_type == "configuredIP" and not self.custom_access_network_names:
            raise ValueError("customAccessNetworkNames required when accessType is configuredIP")
        if self.alternate_access_type == "configuredIP" and not self.custom_alternate_access_network_names:
            raise ValueError("customAlternateAccessNetworkNames required when alternateAccessType is configuredIP")
        if self.fabric_type == "configuredIP" and not self.custom_fabric_network_names:
            raise ValueError("customFabricNetworkNames required when fabricType is configuredIP")
        return self


class LoadBalancerSpec(BaseModel):
    """LoadBalancer service configuration for seed discovery."""

    model_config = {"populate_by_name": True}

    annotations: dict[str, str] | None = Field(default=None, description="Service annotations")
    labels: dict[str, str] | None = Field(default=None, description="Service labels")
    external_traffic_policy: Literal["Cluster", "Local"] | None = Field(
        default=None, alias="externalTrafficPolicy", description="External traffic policy"
    )
    port: int = Field(default=3000, ge=1, le=65535, description="Service port")
    target_port: int = Field(default=3000, ge=1, le=65535, alias="targetPort", description="Target port")
    load_balancer_source_ranges: list[str] | None = Field(
        default=None, alias="loadBalancerSourceRanges", description="Allowed source IP ranges"
    )


class SeedsFinderServicesConfig(BaseModel):
    """Seeds finder services configuration for external seed discovery."""

    model_config = {"populate_by_name": True}

    load_balancer: LoadBalancerSpec | None = Field(
        default=None, alias="loadBalancer", description="LoadBalancer service for seed discovery"
    )


class NetworkPolicyAutoConfig(BaseModel):
    """Auto-generate Kubernetes NetworkPolicy resources."""

    model_config = {"populate_by_name": True}

    enabled: bool = Field(default=False, description="Enable automatic NetworkPolicy creation")
    type: Literal["kubernetes", "cilium"] = Field(
        default="kubernetes", description="NetworkPolicy type: kubernetes or cilium"
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


class PodMetadataConfig(BaseModel):
    """Extra labels and annotations for pods."""

    model_config = {"populate_by_name": True}

    labels: dict[str, str] | None = Field(default=None, description="Additional pod labels")
    annotations: dict[str, str] | None = Field(default=None, description="Additional pod annotations")


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
    readiness_gate_enabled: bool | None = Field(
        default=None,
        alias="readinessGateEnabled",
        description="Enable custom Pod Readiness Gate (acko.io/aerospike-ready)",
    )
    pod_management_policy: Literal["OrderedReady", "Parallel"] | None = Field(
        default=None, alias="podManagementPolicy", description="Pod management policy (OrderedReady or Parallel)"
    )
    dns_policy: str | None = Field(
        default=None, alias="dnsPolicy", description="DNS policy for pods (e.g. ClusterFirst, Default)"
    )
    image_pull_secrets: list[str] | None = Field(
        default=None, alias="imagePullSecrets", description="Private registry image pull secrets"
    )
    security_context: dict[str, Any] | None = Field(
        default=None, alias="securityContext", description="Pod-level security context"
    )
    topology_spread_constraints: list[dict[str, Any]] | None = Field(
        default=None, alias="topologySpreadConstraints", description="Topology spread constraints for pod scheduling"
    )
    metadata: PodMetadataConfig | None = Field(default=None, description="Extra labels and annotations for pods")


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
    resources: ResourceConfig | None = Field(default=None, description="Exporter container resources")
    metric_labels: dict[str, str] | None = Field(
        default=None, alias="metricLabels", description="Custom metric labels for exporter"
    )
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


class RackPodSpecConfig(BaseModel):
    """Rack-level pod scheduling overrides."""

    model_config = {"populate_by_name": True}

    affinity: dict[str, Any] | None = Field(default=None, description="Rack-level affinity override (K8s Affinity)")
    tolerations: list[TolerationConfig] | None = Field(default=None, description="Rack-level tolerations override")
    node_selector: dict[str, str] | None = Field(
        default=None, alias="nodeSelector", description="Rack-level node selector override"
    )


class RackStorageConfig(BaseModel):
    """Rack-level storage overrides."""

    model_config = {"populate_by_name": True}

    volumes: list[dict[str, Any]] | None = Field(
        default=None, description="Rack-level volume definitions (same schema as spec.storage.volumes)"
    )


class RackConfig(BaseModel):
    """Rack configuration for zone-aware deployment."""

    model_config = {"populate_by_name": True}

    id: int = Field(ge=1, le=100, description="Rack ID (must be unique)")
    zone: str | None = Field(default=None, description="K8s zone for node affinity")
    region: str | None = Field(default=None, description="K8s region for node affinity")
    rack_label: str | None = Field(default=None, alias="rackLabel", description="Custom label for rack scheduling")
    node_name: str | None = Field(default=None, alias="nodeName", description="Specific node name")
    aerospike_config: dict[str, Any] | None = Field(
        default=None,
        alias="aerospikeConfig",
        description="Rack-specific Aerospike config override",
    )
    storage: RackStorageConfig | None = Field(default=None, description="Rack-specific storage config override")
    pod_spec: RackPodSpecConfig | None = Field(
        default=None,
        alias="podSpec",
        description="Rack-specific pod scheduling override (affinity, tolerations, nodeSelector)",
    )


class RackAwareConfig(BaseModel):
    """Multi-rack deployment configuration."""

    model_config = {"populate_by_name": True}

    racks: list[RackConfig] = Field(default_factory=list, max_length=10)
    namespaces: list[str] | None = Field(
        default=None, max_length=2, description="Rack-aware namespace list (max 2 for CE)"
    )
    scale_down_batch_size: str | None = Field(
        default=None, alias="scaleDownBatchSize", description="Batch size for scale-down (int or percentage)"
    )
    max_ignorable_pods: str | None = Field(
        default=None,
        alias="maxIgnorablePods",
        description="Max pending/failed pods to ignore during reconciliation (int or percentage)",
    )
    rolling_update_batch_size: str | None = Field(
        default=None,
        alias="rollingUpdateBatchSize",
        description="Per-rack rolling update batch size (int or percentage), overrides spec-level",
    )

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
    monitoring: MonitoringConfig | None = None
    network_policy: NetworkAccessConfig | None = Field(default=None, alias="networkPolicy")
    enable_dynamic_config: bool | None = Field(default=None, alias="enableDynamicConfig")


class BandwidthConfig(BaseModel):
    """CNI bandwidth shaping configuration."""

    model_config = {"populate_by_name": True}

    ingress: str | None = Field(default=None, description="Ingress bandwidth limit (e.g. '1M')")
    egress: str | None = Field(default=None, description="Egress bandwidth limit (e.g. '1M')")


class ValidationPolicyConfig(BaseModel):
    """Validation policy configuration."""

    model_config = {"populate_by_name": True}

    skip_work_dir_validate: bool = Field(
        default=False, alias="skipWorkDirValidate", description="Skip work directory validation"
    )


class SidecarConfig(BaseModel):
    """Sidecar or init container configuration."""

    model_config = {"populate_by_name": True}

    name: str
    image: str
    ports: list[dict[str, Any]] | None = None
    env: list[dict[str, Any]] | None = None
    volume_mounts: list[dict[str, Any]] | None = Field(default=None, alias="volumeMounts")
    resources: dict[str, Any] | None = None
    security_context: dict[str, Any] | None = Field(default=None, alias="securityContext")


class ServiceMetadataConfig(BaseModel):
    """Custom metadata for headless/pod services."""

    model_config = {"populate_by_name": True}

    annotations: dict[str, str] | None = Field(default=None, description="Service annotations")
    labels: dict[str, str] | None = Field(default=None, description="Service labels")


class TemplateRefConfig(BaseModel):
    """Reference to an AerospikeClusterTemplate (cluster-scoped, no namespace)."""

    name: str

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
    seeds_finder_services: SeedsFinderServicesConfig | None = Field(
        default=None, alias="seedsFinderServices", description="LoadBalancer service for seed discovery"
    )
    network_policy_config: NetworkPolicyAutoConfig | None = Field(
        default=None, alias="networkPolicyConfig", description="Auto-generate K8s NetworkPolicy"
    )
    bandwidth_config: BandwidthConfig | None = Field(
        default=None, alias="bandwidthConfig", description="CNI bandwidth shaping"
    )
    validation_policy: ValidationPolicyConfig | None = Field(
        default=None, alias="validationPolicy", description="Validation policy"
    )
    headless_service: ServiceMetadataConfig | None = Field(
        default=None, alias="headlessService", description="Custom metadata for headless service"
    )
    pod_service: ServiceMetadataConfig | None = Field(
        default=None, alias="podService", description="Custom metadata for per-pod services"
    )
    enable_rack_id_override: bool | None = Field(
        default=None, alias="enableRackIDOverride", description="Enable dynamic rack ID assignment"
    )
    pod_metadata: PodMetadataConfig | None = Field(
        default=None, alias="podMetadata", description="Extra labels and annotations for pods"
    )
    sidecars: list[SidecarConfig] | None = Field(
        default=None, description="Sidecar containers to add to the pod"
    )
    init_containers: list[SidecarConfig] | None = Field(
        default=None, alias="initContainers", description="Init containers to add to the pod"
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
    seeds_finder_services: SeedsFinderServicesConfig | None = Field(
        default=None, alias="seedsFinderServices", description="LoadBalancer service for seed discovery"
    )
    network_policy_config: NetworkPolicyAutoConfig | None = Field(
        default=None, alias="networkPolicyConfig", description="Auto-generate K8s NetworkPolicy"
    )
    acl: ACLConfig | None = Field(default=None, alias="acl")
    bandwidth_config: BandwidthConfig | None = Field(
        default=None, alias="bandwidthConfig", description="CNI bandwidth shaping"
    )
    validation_policy: ValidationPolicyConfig | None = Field(
        default=None, alias="validationPolicy", description="Validation policy"
    )
    headless_service: ServiceMetadataConfig | None = Field(
        default=None, alias="headlessService", description="Custom metadata for headless service"
    )
    pod_service: ServiceMetadataConfig | None = Field(
        default=None, alias="podService", description="Custom metadata for per-pod services"
    )
    enable_rack_id_override: bool | None = Field(
        default=None, alias="enableRackIDOverride", description="Enable dynamic rack ID assignment"
    )
    pod_metadata: PodMetadataConfig | None = Field(
        default=None, alias="podMetadata", description="Extra labels and annotations for pods"
    )
    sidecars: list[SidecarConfig] | None = Field(
        default=None, description="Sidecar containers to add to the pod"
    )
    init_containers: list[SidecarConfig] | None = Field(
        default=None, alias="initContainers", description="Init containers to add to the pod"
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


class EventCategory(StrEnum):
    ROLLING_RESTART = "Rolling Restart"
    CONFIG = "Configuration"
    ACL = "ACL Security"
    RACK = "Rack Management"
    SCALING = "Scaling"
    LIFECYCLE = "Lifecycle"
    MONITORING = "Monitoring"
    NETWORK = "Network"
    TEMPLATE = "Template"
    CIRCUIT_BREAKER = "Circuit Breaker"
    OTHER = "Other"


class K8sClusterEvent(BaseModel):
    type: str | None = None
    reason: str | None = None
    message: str | None = None
    count: int | None = None
    firstTimestamp: str | None = None
    lastTimestamp: str | None = None
    source: str | None = None
    category: str | None = None


class K8sTemplateSummary(BaseModel):
    name: str
    image: str | None = None
    size: int | None = None
    age: str | None = None
    description: str | None = None


class K8sTemplateDetail(BaseModel):
    name: str
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


class PodHashGroup(BaseModel):
    config_hash: str | None = Field(None, alias="configHash")
    pod_spec_hash: str | None = Field(None, alias="podSpecHash")
    pods: list[str] = []
    is_current: bool = Field(False, alias="isCurrent")

    model_config = ConfigDict(populate_by_name=True)


class ConfigDriftResponse(BaseModel):
    has_drift: bool = Field(False, alias="hasDrift")
    changed_fields: list[str] = Field(default_factory=list, alias="changedFields")
    pod_hash_groups: list[PodHashGroup] = Field(default_factory=list, alias="podHashGroups")
    desired_config_hash: str | None = Field(None, alias="desiredConfigHash")

    model_config = ConfigDict(populate_by_name=True)


class ReconciliationStatus(BaseModel):
    circuit_breaker_active: bool = Field(False, alias="circuitBreakerActive")
    failed_reconcile_count: int = Field(0, alias="failedReconcileCount")
    circuit_breaker_threshold: int = Field(10, alias="circuitBreakerThreshold")
    last_reconcile_error: str | None = Field(None, alias="lastReconcileError")
    last_reconcile_time: str | None = Field(None, alias="lastReconcileTime")
    estimated_backoff_seconds: int | None = Field(None, alias="estimatedBackoffSeconds")
    phase: str = "Unknown"

    model_config = ConfigDict(populate_by_name=True)


# ---------------------------------------------------------------------------
# HPA (HorizontalPodAutoscaler) models
# ---------------------------------------------------------------------------


class HPAConfig(BaseModel):
    """Configuration for creating/updating an HPA targeting an AerospikeCluster."""

    model_config = ConfigDict(populate_by_name=True)

    min_replicas: int = Field(ge=1, le=8, alias="minReplicas")
    max_replicas: int = Field(ge=1, le=8, alias="maxReplicas")
    cpu_target_percent: int | None = Field(default=None, ge=1, le=100, alias="cpuTargetPercent")
    memory_target_percent: int | None = Field(default=None, ge=1, le=100, alias="memoryTargetPercent")

    @model_validator(mode="after")
    def max_gte_min(self) -> HPAConfig:
        if self.max_replicas < self.min_replicas:
            raise ValueError(f"maxReplicas ({self.max_replicas}) must be >= minReplicas ({self.min_replicas})")
        return self

    @model_validator(mode="after")
    def at_least_one_metric(self) -> HPAConfig:
        if self.cpu_target_percent is None and self.memory_target_percent is None:
            raise ValueError("At least one metric target (cpuTargetPercent or memoryTargetPercent) must be specified")
        return self


class HPACondition(BaseModel):
    """A single HPA condition from status.conditions[]."""

    model_config = ConfigDict(populate_by_name=True)

    type: str
    status: str
    reason: str | None = None
    message: str | None = None
    last_transition_time: str | None = Field(default=None, alias="lastTransitionTime")


class HPAStatus(BaseModel):
    """Current status of an HPA."""

    model_config = ConfigDict(populate_by_name=True)

    current_replicas: int = Field(default=0, alias="currentReplicas")
    desired_replicas: int = Field(default=0, alias="desiredReplicas")
    conditions: list[HPACondition] = Field(default_factory=list)


class HPAResponse(BaseModel):
    """Combined HPA config and status response."""

    model_config = ConfigDict(populate_by_name=True)

    enabled: bool = True
    config: HPAConfig
    status: HPAStatus
