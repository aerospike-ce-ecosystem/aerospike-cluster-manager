from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from aerospike_cluster_manager_api.dependencies import AerospikeClient, VerifiedConnId
from aerospike_cluster_manager_api.models.cluster import (
    ClusterInfo,
    CreateNamespaceRequest,
)
from aerospike_cluster_manager_api.models.common import MessageResponse
from aerospike_cluster_manager_api.services import clusters_service
from aerospike_cluster_manager_api.services.clusters_service import (
    NamespaceConfigError,
    NamespaceNotFoundError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.get(
    "/{conn_id}",
    summary="Get cluster info",
    description="Retrieve full cluster information including nodes, namespaces, and sets.",
)
async def get_cluster(client: AerospikeClient, conn_id: VerifiedConnId) -> ClusterInfo:
    """Retrieve full cluster information including nodes, namespaces, and sets."""
    return await clusters_service.get_cluster_info(client, conn_id)


@router.post(
    "/{conn_id}/namespaces",
    status_code=200,
    response_model=MessageResponse,
    summary="Configure namespace",
    description="Update runtime-tunable parameters of an existing Aerospike namespace.",
)
async def configure_namespace(body: CreateNamespaceRequest, client: AerospikeClient) -> MessageResponse:
    """Update runtime-tunable parameters of an existing Aerospike namespace."""
    try:
        message = await clusters_service.configure_namespace(client, body)
    except NamespaceNotFoundError as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Namespace '{exc.namespace}' does not exist. "
                "Aerospike does not support dynamic namespace creation. "
                "Namespaces must be defined in aerospike.conf and require a server restart."
            ),
        ) from exc
    except NamespaceConfigError as exc:
        # The raw Aerospike server response can leak internal details
        # (node names, build identifiers, error code paths). Surface a
        # sanitized message to the API consumer and keep the raw response
        # in the server log for operator-side debugging.
        logger.warning(
            "set-config rejected for namespace=%s: %s",
            exc.namespace,
            exc.response,
        )
        raise HTTPException(
            status_code=400,
            detail=f"Namespace '{exc.namespace}' configuration was rejected by the cluster",
        ) from exc
    return MessageResponse(message=message)
