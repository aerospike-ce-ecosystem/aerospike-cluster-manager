"""Tests for X-Request-ID trace middleware."""

from __future__ import annotations

import logging
import re

import pytest
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.main import app
from aerospike_cluster_manager_api.middleware.trace_id import (
    REQUEST_ID_HEADER,
    RequestIDFilter,
    request_id_var,
)

# uuid.uuid4().hex form: 32 lowercase hex chars, no dashes.
_UUID_HEX_RE = re.compile(r"^[0-9a-f]{32}$")


@pytest.fixture()
def anyio_backend():
    return "asyncio"


@pytest.fixture()
async def client(init_test_db):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.anyio
async def test_trace_id_generated_when_missing(client: AsyncClient):
    """Server mints a fresh uuid4 hex when the client does not send one."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    rid = resp.headers.get(REQUEST_ID_HEADER)
    assert rid is not None, "X-Request-ID must be present in the response"
    assert _UUID_HEX_RE.match(rid), f"expected 32-char hex uuid, got {rid!r}"


@pytest.mark.anyio
async def test_trace_id_echoed_when_provided(client: AsyncClient):
    """Server echoes the client-supplied X-Request-ID untouched."""
    supplied = "client-supplied-trace-abc123"
    resp = await client.get("/api/health", headers={REQUEST_ID_HEADER: supplied})
    assert resp.status_code == 200
    assert resp.headers.get(REQUEST_ID_HEADER) == supplied


@pytest.mark.anyio
async def test_trace_id_unique_per_request(client: AsyncClient):
    """Two requests without an explicit id must get distinct generated ids."""
    r1 = await client.get("/api/health")
    r2 = await client.get("/api/health")
    assert r1.headers[REQUEST_ID_HEADER] != r2.headers[REQUEST_ID_HEADER]


def test_request_id_filter_default():
    """Outside any request, the filter falls back to the '-' sentinel."""
    f = RequestIDFilter()
    record = logging.LogRecord(
        name="t", level=logging.INFO, pathname=__file__, lineno=1, msg="x", args=(), exc_info=None
    )
    assert f.filter(record) is True
    # request_id is set dynamically by the filter; use getattr to keep static
    # type checkers happy.
    assert getattr(record, "request_id", None) == "-"


def test_request_id_filter_uses_contextvar():
    """Inside the ContextVar scope, the filter populates record.request_id."""
    token = request_id_var.set("trace-from-ctx-var")
    try:
        f = RequestIDFilter()
        record = logging.LogRecord(
            name="t", level=logging.INFO, pathname=__file__, lineno=1, msg="x", args=(), exc_info=None
        )
        assert f.filter(record) is True
        assert getattr(record, "request_id", None) == "trace-from-ctx-var"
    finally:
        request_id_var.reset(token)
