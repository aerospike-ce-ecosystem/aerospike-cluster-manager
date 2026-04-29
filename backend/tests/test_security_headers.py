"""Tests for security headers middleware and proxy-aware rate limiting."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.main import app
from aerospike_cluster_manager_api.rate_limit import _get_client_ip


@pytest.fixture()
def anyio_backend():
    return "asyncio"


@pytest.fixture()
async def client(init_test_db):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_security_headers_present(client: AsyncClient):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert resp.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "camera=()" in resp.headers["Permissions-Policy"]
    assert "default-src 'self'" in resp.headers["Content-Security-Policy"]


@pytest.mark.anyio
async def test_hsts_disabled_by_default(client: AsyncClient):
    resp = await client.get("/api/health")
    assert "Strict-Transport-Security" not in resp.headers


@pytest.mark.anyio
async def test_hsts_enabled_when_configured(init_test_db):
    with patch("aerospike_cluster_manager_api.config.ENABLE_HSTS", True):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/health")
            assert "Strict-Transport-Security" in resp.headers
            assert "max-age=63072000" in resp.headers["Strict-Transport-Security"]


@pytest.mark.anyio
async def test_csp_report_uri(init_test_db):
    with patch("aerospike_cluster_manager_api.config.CSP_REPORT_URI", "https://example.com/csp-report"):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/health")
            assert "report-uri https://example.com/csp-report" in resp.headers["Content-Security-Policy"]


# ---------------------------------------------------------------------------
# Swagger UI is CSP-compliant under script-src 'self' (#238)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_swagger_docs_has_no_inline_script(client: AsyncClient):
    """/api/docs must not emit inline <script> blocks — CSP `script-src 'self'` blocks them (#238)."""
    resp = await client.get("/api/docs")
    assert resp.status_code == 200
    body = resp.text
    # Strict CSP must still apply on the docs page itself.
    assert "script-src 'self'" in resp.headers["Content-Security-Policy"]
    # The bootstrap call must come from an external script, not an inline block.
    assert "SwaggerUIBundle({" not in body
    assert '<script src="/api/docs/swagger-init.js"></script>' in body
    assert '<script src="/api/docs/static/swagger-ui-bundle.js"></script>' in body


@pytest.mark.anyio
async def test_swagger_init_js_is_served_with_js_mime(client: AsyncClient):
    """The bootstrap script must be served as application/javascript so the browser executes it."""
    resp = await client.get("/api/docs/swagger-init.js")
    assert resp.status_code == 200
    assert resp.headers["Content-Type"].startswith("application/javascript")
    assert "SwaggerUIBundle({" in resp.text


# ---------------------------------------------------------------------------
# CSP_ENABLED toggle — disables in-app CSP and falls /api/docs back to FastAPI
# default (CDN swagger-ui 5.x with inline init, full OpenAPI 3.1 support, #241)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_csp_disabled_strips_header_and_uses_cdn_docs(init_test_db):
    """With CSP_ENABLED=false, no CSP header is emitted and /api/docs uses FastAPI's CDN-backed default."""
    with patch("aerospike_cluster_manager_api.config.CSP_ENABLED", False):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            health = await ac.get("/api/health")
            assert "Content-Security-Policy" not in health.headers

            docs = await ac.get("/api/docs")
            assert docs.status_code == 200
            body = docs.text
            # FastAPI default loads swagger-ui from jsdelivr CDN.
            assert "cdn.jsdelivr.net/npm/swagger-ui-dist" in body
            # And uses the inline bootstrap call (which our CSP would have blocked).
            assert "SwaggerUIBundle({" in body


# ---------------------------------------------------------------------------
# Proxy-aware rate limit key function
# ---------------------------------------------------------------------------


class _FakeRequest:
    """Minimal request stub for testing _get_client_ip."""

    def __init__(self, client_host: str, forwarded_for: str | None = None):
        self.client = type("C", (), {"host": client_host})()
        self._headers: dict[str, str] = {}
        if forwarded_for is not None:
            self._headers["X-Forwarded-For"] = forwarded_for
        self.headers = self._headers


def test_get_client_ip_direct():
    req = _FakeRequest("192.168.1.10")
    assert _get_client_ip(req) == "192.168.1.10"


def test_get_client_ip_ignores_xff_from_untrusted():
    with patch("aerospike_cluster_manager_api.config.TRUSTED_PROXIES", ["10.0.0.1"]):
        req = _FakeRequest("192.168.1.10", forwarded_for="1.2.3.4")
        assert _get_client_ip(req) == "192.168.1.10"


def test_get_client_ip_respects_xff_from_trusted():
    with patch("aerospike_cluster_manager_api.config.TRUSTED_PROXIES", ["10.0.0.1"]):
        req = _FakeRequest("10.0.0.1", forwarded_for="203.0.113.50")
        assert _get_client_ip(req) == "203.0.113.50"


def test_get_client_ip_ignores_spoofed_xff_prefix():
    """Attacker-prepended IPs in X-Forwarded-For must be ignored."""
    with patch("aerospike_cluster_manager_api.config.TRUSTED_PROXIES", ["10.0.0.1"]):
        req = _FakeRequest("10.0.0.1", forwarded_for="spoofed.ip, 203.0.113.50")
        assert _get_client_ip(req) == "203.0.113.50"


def test_get_client_ip_no_xff_from_trusted():
    with patch("aerospike_cluster_manager_api.config.TRUSTED_PROXIES", ["10.0.0.1"]):
        req = _FakeRequest("10.0.0.1")
        assert _get_client_ip(req) == "10.0.0.1"
