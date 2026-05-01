"""Tests for X-Request-ID trace middleware."""

from __future__ import annotations

import asyncio
import io
import json
import logging
import re

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.logging_config import setup_logging
from aerospike_cluster_manager_api.main import app
from aerospike_cluster_manager_api.middleware.trace_id import (
    REQUEST_ID_HEADER,
    RequestIDFilter,
    TraceIDMiddleware,
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


# ---------------------------------------------------------------------------
# PR #253 review additions: error path, JSON correlation, idempotent setup,
# inbound validation, concurrent isolation.
# ---------------------------------------------------------------------------


def _build_app_with_routes() -> FastAPI:
    """Standalone FastAPI app with TraceIDMiddleware + a deliberate error route."""
    from fastapi.responses import JSONResponse

    test_app = FastAPI()
    test_app.add_middleware(TraceIDMiddleware)

    @test_app.exception_handler(RuntimeError)
    async def _runtime(_req, _exc) -> JSONResponse:  # type: ignore[no-untyped-def]
        return JSONResponse(status_code=500, content={"detail": "boom"})

    @test_app.get("/boom")
    async def boom() -> dict:
        raise RuntimeError("kaboom")

    @test_app.get("/ok")
    async def ok() -> dict:
        return {"ok": True}

    return test_app


@pytest.mark.anyio
async def test_trace_id_present_on_error_response():
    """A route that raises must still echo X-Request-ID on the response."""
    test_app = _build_app_with_routes()
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/boom", headers={REQUEST_ID_HEADER: "client-trace-on-error-1"})
    # Even when the route raises, TraceIDMiddleware (BaseHTTPMiddleware) must
    # still set the response header before returning to the caller.
    assert resp.status_code == 500
    assert resp.headers.get(REQUEST_ID_HEADER) == "client-trace-on-error-1"


def test_json_log_correlation_uses_request_id():
    """JSON log records emitted while a request id is in scope carry it."""
    from pythonjsonlogger.json import JsonFormatter

    buf = io.StringIO()
    formatter = JsonFormatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(request_id)s %(message)s",
        rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
        defaults={"request_id": "-"},
    )
    handler = logging.StreamHandler(buf)
    handler.setFormatter(formatter)
    handler.addFilter(RequestIDFilter())
    test_logger = logging.getLogger("aerospike_cluster_manager_api.tests.json_correlation")
    test_logger.handlers = [handler]
    test_logger.setLevel(logging.INFO)
    test_logger.propagate = False

    token = request_id_var.set("supplied-trace-json-correlate-001")
    try:
        test_logger.info("hello structured world")
    finally:
        request_id_var.reset(token)

    line = buf.getvalue().strip().splitlines()[-1]
    payload = json.loads(line)
    assert payload["request_id"] == "supplied-trace-json-correlate-001"
    assert payload["message"] == "hello structured world"


def test_setup_logging_is_idempotent():
    """Calling setup_logging twice must not accumulate stacked handlers."""
    setup_logging("INFO", "text")
    handlers_after_first = list(logging.getLogger("aerospike_cluster_manager_api").handlers)
    setup_logging("INFO", "text")
    handlers_after_second = list(logging.getLogger("aerospike_cluster_manager_api").handlers)
    assert len(handlers_after_first) == 1
    assert len(handlers_after_second) == 1
    # Ensure the second call replaced rather than appended (different object).
    assert handlers_after_second[0] is not handlers_after_first[0]


@pytest.mark.anyio
async def test_invalid_inbound_request_id_is_replaced():
    """A header containing forbidden characters must be dropped and replaced."""
    test_app = _build_app_with_routes()
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/ok", headers={REQUEST_ID_HEADER: "<script>alert(1)</script>"})
    assert resp.status_code == 200
    rid = resp.headers.get(REQUEST_ID_HEADER)
    assert rid is not None
    assert rid != "<script>alert(1)</script>"
    # Replacement is uuid4().hex form.
    assert _UUID_HEX_RE.match(rid)


@pytest.mark.anyio
async def test_too_short_inbound_request_id_is_replaced():
    """Short header values fall outside the regex and must be replaced."""
    test_app = _build_app_with_routes()
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/ok", headers={REQUEST_ID_HEADER: "abc"})
    assert resp.status_code == 200
    assert _UUID_HEX_RE.match(resp.headers[REQUEST_ID_HEADER])


@pytest.mark.anyio
async def test_concurrent_requests_have_isolated_ids():
    """50 concurrent requests must each get their own id (proves ContextVar isolation)."""
    test_app = _build_app_with_routes()
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:

        async def hit() -> str:
            r = await ac.get("/ok")
            return r.headers[REQUEST_ID_HEADER]

        ids = await asyncio.gather(*(hit() for _ in range(50)))
    assert len(ids) == 50
    assert len(set(ids)) == 50, "expected 50 distinct request ids across concurrent requests"
    for rid in ids:
        assert _UUID_HEX_RE.match(rid), f"non-uuid hex id leaked: {rid!r}"
