"""Monitoring and HPA related K8s models."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .scheduling import ResourceConfig


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
    custom_rules: list[dict[str, Any]] | None = Field(
        default=None, alias="customRules", description="Custom Prometheus rule groups"
    )


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
    exporter_env: list[dict[str, str]] | None = Field(
        default=None, alias="exporterEnv", description="Additional env vars for the Prometheus exporter container"
    )


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
