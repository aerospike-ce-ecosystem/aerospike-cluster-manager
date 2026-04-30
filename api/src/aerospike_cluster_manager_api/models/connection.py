from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ConnectionStatus(BaseModel):
    connected: bool
    nodeCount: int
    namespaceCount: int
    build: str | None = None
    edition: str | None = None
    memoryUsed: int = 0
    memoryTotal: int = 0
    diskUsed: int = 0
    diskTotal: int = 0
    tendHealthy: bool | None = None
    error: str | None = None
    errorType: str | None = None  # timeout | connection_refused | cluster_error | auth_error | unknown


class ConnectionProfile(BaseModel):
    id: str
    name: str
    hosts: list[str] = Field(min_length=1)
    port: int = Field(ge=1, le=65535)
    clusterName: str | None = None
    username: str | None = None
    password: str | None = None
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    description: str | None = None
    createdAt: str
    updatedAt: str

    def __repr__(self) -> str:
        masked = self.model_dump()
        if masked.get("password") is not None:
            masked["password"] = "***"
        fields = ", ".join(f"{k}={v!r}" for k, v in masked.items())
        return f"ConnectionProfile({fields})"


class CreateConnectionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=255, default="New Connection")
    hosts: list[str] = Field(min_length=1, default=["localhost"])
    port: int = Field(ge=1, le=65535, default=3000)
    clusterName: str | None = None
    username: str | None = None
    password: str | None = None
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$", default="#0097D3")
    description: str | None = None


class UpdateConnectionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = Field(None, min_length=1, max_length=255)
    hosts: list[str] | None = Field(None, min_length=1)
    port: int | None = Field(None, ge=1, le=65535)
    clusterName: str | None = None
    username: str | None = None
    password: str | None = None
    color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    description: str | None = None


class TestConnectionRequest(BaseModel):
    hosts: list[str] = Field(min_length=1)
    port: int = Field(ge=1, le=65535, default=3000)
    username: str | None = None
    password: str | None = None


class ConnectionProfileResponse(BaseModel):
    """Connection profile without password — used in API responses."""

    id: str
    name: str
    hosts: list[str] = Field(min_length=1)
    port: int = Field(ge=1, le=65535)
    clusterName: str | None = None
    username: str | None = None
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    description: str | None = None
    createdAt: str
    updatedAt: str

    @classmethod
    def from_profile(cls, profile: ConnectionProfile) -> ConnectionProfileResponse:
        data = profile.model_dump(exclude={"password"})
        return cls(**data)


class ConnectionWithStatus(ConnectionProfileResponse):
    status: ConnectionStatus
