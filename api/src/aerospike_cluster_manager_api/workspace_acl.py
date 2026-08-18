"""Workspace visibility — the one rule, in one place.

This module exists because the rule had two consumers and only one gate.
``routers/k8s_clusters.py`` enforced it on all 24 ``{name}`` routes and on the
list filter; ``events/collector.py`` published the same objects over SSE with
no check at all, so a tenant received unasked the very CRs that 404 for them
on REST (#496).

Duplicating an ACL predicate in the second consumer would have set up the same
failure again, one refactor later. Both consumers now import from here.

The rule, unchanged from the REST gate:

* a **labelled** CR is visible to the owner of its workspace, and to everyone
  when that workspace is system-owned (``ws-default``);
* an **unlabelled** CR is visible only to :data:`SYSTEM_OWNER_ID` — ACM stamps
  a label on every cluster it creates, so unlabelled means "ACM did not create
  this" (see #471).
"""

from __future__ import annotations

import logging
from typing import Any

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.models.workspace import SYSTEM_OWNER_ID

logger = logging.getLogger(__name__)

WORKSPACE_LABEL = "acm.aerospike.com/workspace"

__all__ = [
    "WORKSPACE_LABEL",
    "cr_workspace_id",
    "is_cr_visible",
    "is_workspace_visible",
]


def cr_workspace_id(item: dict[str, Any]) -> str | None:
    """Return the workspace id stamped on a CR's metadata labels, if any."""
    labels = (item.get("metadata", {}) or {}).get("labels") or {}
    raw = labels.get(WORKSPACE_LABEL)
    return raw if isinstance(raw, str) and raw else None


async def is_workspace_visible(workspace_id: str, caller_owner_id: str) -> bool:
    """Return True iff ``caller_owner_id`` can see ``workspace_id``.

    Visibility = ``ownerId == caller`` OR ``ownerId == SYSTEM_OWNER_ID``.
    Missing rows are invisible.

    When the workspace metaDB has not been initialised, this degrades to
    **permissive**. That is a permissive branch inside a default-deny gate and
    it is deliberate, not an oversight: unit-test paths exercise the K8s router
    without a workspace DB, and the same convention is used by notes and
    records. No production path reaches it — ``db.init_db()`` runs in the
    lifespan before any route is served. Callers that must fail closed
    regardless should use :func:`is_cr_visible` with ``strict=True``.
    """
    try:
        ws = await db.get_workspace(workspace_id)
    except db.DBNotInitialized:
        return True
    if ws is None:
        return False
    return ws.ownerId == caller_owner_id or ws.ownerId == SYSTEM_OWNER_ID


async def is_cr_visible(
    workspace_id: str | None,
    caller_owner_id: str,
    *,
    strict: bool = False,
) -> bool:
    """Return True iff a CR carrying ``workspace_id`` is visible to the caller.

    ``workspace_id=None`` (an unlabelled CR) is visible only to the system
    caller — anything applied with ``kubectl`` or by another team carries no
    ACM label, and those must not reach a tenant (#471).

    ``strict=True`` also denies when the workspace metaDB is unavailable. The
    SSE path uses it: there is no legacy behaviour to preserve on a push
    channel that has never had a filter, so it fails closed.
    """
    if workspace_id is None:
        return caller_owner_id == SYSTEM_OWNER_ID
    if not strict:
        return await is_workspace_visible(workspace_id, caller_owner_id)
    try:
        ws = await db.get_workspace(workspace_id)
    except db.DBNotInitialized:
        logger.warning("Workspace DB unavailable; denying SSE delivery for workspace %s", workspace_id)
        return False
    if ws is None:
        return False
    return ws.ownerId == caller_owner_id or ws.ownerId == SYSTEM_OWNER_ID
