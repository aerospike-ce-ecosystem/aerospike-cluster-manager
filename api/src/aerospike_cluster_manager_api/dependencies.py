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


# P1-5: track misconfig warnings emitted at most once per process per
# missing-claim case. Without this guard a misconfigured IdP would log a
# WARNING on every request which buries other diagnostic noise. The set
# is keyed on the configured claim name so changing
# ``ACM_OIDC_OWNER_CLAIM`` mid-process re-emits.
_WARNED_MISSING_CLAIMS: set[str] = set()


def _warn_missing_owner_claim_once(claim_name: str) -> None:
    """Emit a one-time WARNING when the configured OIDC owner claim is
    missing from the JWT. Behavior stays unchanged (caller silently
    degrades to ``SYSTEM_OWNER_ID``) -- this is purely an observability
    hook so an operator notices a misconfigured IdP instead of silently
    losing tenant isolation. See ``.env.example`` for tuning guidance."""
    if claim_name in _WARNED_MISSING_CLAIMS:
        return
    _WARNED_MISSING_CLAIMS.add(claim_name)
    logger.warning(
        "OIDC owner claim '%s' is missing or empty in caller JWT; falling back to SYSTEM_OWNER_ID. "
        "This silently downgrades caller identity and disables tenant isolation. "
        "Verify ACM_OIDC_OWNER_CLAIM matches a claim your IdP actually emits.",
        claim_name,
    )


def _resolve_caller_owner_id(request: Request) -> str:
    """Return the caller's workspace-owner identity for ACL checks.

    Reads ``request.state.user_claims`` populated by
    :class:`OIDCAuthMiddleware` (PR #298). Falls back to the synthetic
    :data:`SYSTEM_OWNER_ID` when OIDC did not run (anonymous request,
    e.g. ``OIDC_ENABLED=false`` deployments) — preserves the Phase 1
    single-tenant behaviour where every workspace is reachable.

    Otherwise, the configured OIDC claim
    (:data:`config.ACM_OIDC_OWNER_CLAIM`, default ``sub``) is returned.
    A missing/empty claim also degrades to :data:`SYSTEM_OWNER_ID` so a
    misconfigured IdP cannot lock callers out of the default workspace.
    """
    claims: dict[str, Any] | None = getattr(request.state, "user_claims", None)
    if claims is None:
        # Anonymous (no auth middleware ran). Phase 1 semantics.
        return SYSTEM_OWNER_ID
    raw = claims.get(config.ACM_OIDC_OWNER_CLAIM)
    if not isinstance(raw, str) or not raw:
        # P1-5: surface misconfigured-IdP cases instead of silently
        # collapsing every authenticated caller into SYSTEM_OWNER_ID.
        # Behaviour stays the same to avoid breaking deployments that
        # genuinely expect single-tenant fallback.
        _warn_missing_owner_claim_once(config.ACM_OIDC_OWNER_CLAIM)
        return SYSTEM_OWNER_ID
    return raw


async def _get_verified_connection(
    conn_id: str = Path(),
    caller_owner_id: str = Depends(_resolve_caller_owner_id),
) -> str:
    """Verify that a connection profile exists and the caller owns its workspace.

    Default-deny ACL gate (#307 — Phase 2). Returns the connection id when
    the caller can see the connection's workspace. Raises 404 when:

    * the connection does not exist;
    * the connection's workspace was deleted between the load and now;
    * the workspace exists but belongs to a different owner (and is not
      the synthetic ``SYSTEM_OWNER_ID`` shared-default workspace).

    Identity-404 (instead of 403) prevents id enumeration — the wire shape
    matches the missing-row case so a probing caller cannot distinguish
    "doesn't exist" from "exists but not yours". Anonymous deployments
    (``caller_owner_id == SYSTEM_OWNER_ID``) keep the legacy
    every-workspace-visible behaviour because system-owned rows always
    pass and the resolver returns the system sentinel when no auth
    middleware ran.

    Unit-test paths that exercise the dependency without a workspace DB
    (``DBNotInitialized``) skip the visibility check -- the connection
    existence gate alone is the legacy behaviour.
    """
    conn = await db.get_connection(conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")
    workspace_id = getattr(conn, "workspaceId", None)
    if workspace_id is None:
        # Connection has no workspace association (legacy / test fixture
        # using a bare dict). Treat as system-shared — visible to every
        # authenticated caller, matching the pre-#307 wire shape.
        return conn_id
    try:
        workspace = await db.get_workspace(workspace_id)
    except db.DBNotInitialized:
        return conn_id
    if workspace is None:
        # Workspace deleted underneath us. Surface as connection 404 so
        # the wire shape matches the no-ACL case.
        raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")
    if workspace.ownerId != caller_owner_id and workspace.ownerId != SYSTEM_OWNER_ID:
        raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")
    return conn_id


async def _get_verified_workspace(
    workspace_id: str = Path(),
    caller_owner_id: str = Depends(_resolve_caller_owner_id),
) -> str:
    """Verify that a workspace exists and the caller can see it.

    Default-deny ACL gate -- mirrors the rule used by
    :func:`services.workspaces_service.get_workspace`. Returns the
    workspace id when ``ownerId == caller_owner_id`` or the workspace is
    system-shared (``ownerId == SYSTEM_OWNER_ID``). Raises 404
    (identity-404, not 403) for missing rows and for rows the caller
    cannot see, matching the wire shape used elsewhere so id enumeration
    is impossible.
    """
    try:
        ws = await db.get_workspace(workspace_id)
    except db.DBNotInitialized:
        # Unit-test paths that skip the workspace DB keep the legacy
        # path-validation-only behaviour.
        return workspace_id
    if not ws:
        raise HTTPException(status_code=404, detail=f"Workspace '{workspace_id}' not found")
    if ws.ownerId != caller_owner_id and ws.ownerId != SYSTEM_OWNER_ID:
        raise HTTPException(status_code=404, detail=f"Workspace '{workspace_id}' not found")
    return workspace_id


async def _get_workspace(workspace_id: str = Path()) -> Workspace:
    """Fetch and return the full ``Workspace`` for path parameter ``workspace_id``."""
    ws = await db.get_workspace(workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail=f"Workspace '{workspace_id}' not found")
    return ws


async def _get_connection_profile(
    conn_id: str = Path(),
    caller_owner_id: str = Depends(_resolve_caller_owner_id),
) -> ConnectionProfile:
    """Fetch and return the full ``ConnectionProfile`` for *conn_id*.

    Same default-deny ACL gate as :func:`_get_verified_connection` —
    raises 404 for missing rows AND for rows whose workspace is invisible
    to the caller. Unlike ``_get_verified_connection`` (which returns
    only the id string), this dependency returns the full model so
    callers can avoid a redundant database round-trip.
    """
    conn = await db.get_connection(conn_id)
    if not conn:
        raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")
    workspace_id = getattr(conn, "workspaceId", None)
    if workspace_id is None:
        return conn
    try:
        workspace = await db.get_workspace(workspace_id)
    except db.DBNotInitialized:
        return conn
    if workspace is None:
        raise HTTPException(status_code=404, detail=f"Connection '{conn_id}' not found")
    if workspace.ownerId != caller_owner_id and workspace.ownerId != SYSTEM_OWNER_ID:
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
