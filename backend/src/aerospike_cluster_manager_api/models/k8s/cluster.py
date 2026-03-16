"""Top-level cluster request/response K8s models."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from .monitoring import MonitoringConfig
from .network import (
    BandwidthConfig,
    NetworkAccessConfig,
    NetworkPolicyAutoConfig,
    SeedsFinderServicesConfig,
    ServiceMetadataConfig,
    ValidationPolicyConfig,
)
from .operations import OperationStatusResponse, RollingUpdateConfig
from .scheduling import (
    PodMetadataConfig,
    PodSchedulingConfig,
    RackAwareConfig,
    ResourceConfig,
    SidecarConfig,
    TemplateRackConfig,
    TemplateSchedulingConfig,
)
from .security import ACLConfig
from .storage import (
    AerospikeNamespaceConfig,
    StorageSpec,
    StorageVolumeConfig,
    TemplateStorageConfig,
)


class TemplateOverrides(BaseModel):
    """Overrides to apply on top of template defaults."""

    model_config = {"populate_by_name": True}

    image: str | None = None
    size: int | None = Field(default=None, ge=1, le=8)
    resources: ResourceConfig | None = None
    monitoring: MonitoringConfig | None = None
    network_policy: NetworkAccessConfig | None = Field(default=None, alias="networkPolicy")
    enable_dynamic_config: bool | None = Field(default=None, alias="enableDynamicConfig")
    scheduling: TemplateSchedulingConfig | None = Field(
        default=None, description="Override template scheduling defaults"
    )
    storage: TemplateStorageConfig | None = Field(default=None, description="Override template storage defaults")
    rack_config: TemplateRackConfig | None = Field(
        default=None, alias="rackConfig", description="Override template rack config defaults"
    )
    aerospike_config: dict[str, Any] | None = Field(
        default=None, alias="aerospikeConfig", description="Override template Aerospike config defaults"
    )


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
    storage: StorageVolumeConfig | StorageSpec | None = None
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

    @field_validator("storage", mode="before")
    @classmethod
    def _normalize_storage(cls, v: Any) -> Any:
        """Accept both legacy StorageVolumeConfig and new StorageSpec formats."""
        if isinstance(v, dict):
            # If it has 'volumes' key, treat as StorageSpec
            if "volumes" in v:
                return StorageSpec(**v)
            # Otherwise treat as legacy StorageVolumeConfig
            return StorageVolumeConfig(**v)
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
    sidecars: list[SidecarConfig] | None = Field(default=None, description="Sidecar containers to add to the pod")
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
    storage: StorageSpec | None = None
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
    sidecars: list[SidecarConfig] | None = Field(default=None, description="Sidecar containers to add to the pod")
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
    accessEndpoints: list[str] | None = None
    readinessGateSatisfied: bool | None = None
    unstableSince: str | None = None


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


class TemplateSnapshotStatus(BaseModel):
    """Template sync status from operator's status.templateSnapshot."""

    model_config = {"populate_by_name": True}

    name: str | None = None
    resource_version: str | None = Field(default=None, alias="resourceVersion")
    snapshot_timestamp: str | None = Field(default=None, alias="snapshotTimestamp")
    synced: bool | None = None


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
    template_snapshot: TemplateSnapshotStatus | None = Field(default=None, alias="templateSnapshot")


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
