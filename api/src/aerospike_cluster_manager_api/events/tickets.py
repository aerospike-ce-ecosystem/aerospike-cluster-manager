"""Single-use, short-TTL opaque tickets for authenticating SSE streams.

Browsers' native ``EventSource`` cannot send an ``Authorization`` header, and
placing the JWT in the URL query string leaks it into ingress access logs,
browser history, and Referer headers (issue #345, ADR-0040 follow-up).

Instead, the SPA first calls ``POST /api/v1/events/ticket`` with the normal
``Authorization: Bearer <jwt>`` header. The endpoint mints a short-lived
(``SSE_TICKET_TTL_SECONDS``, default 30s), single-use opaque ticket bound to
the verified token's claims. The EventSource then connects with
``?ticket=<opaque>`` and :class:`~.oidc_auth.OIDCAuthMiddleware` redeems —
and thereby *burns* — the ticket on first use. A ticket value that leaks
into an access log is therefore already worthless by the time anyone can
read it, and the long-lived JWT never appears in a URL at all.

The store is process-local (a dict on the event loop; all operations are
synchronous, so no locking is needed). Multi-replica API deployments must
route the mint request and the subsequent stream connect to the same replica
(session affinity on ``/api/*``) or replace this store with a shared one.
The ADR-0040 topology runs one API instance per operator cluster, where this
is a non-issue.
"""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from typing import Any

from aerospike_cluster_manager_api import config


class TicketCapacityError(Exception):
    """Raised when the pending-ticket table is full (mint flood guard)."""


@dataclass
class _PendingTicket:
    expires_at: float
    claims: dict[str, Any] = field(default_factory=dict)


class SSETicketStore:
    """In-memory single-use ticket table.

    * ``issue()`` mints a 256-bit urlsafe token and remembers the caller's
      verified claims until the TTL elapses.
    * ``redeem()`` pops the entry (single use) and returns the claims, or
      ``None`` when the ticket is unknown, already used, or expired.

    Expired entries are purged opportunistically on every ``issue()`` —
    tickets share a uniform TTL, so no background sweeper is required.
    """

    def __init__(
        self,
        ttl_seconds: int = 30,
        max_pending: int = 1024,
    ) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_pending = max_pending
        self._pending: dict[str, _PendingTicket] = {}

    @property
    def pending_count(self) -> int:
        return len(self._pending)

    def issue(self, claims: dict[str, Any] | None = None) -> tuple[str, int]:
        """Mint a new ticket bound to ``claims``.

        Returns ``(ticket, expires_in_seconds)``.

        Raises:
            TicketCapacityError: when ``max_pending`` unexpired tickets are
                already outstanding. Minting requires an authenticated
                request, so hitting this cap means either a misbehaving
                client loop or an abuse attempt — reject rather than evict.
        """
        now = time.time()
        self._purge_expired(now)
        if len(self._pending) >= self.max_pending:
            raise TicketCapacityError(f"Too many pending SSE tickets (max {self.max_pending})")
        ticket = secrets.token_urlsafe(32)
        self._pending[ticket] = _PendingTicket(
            expires_at=now + self.ttl_seconds,
            claims=dict(claims or {}),
        )
        return ticket, self.ttl_seconds

    def redeem(self, ticket: str) -> dict[str, Any] | None:
        """Consume ``ticket`` and return its claims, or ``None`` if invalid.

        The entry is removed unconditionally (``dict.pop``), so a ticket can
        only ever be redeemed once — a replayed URL fails even inside the
        TTL window.
        """
        entry = self._pending.pop(ticket, None)
        if entry is None:
            return None
        if time.time() >= entry.expires_at:
            return None
        return entry.claims

    def clear(self) -> None:
        """Drop all pending tickets — testing/shutdown helper."""
        self._pending.clear()

    def _purge_expired(self, now: float) -> None:
        expired = [t for t, entry in self._pending.items() if now >= entry.expires_at]
        for t in expired:
            del self._pending[t]


# Module singleton — shared by the mint endpoint (routers/events.py) and the
# redeeming middleware (middleware/oidc_auth.py). Sized from config at import
# time, matching how the rest of the config surface is consumed.
ticket_store = SSETicketStore(
    ttl_seconds=config.SSE_TICKET_TTL_SECONDS,
    max_pending=config.SSE_TICKET_MAX_PENDING,
)
