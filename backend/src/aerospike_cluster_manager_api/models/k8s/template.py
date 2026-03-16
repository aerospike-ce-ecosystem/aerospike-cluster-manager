"""Template request/response K8s models."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from .monitoring import MonitoringConfig
from .network import NetworkAccessConfig, TemplateNetworkConfig
from .scheduling import ResourceConfig, TemplateRackConfig, TemplateSchedulingConfig
from .storage import TemplateStorageConfig


class K8sTemplateSummary(BaseModel):
    name: str
    image: str | None = None
    size: int | None = None
    age: str | None = None
    description: str | None = None
    usedBy: list[str] = Field(default_factory=list)


class K8sTemplateDetail(BaseModel):
    name: str
    spec: dict = Field(default_factory=dict)
    status: dict = Field(default_factory=dict)
    age: str | None = None


class TemplateServiceConfig(BaseModel):
    """Service-level configuration for a template.

    Supports well-known fields (feature_key_file) as well as arbitrary
    key-value pairs via ``extra_params`` (maps to ``extraParams`` in JSON).
    The extra params are merged into the CRD's aerospikeConfig.service section
    as-is, allowing settings like proto-fd-max, migrate-threads, etc.
    """

    model_config = {"populate_by_name": True}

    feature_key_file: str | None = Field(default=None, alias="featureKeyFile", description="Path to feature key file")
    proto_fd_max: int | None = Field(
        default=None, alias="protoFdMax", description="Maximum number of client connections (proto-fd-max)"
    )
    extra_params: dict[str, Any] | None = Field(
        default=None,
        alias="extraParams",
        description="Arbitrary service-level config key-value pairs (e.g. migrate-threads)",
    )


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
    service_config: TemplateServiceConfig | None = Field(
        default=None, alias="serviceConfig", description="Service-level configuration"
    )
    network_config: TemplateNetworkConfig | None = Field(
        default=None, alias="networkConfig", description="Network/heartbeat configuration"
    )
    rack_config: TemplateRackConfig | None = Field(
        default=None, alias="rackConfig", description="Rack configuration defaults"
    )


class UpdateK8sTemplateRequest(BaseModel):
    """Request to update an AerospikeClusterTemplate (partial patch)."""

    model_config = {"populate_by_name": True}

    description: str | None = Field(default=None, max_length=500, description="Human-readable description")
    image: str | None = Field(default=None, pattern=r"^[a-z0-9]([a-z0-9._/-]*[a-z0-9])?:[a-zA-Z0-9._-]+$")
    size: int | None = Field(default=None, ge=1, le=8)
    resources: ResourceConfig | None = None
    monitoring: MonitoringConfig | None = None
    scheduling: TemplateSchedulingConfig | None = None
    storage: TemplateStorageConfig | None = None
    network_policy: NetworkAccessConfig | None = Field(default=None, alias="networkPolicy")
    aerospike_config: dict[str, Any] | None = Field(
        default=None, alias="aerospikeConfig", description="Aerospike config defaults"
    )
    service_config: TemplateServiceConfig | None = Field(
        default=None, alias="serviceConfig", description="Service-level configuration"
    )
    network_config: TemplateNetworkConfig | None = Field(
        default=None, alias="networkConfig", description="Network/heartbeat configuration"
    )
    rack_config: TemplateRackConfig | None = Field(
        default=None, alias="rackConfig", description="Rack configuration defaults"
    )
