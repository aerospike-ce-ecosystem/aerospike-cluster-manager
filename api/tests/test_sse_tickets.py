"""Tests for the single-use SSE ticket store and the mint endpoint.

The middleware-level flow (mint via Authorization header → connect with
``?ticket=`` → burned on first use) is covered in ``test_oidc_auth.py``;
this module unit-tests the store itself and the router endpoint wiring in
``main.app`` (OIDC disabled — mint still works so non-OIDC deployments keep
a single client code path).
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.events.tickets import (
    SSETicketStore,
    TicketCapacityError,
    ticket_store,
)


@pytest.fixture(autouse=True)
def _clean_ticket_store():
    ticket_store.clear()
    yield
    ticket_store.clear()


# ---------------------------------------------------------------------------
# SSETicketStore unit tests
# ---------------------------------------------------------------------------


def test_issue_and_redeem_roundtrip():
    store = SSETicketStore(ttl_seconds=30)
    ticket, expires_in = store.issue({"sub": "user-1"})
    assert expires_in == 30
    assert store.pending_count == 1
    assert store.redeem(ticket) == {"sub": "user-1"}
    assert store.pending_count == 0


def test_redeem_is_single_use():
    store = SSETicketStore()
    ticket, _ = store.issue({"sub": "user-1"})
    assert store.redeem(ticket) is not None
    assert store.redeem(ticket) is None


def test_redeem_unknown_ticket_returns_none():
    store = SSETicketStore()
    assert store.redeem("no-such-ticket") is None


def test_expired_ticket_is_rejected():
    store = SSETicketStore(ttl_seconds=0)
    ticket, _ = store.issue({"sub": "user-1"})
    assert store.redeem(ticket) is None


def test_issue_purges_expired_entries():
    store = SSETicketStore(ttl_seconds=0)
    store.issue()
    assert store.pending_count == 1
    # The previous (instantly-expired) entry is swept on the next mint, so
    # the table never accumulates dead tickets.
    store.issue()
    assert store.pending_count == 1


def test_capacity_cap_rejects_when_full():
    store = SSETicketStore(ttl_seconds=60, max_pending=2)
    first, _ = store.issue()
    store.issue()
    with pytest.raises(TicketCapacityError):
        store.issue()
    # Redeeming frees a slot, so minting works again.
    assert store.redeem(first) is not None
    ticket, _ = store.issue()
    assert ticket


def test_claims_are_copied_not_aliased():
    store = SSETicketStore()
    claims = {"sub": "user-1"}
    ticket, _ = store.issue(claims)
    claims["sub"] = "tampered"
    assert store.redeem(ticket) == {"sub": "user-1"}


def test_none_claims_issue_empty_dict():
    store = SSETicketStore()
    ticket, _ = store.issue(None)
    assert store.redeem(ticket) == {}


def test_tickets_are_unique_and_high_entropy():
    store = SSETicketStore()
    t1, _ = store.issue()
    t2, _ = store.issue()
    assert t1 != t2
    # 32 random bytes urlsafe-encode to 43 chars — opaque, not a JWT.
    assert len(t1) >= 43
    assert t1.count(".") == 0


def test_clear_drops_all_pending():
    store = SSETicketStore()
    store.issue()
    store.issue()
    store.clear()
    assert store.pending_count == 0


# ---------------------------------------------------------------------------
# Mint endpoint wiring through main.app (OIDC disabled)
# ---------------------------------------------------------------------------


@pytest.fixture()
async def client(init_test_db):
    """Test client against the real app with SSE enabled."""
    with (
        patch("aerospike_cluster_manager_api.config.SSE_ENABLED", True),
        patch("aerospike_cluster_manager_api.routers.events.config.SSE_ENABLED", True),
    ):
        from aerospike_cluster_manager_api.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


async def test_mint_ticket_endpoint_returns_single_use_ticket(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/events/ticket")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["ticket"], str) and body["ticket"]
    assert body["expires_in"] > 0
    # The minted ticket is registered and redeems exactly once.
    assert ticket_store.redeem(body["ticket"]) is not None
    assert ticket_store.redeem(body["ticket"]) is None


async def test_mint_ticket_legacy_alias(client: AsyncClient) -> None:
    """The unversioned /api alias mints too (mounted alongside /api/v1)."""
    resp = await client.post("/api/events/ticket")
    assert resp.status_code == 200
    assert resp.json()["ticket"]


async def test_mint_ticket_returns_404_when_sse_disabled(init_test_db) -> None:
    with (
        patch("aerospike_cluster_manager_api.config.SSE_ENABLED", False),
        patch("aerospike_cluster_manager_api.routers.events.config.SSE_ENABLED", False),
    ):
        from aerospike_cluster_manager_api.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/api/v1/events/ticket")
            assert resp.status_code == 404
            assert resp.json()["detail"] == "SSE streaming is disabled"


async def test_mint_ticket_returns_429_at_capacity(client: AsyncClient) -> None:
    with patch.object(ticket_store, "max_pending", 0):
        resp = await client.post("/api/v1/events/ticket")
    assert resp.status_code == 429
    assert "Too many pending SSE tickets" in resp.json()["detail"]
