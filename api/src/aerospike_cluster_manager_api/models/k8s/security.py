"""ACL / security related K8s models."""

from __future__ import annotations

from pydantic import BaseModel, Field


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
