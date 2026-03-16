from __future__ import annotations

from fastapi import APIRouter

from aerospike_cluster_manager_api.dependencies import AerospikeClient, VerifiedConnId
from aerospike_cluster_manager_api.models.metrics import ClusterMetrics
from aerospike_cluster_manager_api.services.metrics_service import build_cluster_metrics

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get(
    "/{conn_id}",
    summary="Get cluster metrics",
    description="Retrieve cluster-wide metrics including TPS, memory, device usage, and per-namespace stats.",
)
async def get_metrics(client: AerospikeClient, conn_id: VerifiedConnId) -> ClusterMetrics:
    """Retrieve cluster-wide metrics including TPS, memory, device usage, and per-namespace stats."""
    return await build_cluster_metrics(client, conn_id)
