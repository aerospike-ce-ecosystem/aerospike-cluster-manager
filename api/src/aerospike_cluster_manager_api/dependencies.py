"""Shared FastAPI dependencies."""

from __future__ import annotations

import logging
from typing import Annotated, Any

import aerospike_py
from aerospike_py.exception import AerospikeError, ClusterError
from fastapi import Depends, HTTPException, Path
from starlette.requests import Request

from aerospike_cluster_manager_api import config, db
from aerospike_cluster_manager_api.client_manager import client_manager
from aerospike_cluster_manager_api.models.connection import ConnectionProfile
from aerospike_cluster_manager_api.models.workspace import SYSTEM_OWNER_ID, Workspace

logger = logging.getLogger(__name__)


def _resolve_caller_owner_id(request: Request) -> str:
    """Return the caller's workspace-owner identity for ACL checks.

    Reads ``request.state.user_claims`` populated by
    :class:`OIDCAuthMiddleware` (PR #298) or by the MCP bearer-token
    middleware (PR #302). Falls back to the synthetic
    :data:`SYSTEM_OWNER_ID` when:

    * the bearer-token sentinel is set (``_mcp_bearer=True``) — MCP
      callers in single-tenant mode behave like the legacy global-access
      path; the workspace gate would otherwise be meaningless because
      there is no per-user workspace concept.
    * neither OIDC nor the bearer middleware ran (anonymous request,
      e.g. ``OIDC_ENABLED=false`` deployments) — preserves the Phase 1
      single-tenant behaviour where every workspace is reachable.

    Otherwise, the configured OIDC claim
    (:data:`config.ACM_OIDC_OWNER_CLAIM`, default ``sub``) is returned.
    A missing/empty claim also degrades to :data:`SYSTEM_OWNER_ID` so a
    misconfigured IdP cannot lock callers out of the default workspace.

    The matching MCP-side bridge lives in
    :mod:`aerospike_cluster_manager_api.mcp.user_context` -- it captures
    the same ``request.state.user_claims`` into a contextvar that the
    registry decorator's workspace gate reads (E.3 of #307).
    """
    claims: dict[str, Any] | None = getattr(request.state, "user_claims", None)
    if claims is None:
        # Anonymous (no auth middleware ran). Phase 1 semantics.
        return SYSTEM_OWNER_ID
    if claims.get("_mcp_bearer"):
        # Bearer-token sentinel (single-tenant deployments).
        return SYSTEM_OWNER_ID
    raw = claims.get(config.ACM_OIDC_OWNER_CLAIM)
    if not isinstance(raw, str) or not raw:
        return SYSTEM_OWNER_ID
    return raw


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


CallerOwnerId = Annotated[str, Depends(_resolve_caller_owner_id)]
"""Inject the caller's workspace-owner identity (OIDC claim or system sentinel)."""
