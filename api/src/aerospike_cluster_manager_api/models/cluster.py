from __future__ import annotations

from pydantic import BaseModel, Field


class ClusterNode(BaseModel):
    name: str
    address: str
    port: int
    build: str
    edition: str
    clusterSize: int
    uptime: int
    clientConnections: int
    statistics: dict[str, str | int]


class SetInfo(BaseModel):
    name: str
    namespace: str
    objects: int
    tombstones: int
    memoryDataBytes: int
    stopWritesCount: int
    nodeCount: int = 0
    totalNodes: int = 0


class NamespaceInfo(BaseModel):
    name: str
    objects: int
    memoryUsed: int
    memoryTotal: int
    memoryFreePct: int
    deviceUsed: int
    deviceTotal: int
    replicationFactor: int
    stopWrites: bool
    hwmBreached: bool
    highWaterMemoryPct: int
    highWaterDiskPct: int
    nsupPeriod: int = 0
    defaultTtl: int = 0
    allowTtlWithoutNsup: bool = False
    sets: list[SetInfo]


class ClusterInfo(BaseModel):
    connectionId: str
    nodes: list[ClusterNode]
    namespaces: list[NamespaceInfo]


class CreateNamespaceRequest(BaseModel):
    name: str = Field(min_length=1, pattern=r"^[a-zA-Z0-9_-]{1,63}$")
    memorySize: int = Field(default=1_073_741_824, ge=1_000_000)  # min 1 MB
    replicationFactor: int = Field(default=2, ge=1, le=8)
