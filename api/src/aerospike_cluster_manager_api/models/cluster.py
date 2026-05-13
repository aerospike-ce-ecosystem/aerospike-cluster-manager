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
    # Operator-authored memo from cluster-manager metaDB. Null when no note
    # has been attached. Joined in by clusters_service.get_cluster_info().
    note: str | None = None


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


class ExecuteInfoRequest(BaseModel):
    """Request body for ``POST /clusters/{conn_id}/info``.

    Mirrors the MCP ``execute_info`` / ``execute_info_on_node`` /
    ``execute_info_read_only`` tools so ackoctl can ship ``ackoctl info``
    without a separate MCP transport.

    Semantics:
      * ``node`` unset  → fan out via ``info_all`` to every node.
      * ``node`` set    → target the named node only.
      * ``readOnly``    → when ``True`` (default), every command's leading
        verb must be on :data:`info_verbs.READ_ONLY_INFO_VERBS`.
        Whitelist violations short-circuit with HTTP 400 *before* any
        wire round-trip.
    """

    commands: list[str] = Field(min_length=1)
    node: str | None = None
    readOnly: bool = True


class InfoCommandResult(BaseModel):
    """Per-command (per-node) result row in ``ExecuteInfoResponse``."""

    command: str
    # Node BB id. Empty string when a read-only fan-out couldn't
    # attribute a specific node (every node returned an error).
    node: str = ""
    # Raw asinfo response string. Empty when the call errored.
    output: str = ""
    # Per-node error message; ``None`` when this row succeeded. Surfaces
    # partial failures across the fan-out (e.g. one node returned an
    # error while others succeeded) without dropping the successful rows.
    error: str | None = None


class ExecuteInfoResponse(BaseModel):
    """Aggregated result of ``POST /clusters/{conn_id}/info``.

    ``results`` is flattened across commands x nodes: a fan-out call
    over 2 commands and 3 nodes yields 6 rows.
    """

    results: list[InfoCommandResult]
