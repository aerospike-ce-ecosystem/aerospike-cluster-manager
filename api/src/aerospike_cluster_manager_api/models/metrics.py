from __future__ import annotations

from pydantic import BaseModel


class MetricPoint(BaseModel):
    timestamp: int
    value: float


class MetricSeries(BaseModel):
    name: str
    label: str
    data: list[MetricPoint]
    color: str | None = None


class NamespaceMetrics(BaseModel):
    namespace: str
    objects: int
    memoryUsed: int
    memoryTotal: int
    deviceUsed: int
    deviceTotal: int
    readReqs: int
    writeReqs: int
    readSuccess: int
    writeSuccess: int


class ClusterMetrics(BaseModel):
    connectionId: str
    timestamp: int
    connected: bool
    uptime: int
    clientConnections: int
    totalReadReqs: int
    totalWriteReqs: int
    totalReadSuccess: int
    totalWriteSuccess: int
    namespaces: list[NamespaceMetrics]
    readTps: list[MetricPoint]
    writeTps: list[MetricPoint]
    connectionHistory: list[MetricPoint]
    memoryUsageByNs: list[MetricSeries]
    deviceUsageByNs: list[MetricSeries]
