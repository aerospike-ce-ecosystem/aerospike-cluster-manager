"""Network and access related K8s models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


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


class ServiceMetadataConfig(BaseModel):
    """Custom metadata for headless/pod services."""

    model_config = {"populate_by_name": True}

    annotations: dict[str, str] | None = Field(default=None, description="Service annotations")
    labels: dict[str, str] | None = Field(default=None, description="Service labels")


class TemplateNetworkConfig(BaseModel):
    """Network/heartbeat configuration for a template."""

    model_config = {"populate_by_name": True}

    heartbeat_mode: Literal["mesh", "multicast"] | None = Field(
        default=None, alias="heartbeatMode", description="Heartbeat mode (mesh or multicast)"
    )
    heartbeat_port: int | None = Field(
        default=None, ge=1024, le=65535, alias="heartbeatPort", description="Heartbeat port"
    )
    heartbeat_interval: int | None = Field(
        default=None, ge=50, alias="heartbeatInterval", description="Heartbeat interval in milliseconds"
    )
    heartbeat_timeout: int | None = Field(
        default=None, ge=1, alias="heartbeatTimeout", description="Heartbeat timeout (number of intervals)"
    )
