"""Resources, scheduling, and rack related K8s models."""

from __future__ import annotations

import logging
import re
import warnings
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

logger = logging.getLogger(__name__)


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
    image_pull_secrets: list[dict[str, str]] | None = Field(
        default=None, alias="imagePullSecrets", description="Image pull secrets (e.g. [{name: 'my-secret'}])"
    )
    security_context: dict[str, Any] | None = Field(
        default=None, alias="securityContext", description="Pod security context"
    )
    topology_spread_constraints: list[dict[str, Any]] | None = Field(
        default=None,
        alias="topologySpreadConstraints",
        description="Topology spread constraints for pod distribution",
    )
    metadata: PodMetadataConfig | None = Field(default=None, description="Extra labels and annotations for pods")
    affinity: dict[str, Any] | None = Field(default=None, description="Pod affinity/anti-affinity rules")
    priority_class_name: str | None = Field(
        default=None, alias="priorityClassName", description="PriorityClass name for pod scheduling"
    )


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


class TemplateSchedulingConfig(BaseModel):
    """Scheduling defaults for a template."""

    model_config = {"populate_by_name": True}

    pod_anti_affinity_level: Literal["none", "preferred", "required"] | None = Field(
        default=None, alias="podAntiAffinityLevel"
    )
    pod_management_policy: Literal["OrderedReady", "Parallel"] | None = Field(default=None, alias="podManagementPolicy")
    tolerations: list[dict[str, Any]] | None = Field(
        default=None, description="Pod tolerations for template scheduling"
    )
    node_affinity: dict[str, Any] | None = Field(
        default=None, alias="nodeAffinity", description="Node affinity rules for template scheduling"
    )
    topology_spread_constraints: list[dict[str, Any]] | None = Field(
        default=None,
        alias="topologySpreadConstraints",
        description="Topology spread constraints for template scheduling",
    )


class TemplateRackConfig(BaseModel):
    """Rack configuration defaults for a template."""

    model_config = {"populate_by_name": True}

    max_racks_per_node: int | None = Field(
        default=None, ge=1, alias="maxRacksPerNode", description="Maximum racks allowed per node"
    )


class SidecarConfig(BaseModel):
    """Sidecar or init container configuration."""

    model_config = {"populate_by_name": True}

    name: str
    image: str
    command: list[str] | None = None
    args: list[str] | None = None
    ports: list[dict[str, Any]] | None = None
    env: list[dict[str, Any]] | None = None
    volume_mounts: list[dict[str, Any]] | None = Field(default=None, alias="volumeMounts")
    resources: dict[str, Any] | None = None
    security_context: dict[str, Any] | None = Field(default=None, alias="securityContext")
