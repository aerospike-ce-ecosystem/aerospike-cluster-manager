"""Operations, rolling update, and health related K8s models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


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
    pod_list: list[str] = Field(default_factory=list, alias="podList", description="Target pods for this operation")


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


class PodMigrationStatus(BaseModel):
    pod_name: str = Field(alias="podName")
    migrating_partitions: int = Field(0, alias="migratingPartitions")

    model_config = ConfigDict(populate_by_name=True)


class MigrationStatusResponse(BaseModel):
    in_progress: bool = Field(False, alias="inProgress")
    remaining_partitions: int = Field(0, alias="remainingPartitions")
    last_checked: str | None = Field(None, alias="lastChecked")
    pods: list[PodMigrationStatus] = Field(default_factory=list)

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


class ReconciliationHealthResponse(BaseModel):
    failed_reconcile_count: int = Field(0, alias="failedReconcileCount")
    last_reconcile_error: str | None = Field(None, alias="lastReconcileError")
    phase: str = "Unknown"
    phase_reason: str | None = Field(None, alias="phaseReason")
    operator_version: str | None = Field(None, alias="operatorVersion")
    health_status: str = Field("healthy", alias="healthStatus")

    model_config = ConfigDict(populate_by_name=True)


class NodeBlocklistRequest(BaseModel):
    node_names: list[str] = Field(default_factory=list, alias="nodeNames")

    model_config = ConfigDict(populate_by_name=True)
