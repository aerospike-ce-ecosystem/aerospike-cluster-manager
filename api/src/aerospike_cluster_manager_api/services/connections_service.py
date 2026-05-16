"""Business logic for Aerospike connection profile management.

These functions are the single source of truth for the connection lifecycle
(list / get / create / update / delete / test). The HTTP router
(``routers/connections.py``) wraps them in HTTPException translation,
rate-limiting, and FastAPI dependencies.

To stay reusable from any caller, this module **must not** import ``fastapi``
or other HTTP-shaping libraries. Domain failures are signalled by plain
exceptions defined here, which the router translates to HTTP status codes.
"""

from __future__ import annotations

import contextlib
import ipaddress
import logging
import os
import uuid
from datetime import UTC, datetime
from typing import Any, NamedTuple

import aerospike_py
from aerospike_py.exception import AerospikeError

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.client_manager import client_manager
from aerospike_cluster_manager_api.models.connection import (
    ConnectionProfile,
    ConnectionProfileResponse,
    CreateConnectionRequest,
    TestConnectionRequest,
    UpdateConnectionRequest,
)
from aerospike_cluster_manager_api.models.workspace import (
    DEFAULT_WORKSPACE_ID,
    SYSTEM_OWNER_ID,
)
from aerospike_cluster_manager_api.utils import parse_host_port

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Domain exceptions
# ---------------------------------------------------------------------------


class ConnectionNotFoundError(LookupError):
    """Raised when a connection profile is not found by id."""

    def __init__(self, conn_id: str) -> None:
        super().__init__(f"Connection '{conn_id}' not found")
        self.conn_id = conn_id


class BlockedConnectionTargetError(ValueError):
    """Raised when a test_connection target points at a denied address.

    Default-deny SSRF gate: loopback, link-local (especially the EC2 IMDS
    169.254.169.254), and IPv6 ``::1`` are rejected before any network
    syscall so the API cannot be repurposed as an internal port scanner
    or a metadata-service exfil channel. Operators can override the
    default-deny via ``ACM_CONNECTION_TEST_ALLOW_PRIVATE=true`` for dev
    deployments where the API and Aerospike share a host.
    """

    def __init__(self, host: str) -> None:
        super().__init__(f"Connection target '{host}' is not allowed")
        self.host = host


class WorkspaceNotFoundError(LookupError):
    """Raised when a referenced workspace does not exist."""

    def __init__(self, workspace_id: str) -> None:
        super().__init__(f"Workspace '{workspace_id}' not found")
        self.workspace_id = workspace_id


# ---------------------------------------------------------------------------
# Result containers
# ---------------------------------------------------------------------------


class TestConnectionResult(NamedTuple):
    """Outcome of a non-persisting connectivity probe.

    Mirrors the existing service-surface convention (``QueryResult``,
    ``ListRecordsResult``) so HTTP wrappers can map fields to their
    preferred wire format. ``success`` is a boolean for easy short-circuit
    checks; ``message`` carries either the success summary or the error
    text.
    """

    success: bool
    message: str


# ---------------------------------------------------------------------------
# Service entry points
# ---------------------------------------------------------------------------


_ALLOW_PRIVATE_TARGETS_ENV = "ACM_CONNECTION_TEST_ALLOW_PRIVATE"


def _allow_private_targets() -> bool:
    """Return True when operators have opted into private-range targets.

    Read live (not snapshotted) so test fixtures can flip the env var via
    monkeypatch. The default is False -- production deployments default-
    deny loopback / link-local to keep the test_connection API from
    being repurposed as an internal port scanner or IMDS exfil channel.
    """
    return os.environ.get(_ALLOW_PRIVATE_TARGETS_ENV, "false").strip().lower() in {"1", "true", "yes", "on"}


def _is_blocked_target(host: str) -> bool:
    """Return True iff ``host`` resolves to a denied IP literal.

    Blocks loopback (``127.0.0.0/8``, ``::1``) and link-local IPv4
    (``169.254.0.0/16`` -- includes the EC2 IMDS ``169.254.169.254``) so
    the test-connection endpoint cannot be turned into an SSRF probe by
    an authenticated caller. Hostnames that are not bare IP literals are
    *not* blocked here -- the underlying Aerospike client resolves DNS
    natively and re-checking after resolve would race with TOCTOU. The
    contract is: literal-IP rejection is the cheap first line; deeper
    network-policy enforcement (egress firewall) is expected to backstop
    DNS-based bypasses.

    The ``ACM_CONNECTION_TEST_ALLOW_PRIVATE`` env var disables the gate
    for dev deployments where the API and Aerospike share a host (the
    compose.dev.yaml workflow exercises this routinely).
    """
    if _allow_private_targets():
        return False
    candidate = host.strip()
    if not candidate:
        return False
    # IPv6 literals may arrive bracketed (`[::1]`); strip before parsing.
    if candidate.startswith("[") and candidate.endswith("]"):
        candidate = candidate[1:-1]
    try:
        ip = ipaddress.ip_address(candidate)
    except ValueError:
        # Not a bare IP literal -- let it through; DNS-based abuse is
        # explicitly out of scope per the docstring rationale.
        return False
    if ip.is_loopback:
        return True
    return bool(ip.is_link_local)


async def _assert_workspace_visible(workspace_id: str, caller_owner_id: str | None) -> None:
    """Raise :class:`WorkspaceNotFoundError` if the workspace is missing or invisible.

    ``caller_owner_id`` is ``None`` for legacy callers that have not yet
    been threaded through the ACL (none in Phase 0b — every path passes
    a real value). When provided, visibility is the same rule the
    workspaces service applies: ``ownerId == caller`` OR
    ``ownerId == 'system'``. Treating "exists but you don't own it" as a
    plain 404 prevents id enumeration.
    """
    ws = await db.get_workspace(workspace_id)
    if ws is None:
        raise WorkspaceNotFoundError(workspace_id)
    if caller_owner_id is None:
        return
    if ws.ownerId != caller_owner_id and ws.ownerId != SYSTEM_OWNER_ID:
        raise WorkspaceNotFoundError(workspace_id)


async def list_connections(
    workspace_id: str | None,
    caller_owner_id: str | None = None,
) -> list[ConnectionProfileResponse]:
    """Return all saved connection profiles, optionally filtered by workspace.

    Raises :class:`WorkspaceNotFoundError` if a non-None ``workspace_id``
    is provided and no such workspace exists, *or* the workspace exists
    but is invisible to ``caller_owner_id`` (Phase 2 — issue #307).
    ``caller_owner_id=None`` keeps the legacy single-tenant behaviour
    for code paths that have not been threaded through the ACL yet.
    """
    if workspace_id is not None:
        await _assert_workspace_visible(workspace_id, caller_owner_id)
    profiles = await db.get_all_connections(workspace_id)

    if caller_owner_id is not None and workspace_id is None:
        try:
            workspaces = await db.get_all_workspaces()
        except db.DBNotInitialized:
            workspaces = []
        visible_ws_ids = {ws.id for ws in workspaces if ws.ownerId == caller_owner_id or ws.ownerId == SYSTEM_OWNER_ID}
        profiles = [p for p in profiles if (p.workspaceId or DEFAULT_WORKSPACE_ID) in visible_ws_ids]

    return [ConnectionProfileResponse.from_profile(p) for p in profiles]


async def get_connection(conn_id: str, caller_owner_id: str) -> ConnectionProfileResponse:
    """Return the connection profile with id ``conn_id`` if visible to caller.

    Raises ``ConnectionNotFoundError`` when the row does not exist *or*
    when it exists but the caller does not own the underlying workspace
    (and the workspace is not the SYSTEM-shared bucket). Identity-404
    so id enumeration cannot distinguish "missing" from "exists but not
    yours".

    ``caller_owner_id`` is mandatory -- previously this service entry
    had no ACL plumbed through and relied on every caller to gate
    beforehand. That made it a regression trap: any future caller
    forgetting the gate would silently expose cross-tenant connections.
    Threading the parameter through forces the contract.
    """
    conn = await db.get_connection(conn_id)
    if not conn:
        raise ConnectionNotFoundError(conn_id)
    workspace_id = getattr(conn, "workspaceId", None)
    if workspace_id is None:
        # Legacy / dict-fixture connection with no workspace association.
        # Treat as system-shared so the pre-#307 wire shape is preserved.
        return ConnectionProfileResponse.from_profile(conn)
    try:
        workspace = await db.get_workspace(workspace_id)
    except db.DBNotInitialized:
        # Unit-test paths that don't drive the workspace DB keep the
        # legacy permissive behaviour -- matches the dependency-layer
        # convention in :func:`dependencies._get_verified_connection`.
        return ConnectionProfileResponse.from_profile(conn)
    if workspace is None:
        raise ConnectionNotFoundError(conn_id)
    if workspace.ownerId != caller_owner_id and workspace.ownerId != SYSTEM_OWNER_ID:
        raise ConnectionNotFoundError(conn_id)
    return ConnectionProfileResponse.from_profile(conn)


async def create_connection(
    payload: CreateConnectionRequest,
    caller_owner_id: str | None = None,
) -> ConnectionProfileResponse:
    """Persist a new connection profile and return it (without password).

    Falls back to :data:`DEFAULT_WORKSPACE_ID` when the request omits the
    workspace. Raises :class:`WorkspaceNotFoundError` if the resolved
    workspace does not exist OR (Phase 2) is invisible to
    ``caller_owner_id``.
    """
    workspace_id = payload.workspaceId or DEFAULT_WORKSPACE_ID
    await _assert_workspace_visible(workspace_id, caller_owner_id)

    now = datetime.now(UTC).isoformat()
    conn = ConnectionProfile(
        id=f"conn-{uuid.uuid4().hex[:12]}",
        name=payload.name,
        hosts=payload.hosts,
        port=payload.port,
        clusterName=payload.clusterName,
        username=payload.username,
        password=payload.password,
        color=payload.color,
        note=payload.note,
        labels=payload.labels or {},
        workspaceId=workspace_id,
        createdAt=now,
        updatedAt=now,
    )
    await db.create_connection(conn)
    return ConnectionProfileResponse.from_profile(conn)


async def update_connection(
    conn_id: str,
    payload: UpdateConnectionRequest,
    caller_owner_id: str | None = None,
) -> ConnectionProfileResponse:
    """Apply a partial update to ``conn_id`` and return the new state.

    Raises :class:`ConnectionNotFoundError` if the connection does not
    exist, or :class:`WorkspaceNotFoundError` if the request moves it to
    a workspace that is missing or (Phase 2) invisible to
    ``caller_owner_id``.
    """
    update_data = payload.model_dump(exclude_unset=True, by_alias=False)
    if "workspaceId" in update_data and update_data["workspaceId"] is not None:
        target_ws = update_data["workspaceId"]
        await _assert_workspace_visible(target_ws, caller_owner_id)

    conn = await db.update_connection(conn_id, update_data)
    if not conn:
        raise ConnectionNotFoundError(conn_id)
    return ConnectionProfileResponse.from_profile(conn)


async def delete_connection(conn_id: str, caller_owner_id: str | None = None) -> None:
    """Delete a connection profile and close its cached Aerospike client.

    Idempotent: deleting a missing connection is a no-op. The HTTP router
    still gates on existence via the ``_get_verified_connection``
    dependency — so the wire-level ``DELETE`` keeps its 404-on-missing
    semantics. Direct service-layer callers see the idempotent behaviour
    directly. (The pre-refactor router returned 404 from inside the
    handler; the new layout pushes that gate up to the dependency.)

    ``caller_owner_id`` is plumbed through as defense-in-depth: the
    dependency-layer gate already rejects cross-tenant DELETEs, but a
    future caller (a refactor, an internal task) bypassing that path
    would otherwise erase a connection it does not own. Mirrors the
    pattern in :func:`get_connection` / :func:`update_connection`.
    ``None`` keeps the legacy single-tenant behaviour for callers not
    yet threaded.
    """
    if caller_owner_id is not None:
        # Re-do the same visibility check the dependency does so that
        # bypassing the router cannot silently delete cross-tenant rows.
        # ``ConnectionNotFoundError`` is the matching wire shape — id
        # enumeration cannot distinguish "missing" from "exists but not
        # yours".
        existing = await db.get_connection(conn_id)
        if existing is not None:
            workspace_id = getattr(existing, "workspaceId", None)
            if workspace_id is not None:
                try:
                    workspace = await db.get_workspace(workspace_id)
                except db.DBNotInitialized:
                    workspace = None
                if workspace is not None and workspace.ownerId not in (caller_owner_id, SYSTEM_OWNER_ID):
                    raise ConnectionNotFoundError(conn_id)
    await db.delete_connection(conn_id)
    await client_manager.close_client(conn_id)


async def test_connection(req: TestConnectionRequest) -> TestConnectionResult:
    """Probe Aerospike connectivity without persisting a profile.

    Returns a :class:`TestConnectionResult`. Never raises -- any error is
    captured and surfaced as ``success=False`` so HTTP wrappers can
    forward the wire shape unchanged.

    SSRF gate: targets that resolve to loopback / link-local literals
    (including the EC2 IMDS ``169.254.169.254``) are rejected before any
    network syscall fires. The blocked path returns the same
    ``success=False`` shape as a real connection failure so a probing
    caller cannot distinguish "blocked" from "unreachable" by the wire
    response alone -- the discriminator is operator-only via the
    structured log.
    """
    # Default-deny SSRF gate. Apply once at the top, before any network
    # syscall, so an attacker cannot use this surface to enumerate
    # internal listeners (Redis on 127.0.0.1, IMDS on 169.254.169.254,
    # cloud SQL proxies on the host loopback). The check is cheap (pure
    # ip parsing) and keyed on bare IP literals -- DNS hostnames are
    # outside the gate; egress firewalls are expected to backstop those.
    for host_str in req.hosts:
        host_only, _ = parse_host_port(host_str, req.port)
        if _is_blocked_target(host_only):
            logger.warning(
                "Test connection blocked: target=%s reason=loopback_or_link_local",
                host_str,
            )
            return TestConnectionResult(
                success=False,
                message="connection failed",
            )
    try:
        hosts = [parse_host_port(h, req.port) for h in req.hosts]

        config: dict[str, Any] = {"hosts": hosts}
        if req.username and req.password:
            config["user"] = req.username
            config["password"] = req.password

        client = aerospike_py.AsyncClient(config)
        await client.connect()
        try:
            if not client.is_connected():
                return TestConnectionResult(success=False, message="Failed to connect")
            return TestConnectionResult(success=True, message="Connected successfully")
        finally:
            with contextlib.suppress(AerospikeError, OSError):
                await client.close()
    except Exception as e:
        logger.warning("Test connection failed: %s", type(e).__name__)
        return TestConnectionResult(success=False, message="connection failed")
