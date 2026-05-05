"""Shared FastAPI dependencies."""

from __future__ import annotations

import logging
from typing import Annotated

import aerospike_py
from aerospike_py.exception import AerospikeError, ClusterError
from fastapi import Depends, HTTPException, Path

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.client_manager import client_manager
from aerospike_cluster_manager_api.models.connection import ConnectionProfile
from aerospike_cluster_manager_api.models.workspace import Workspace

logger = logging.getLogger(__name__)


async def _get_verified_connection(conn_id: str = Path()) -> str:
    """Verify that a connection profile exists and return its id."""
    conn = await db.get_connection(conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")
    return conn_id


async def _get_verified_workspace(workspace_id: str = Path()) -> str:
    """Verify that a workspace exists (path parameter) and return its id."""
    ws = await db.get_workspace(workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail=f"Workspace '{workspace_id}' not found")
    return workspace_id


async def _get_workspace(workspace_id: str = Path()) -> Workspace:
    """Fetch and return the full ``Workspace`` for path parameter ``workspace_id``."""
    ws = await db.get_workspace(workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail=f"Workspace '{workspace_id}' not found")
    return ws


async def _get_connection_profile(conn_id: str = Path()) -> ConnectionProfile:
    """Fetch and return the full ``ConnectionProfile`` for *conn_id*.

    Raises 404 if the profile does not exist.  Unlike
    ``_get_verified_connection`` (which returns only the id string),
    this dependency returns the full model so callers can avoid a
    redundant database round-trip.
    """
    conn = await db.get_connection(conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")
    return conn


async def _get_client(conn_id: str = Depends(_get_verified_connection)) -> aerospike_py.AsyncClient:
    """Resolve *conn_id* and return a cached Aerospike async client."""
    try:
        return await client_manager.get_client(conn_id)
    except (AerospikeError, ClusterError, ConnectionRefusedError, OSError) as e:
        logger.warning("Failed to connect to Aerospike for connection '%s': %s", conn_id, e)
        raise HTTPException(
            status_code=503,
            detail=f"Unable to connect to Aerospike cluster for connection '{conn_id}'",
        ) from e


VerifiedConnId = Annotated[str, Depends(_get_verified_connection)]
"""Inject a verified connection id from the path."""

AerospikeClient = Annotated[aerospike_py.AsyncClient, Depends(_get_client)]
"""Inject a cached Aerospike async client resolved from the path ``conn_id``."""

VerifiedConnectionProfile = Annotated[ConnectionProfile, Depends(_get_connection_profile)]
"""Inject a full ``ConnectionProfile`` looked up from the path ``conn_id``."""

VerifiedWorkspaceId = Annotated[str, Depends(_get_verified_workspace)]
"""Inject a verified workspace id from the path."""

VerifiedWorkspace = Annotated[Workspace, Depends(_get_workspace)]
"""Inject a full ``Workspace`` looked up from the path ``workspace_id``."""
