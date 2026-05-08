"""Tests for the MCP bearer-token middleware.

The middleware sits in front of the MCP mount and applies an
OR-combined gate with the existing OIDC middleware:

* Pre-conditions:
  - It runs ONLY on requests whose ``url.path`` begins with
    ``config.ACM_MCP_PATH`` (default ``/mcp``).
  - It is installed only when ``ACM_MCP_ENABLED=true`` (the mount
    itself is also gated by that flag).

* Truth table when ``ACM_MCP_TOKEN`` is set:

    | OIDC says authenticated | Bearer matches token | Result |
    |-------------------------|----------------------|--------|
    | yes                     | n/a                  | pass   |
    | no                      | yes                  | pass   |
    | no                      | no / missing         | 401    |

* When ``ACM_MCP_TOKEN`` is unset, the middleware is a pass-through
  and defers entirely to the existing OIDC middleware.

Tests build a tiny FastAPI app, install the middleware directly, and
probe it via :class:`httpx.ASGITransport` — no uvicorn, no real
network. A separate group of tests exercises the conditional
installation in :mod:`aerospike_cluster_manager_api.main` via the
same ``importlib.reload`` pattern that ``test_main_mount.py`` uses.
"""

from __future__ import annotations

import importlib
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_app(
    *,
    install_oidc_stub: bool = False,
    oidc_authenticated: bool = False,
) -> FastAPI:
    """Construct an app that mirrors the real /mcp + /api shape.

    The MCP middleware is installed by the test using
    ``app.add_middleware(MCPBearerTokenMiddleware)`` — same call site as
    ``main.py``. When ``install_oidc_stub`` is true an additional
    middleware is wired up that simulates OIDC by setting
    ``request.state.user_claims`` to a dummy claim dict on every request — this
    lets us exercise the OIDC-OR-bearer leg without spinning up a real
    JWKS server.
    """
    from aerospike_cluster_manager_api.mcp.auth import MCPBearerTokenMiddleware

    app = FastAPI()

    @app.get("/mcp")
    async def mcp_root() -> dict:
        return {"ok": True}

    @app.get("/mcp/sub/path")
    async def mcp_sub() -> dict:
        return {"ok": True}

    @app.get("/api/health")
    async def health() -> dict:
        return {"status": "ok"}

    # MCP middleware first (installed before OIDC stub so it runs AFTER
    # the OIDC stub at request time — Starlette runs middleware in
    # reverse order of add_middleware).
    app.add_middleware(MCPBearerTokenMiddleware)

    if install_oidc_stub:
        # Tiny OIDC stand-in: writes ``request.state.user_claims`` so the
        # MCP middleware sees an authenticated request without us having
        # to mint real JWTs. (Matches the attribute name set by the real
        # ``OIDCAuthMiddleware`` in ``middleware/oidc_auth.py``.)
        class _OIDCStub(BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                if oidc_authenticated:
                    request.state.user_claims = {"sub": "stub-user"}
                return await call_next(request)

        app.add_middleware(_OIDCStub)

    return app


def _reload_config(monkeypatch: pytest.MonkeyPatch, **env: str | None) -> None:
    """Set/unset env vars and reload the config module so module-level
    constants re-evaluate against the patched environment.

    Pass ``key=None`` to unset.
    """
    from aerospike_cluster_manager_api import config as _config

    for key, value in env.items():
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)
    importlib.reload(_config)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


def test_acm_mcp_token_defaults_to_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    """Without the env var set, ``ACM_MCP_TOKEN`` is the empty string."""
    _reload_config(monkeypatch, ACM_MCP_TOKEN=None)
    from aerospike_cluster_manager_api import config as _config

    try:
        assert _config.ACM_MCP_TOKEN == ""
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


def test_acm_mcp_token_reads_env(monkeypatch: pytest.MonkeyPatch) -> None:
    _reload_config(monkeypatch, ACM_MCP_TOKEN="s3cret")
    from aerospike_cluster_manager_api import config as _config

    try:
        assert _config.ACM_MCP_TOKEN == "s3cret"
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


# ---------------------------------------------------------------------------
# Direct middleware tests — token UNSET (delegates to OIDC)
# ---------------------------------------------------------------------------


async def test_token_unset_passes_through_on_mcp_path(monkeypatch: pytest.MonkeyPatch) -> None:
    """When ``ACM_MCP_TOKEN`` is unset, /mcp requests pass through to the
    next layer without enforcement (this leg defers to OIDC)."""
    _reload_config(monkeypatch, ACM_MCP_TOKEN=None)
    try:
        app = _build_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/mcp")
            assert resp.status_code == 200
            assert resp.json() == {"ok": True}
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_token_unset_does_not_touch_non_mcp_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    _reload_config(monkeypatch, ACM_MCP_TOKEN=None)
    try:
        app = _build_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/health")
            assert resp.status_code == 200
            assert resp.json() == {"status": "ok"}
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


# ---------------------------------------------------------------------------
# Direct middleware tests — token SET, no OIDC
# ---------------------------------------------------------------------------


async def test_correct_bearer_token_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        app = _build_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/mcp", headers={"Authorization": "Bearer correct-token"})
            assert resp.status_code == 200
            assert resp.json() == {"ok": True}
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_correct_bearer_token_passes_on_subpath(monkeypatch: pytest.MonkeyPatch) -> None:
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        app = _build_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(
                "/mcp/sub/path",
                headers={"Authorization": "Bearer correct-token"},
            )
            assert resp.status_code == 200
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_missing_authorization_header_yields_401(monkeypatch: pytest.MonkeyPatch) -> None:
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        app = _build_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/mcp")
            assert resp.status_code == 401
            assert resp.json() == {"detail": "MCP authentication required"}
            # M4 — RFC-7235 ``WWW-Authenticate`` challenge header so
            # bearer-aware clients know the scheme + realm.
            assert resp.headers.get("www-authenticate") == 'Bearer realm="acm-mcp"'
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_401_response_carries_www_authenticate_challenge(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Both 401 paths (missing/non-bearer header AND wrong-token) emit the
    same ``WWW-Authenticate: Bearer realm="acm-mcp"`` challenge header so
    a single client implementation can negotiate against either failure
    mode."""
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        app = _build_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Missing header
            resp = await ac.get("/mcp")
            assert resp.status_code == 401
            assert resp.headers.get("www-authenticate") == 'Bearer realm="acm-mcp"'
            # Wrong token
            resp = await ac.get("/mcp", headers={"Authorization": "Bearer nope"})
            assert resp.status_code == 401
            assert resp.headers.get("www-authenticate") == 'Bearer realm="acm-mcp"'
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_non_ascii_bearer_token_does_not_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """B1 — A header like ``Bearer café`` would crash
    :func:`secrets.compare_digest` because the function rejects non-ASCII
    ``str`` inputs. The middleware encodes to UTF-8 inside a try/except
    and treats encoding failures as auth failure, so the response must
    be 401 (not 500).

    httpx's ``Headers`` builder normalises header values to ASCII via
    :func:`str.encode`, which throws on a literal ``café`` argument. We
    bypass that by driving the ASGI app directly with a synthetic scope
    whose ``headers`` list contains raw UTF-8-encoded bytes for the
    Authorization value — that's exactly the byte sequence the
    middleware's ``request.headers.get(...)`` call would resolve to in
    a real-world request from a misbehaving client.
    """
    from aerospike_cluster_manager_api.mcp.auth import MCPBearerTokenMiddleware

    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        # Minimal ASGI app under test: just the middleware in front of a
        # 200 endpoint at /mcp. Drive it directly via the ASGI 3 protocol
        # so we can inject non-ASCII bytes as the Authorization value.
        app = _build_app()
        # Compose the same scope httpx would build, but with a non-ASCII
        # Authorization header encoded as UTF-8 bytes.
        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/mcp",
            "raw_path": b"/mcp",
            "query_string": b"",
            "root_path": "",
            "headers": [
                (b"host", b"test"),
                # Non-ASCII bytes — would crash compare_digest if not
                # caught defensively.
                (b"authorization", "Bearer café".encode()),
            ],
            "client": ("127.0.0.1", 12345),
            "server": ("test", 80),
        }

        # Capture the response status by replaying the ASGI events.
        sent: list[dict[str, Any]] = []

        async def receive():  # type: ignore[no-untyped-def]
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):  # type: ignore[no-untyped-def]
            sent.append(message)

        # Sanity check: the middleware class is the dispatcher we expect.
        assert MCPBearerTokenMiddleware is not None
        await app(scope, receive, send)  # pyright: ignore[reportArgumentType]

        # The first message should be ``http.response.start`` with the
        # 401 status code. (Subsequent messages are body chunks.)
        statuses = [m["status"] for m in sent if m["type"] == "http.response.start"]
        assert statuses == [401], f"expected 401, got events {sent!r}"
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_empty_bearer_token_yields_401(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``Bearer `` (empty token) must be rejected with 401, not pass through.
    Even though ``compare_digest`` of two empty strings would return True,
    the middleware short-circuits empty supplied tokens explicitly."""
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        app = _build_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(
                "/mcp",
                headers={"Authorization": "Bearer "},
            )
            assert resp.status_code == 401
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_path_prefix_bypass_attempt_is_not_gated(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """M1 — Path comparison is on segment boundaries. A request to
    ``/mcphax`` (which would pass a naive ``startswith("/mcp")`` check)
    must NOT be intercepted by the MCP middleware — the bearer gate
    should only apply to ``/mcp`` and ``/mcp/...`` paths."""
    from aerospike_cluster_manager_api.mcp.auth import MCPBearerTokenMiddleware

    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        app = FastAPI()

        @app.get("/mcphax")
        async def evil_route() -> dict:
            return {"slipped_through": True}

        app.add_middleware(MCPBearerTokenMiddleware)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # No bearer header — but ``/mcphax`` is not a sub-path of
            # ``/mcp`` so the middleware must NOT intercept and 401 it.
            resp = await ac.get("/mcphax")
            assert resp.status_code == 200
            assert resp.json() == {"slipped_through": True}
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_wrong_bearer_token_yields_401(monkeypatch: pytest.MonkeyPatch) -> None:
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        app = _build_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/mcp", headers={"Authorization": "Bearer wrong-token"})
            assert resp.status_code == 401
            assert resp.json() == {"detail": "MCP authentication required"}
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_non_bearer_scheme_yields_401(monkeypatch: pytest.MonkeyPatch) -> None:
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        app = _build_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Basic auth must not satisfy a bearer gate even if the
            # base64 payload happens to equal the token bytes.
            resp = await ac.get("/mcp", headers={"Authorization": "Basic correct-token"})
            assert resp.status_code == 401
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_bearer_scheme_is_case_insensitive(monkeypatch: pytest.MonkeyPatch) -> None:
    """RFC 7235 — auth scheme matching is case-insensitive."""
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        app = _build_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/mcp", headers={"Authorization": "bearer correct-token"})
            assert resp.status_code == 200
            resp = await ac.get("/mcp", headers={"Authorization": "BEARER correct-token"})
            assert resp.status_code == 200
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


# ---------------------------------------------------------------------------
# Direct middleware tests — token SET, OIDC-OR-bearer
# ---------------------------------------------------------------------------


async def test_oidc_authenticated_passes_even_with_wrong_bearer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If OIDC has authenticated the request (request.state.user_claims set),
    the bearer header is ignored — OIDC alone is enough."""
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        app = _build_app(install_oidc_stub=True, oidc_authenticated=True)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Wrong bearer, but OIDC said yes → pass
            resp = await ac.get("/mcp", headers={"Authorization": "Bearer wrong-token"})
            assert resp.status_code == 200
            # No bearer header at all, but OIDC said yes → pass
            resp = await ac.get("/mcp")
            assert resp.status_code == 200
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_oidc_anonymous_and_wrong_bearer_yields_401(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If OIDC did NOT authenticate the request and the bearer is wrong/
    missing, both legs of the OR fail and the middleware returns 401."""
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        app = _build_app(install_oidc_stub=True, oidc_authenticated=False)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/mcp", headers={"Authorization": "Bearer wrong-token"})
            assert resp.status_code == 401
            assert resp.json() == {"detail": "MCP authentication required"}
            resp = await ac.get("/mcp")
            assert resp.status_code == 401
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_oidc_anonymous_and_correct_bearer_passes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        app = _build_app(install_oidc_stub=True, oidc_authenticated=False)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(
                "/mcp",
                headers={"Authorization": "Bearer correct-token"},
            )
            assert resp.status_code == 200
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


# ---------------------------------------------------------------------------
# OIDC-OR-bearer cooperation — bearer match short-circuits OIDC
# ---------------------------------------------------------------------------


async def test_bearer_match_sets_user_claims_sentinel(monkeypatch: pytest.MonkeyPatch) -> None:
    """A correct bearer match must populate ``request.state.user_claims`` so
    the inner OIDCAuthMiddleware short-circuits and doesn't try to JWT-verify
    the opaque token."""
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        from aerospike_cluster_manager_api.mcp.auth import MCPBearerTokenMiddleware

        observed: dict = {}

        class _ClaimsCapture(BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                # Runs INNER to MCP — by the time we see the request,
                # MCP middleware should already have set user_claims.
                observed["user_claims"] = getattr(request.state, "user_claims", None)
                return await call_next(request)

        app = FastAPI()

        @app.get("/mcp")
        async def mcp_root() -> dict:
            return {"ok": True}

        # Inner middleware first, then MCP outer (Starlette reverse-add).
        app.add_middleware(_ClaimsCapture)
        app.add_middleware(MCPBearerTokenMiddleware)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(
                "/mcp",
                headers={"Authorization": "Bearer correct-token"},
            )
            assert resp.status_code == 200
            claims = observed.get("user_claims")
            assert claims is not None, "user_claims sentinel was not set"
            assert claims.get("_mcp_bearer") is True
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_oidc_defers_when_user_claims_already_set(monkeypatch: pytest.MonkeyPatch) -> None:
    """OIDCAuthMiddleware must short-circuit if an outer middleware has
    already populated request.state.user_claims. This is the OIDC-side leg
    of the OR semantic — it lets MCP bearer auth bypass JWT verification."""
    from aerospike_cluster_manager_api.middleware.oidc_auth import OIDCAuthMiddleware

    class _Preauth(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.user_claims = {"sub": "outer-auth"}
            return await call_next(request)

    app = FastAPI()

    @app.get("/anything")
    async def anything() -> dict:
        return {"ok": True}

    # Inner: OIDC enabled with bogus issuer (would fail JWT verify if
    # exercised). Outer: pre-auth that sets user_claims.
    app.add_middleware(
        OIDCAuthMiddleware,
        enabled=True,
        issuer_url="http://127.0.0.1:1/realms/none",
        audience="acm",
    )
    app.add_middleware(_Preauth)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get(
            "/anything",
            headers={"Authorization": "Bearer not-a-real-jwt"},
        )
        # Pre-fix: OIDC would 401 on the malformed JWT.
        # Post-fix: OIDC sees user_claims and defers.
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}


async def test_bearer_mismatch_falls_through_to_oidc_when_oidc_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When ACM_MCP_TOKEN is set but doesn't match AND OIDC_ENABLED=true,
    MCP middleware must NOT 401 — it falls through so OIDC can try to
    verify the header as a JWT (preserving OIDC-OR-bearer)."""
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token", OIDC_ENABLED="true")
    try:
        from aerospike_cluster_manager_api.mcp.auth import MCPBearerTokenMiddleware

        # Stub "OIDC" that returns 200 unconditionally — represents OIDC
        # successfully verifying the JWT. This proves MCP middleware
        # forwarded instead of 401-ing.
        class _OIDCAcceptAll(BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                return await call_next(request)

        app = FastAPI()

        @app.get("/mcp")
        async def mcp_root() -> dict:
            return {"ok": True}

        app.add_middleware(_OIDCAcceptAll)
        app.add_middleware(MCPBearerTokenMiddleware)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(
                "/mcp",
                headers={"Authorization": "Bearer not-the-mcp-token-but-a-real-jwt"},
            )
            assert resp.status_code == 200, (
                "MCP middleware should fall through on bearer mismatch when OIDC is enabled, "
                "letting the inner OIDC middleware decide"
            )
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None, OIDC_ENABLED=None)


# ---------------------------------------------------------------------------
# Path-prefix gating
# ---------------------------------------------------------------------------


async def test_non_mcp_path_is_never_touched_when_token_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Even with ``ACM_MCP_TOKEN`` configured, paths outside ``/mcp/*``
    are not gated by this middleware."""
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        app = _build_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/health")
            assert resp.status_code == 200
            assert resp.json() == {"status": "ok"}
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


async def test_custom_mcp_path_is_honoured(monkeypatch: pytest.MonkeyPatch) -> None:
    """The middleware reads ``config.ACM_MCP_PATH`` at request time, so an
    operator override is respected."""
    _reload_config(
        monkeypatch,
        ACM_MCP_TOKEN="correct-token",
        ACM_MCP_PATH="/agents/mcp",
    )
    try:
        from aerospike_cluster_manager_api.mcp.auth import MCPBearerTokenMiddleware

        app = FastAPI()

        @app.get("/agents/mcp")
        async def custom_mcp() -> dict:
            return {"ok": True}

        @app.get("/api/health")
        async def health() -> dict:
            return {"status": "ok"}

        app.add_middleware(MCPBearerTokenMiddleware)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Custom path: gated.
            resp = await ac.get("/agents/mcp")
            assert resp.status_code == 401
            resp = await ac.get(
                "/agents/mcp",
                headers={"Authorization": "Bearer correct-token"},
            )
            assert resp.status_code == 200
            # Non-MCP path: untouched.
            resp = await ac.get("/api/health")
            assert resp.status_code == 200
            # Default ``/mcp`` is NOT a match because the override is in effect.
            resp = await ac.get("/mcp")
            assert resp.status_code == 404
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None, ACM_MCP_PATH=None)


# ---------------------------------------------------------------------------
# Token never appears in logs
# ---------------------------------------------------------------------------


async def test_token_never_logged(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A wrong-bearer 401 must not echo the supplied token in any log line."""
    _reload_config(monkeypatch, ACM_MCP_TOKEN="correct-token")
    try:
        # Capture WARNING+ from anywhere in our package.
        caplog.set_level("DEBUG", logger="aerospike_cluster_manager_api")
        app = _build_app()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            await ac.get(
                "/mcp",
                headers={"Authorization": "Bearer leaked-supplied-token"},
            )
        log_text = "\n".join(record.getMessage() for record in caplog.records)
        assert "leaked-supplied-token" not in log_text, f"supplied token leaked into logs: {log_text!r}"
        assert "correct-token" not in log_text, f"configured token leaked into logs: {log_text!r}"
    finally:
        _reload_config(monkeypatch, ACM_MCP_TOKEN=None)


# ---------------------------------------------------------------------------
# main.py wiring — middleware installed only when ACM_MCP_ENABLED=true
# ---------------------------------------------------------------------------


@pytest.fixture()
async def app_with_mcp_enabled_and_token(
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[object]:
    """Reload main with ACM_MCP_ENABLED=true and a known token."""
    monkeypatch.setenv("ACM_MCP_ENABLED", "true")
    monkeypatch.setenv("ACM_MCP_TOKEN", "wired-token")
    from aerospike_cluster_manager_api import config as _config
    from aerospike_cluster_manager_api import main as _main

    importlib.reload(_config)
    importlib.reload(_main)
    try:
        yield _main.app
    finally:
        monkeypatch.delenv("ACM_MCP_ENABLED", raising=False)
        monkeypatch.delenv("ACM_MCP_TOKEN", raising=False)
        importlib.reload(_config)
        importlib.reload(_main)


@pytest.fixture()
async def app_with_mcp_enabled_no_token(
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[object]:
    """Reload main with ACM_MCP_ENABLED=true and ACM_MCP_TOKEN unset.

    Sets ACM_MCP_ALLOW_ANONYMOUS=true so the startup refusal added in
    Phase 1 (``main.py``) does not abort import — this fixture targets
    the pass-through behaviour of the bearer middleware when no token
    is configured.
    """
    monkeypatch.setenv("ACM_MCP_ENABLED", "true")
    monkeypatch.setenv("ACM_MCP_ALLOW_ANONYMOUS", "true")
    monkeypatch.delenv("ACM_MCP_TOKEN", raising=False)
    from aerospike_cluster_manager_api import config as _config
    from aerospike_cluster_manager_api import main as _main

    importlib.reload(_config)
    importlib.reload(_main)
    try:
        yield _main.app
    finally:
        monkeypatch.delenv("ACM_MCP_ENABLED", raising=False)
        monkeypatch.delenv("ACM_MCP_ALLOW_ANONYMOUS", raising=False)
        importlib.reload(_config)
        importlib.reload(_main)


@pytest.fixture()
async def app_with_mcp_disabled_token_set(
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[object]:
    """ACM_MCP_ENABLED=false + token set: middleware must NOT be installed
    (the mount itself does not exist)."""
    monkeypatch.delenv("ACM_MCP_ENABLED", raising=False)
    monkeypatch.setenv("ACM_MCP_TOKEN", "should-not-matter")
    from aerospike_cluster_manager_api import config as _config
    from aerospike_cluster_manager_api import main as _main

    importlib.reload(_config)
    importlib.reload(_main)
    try:
        yield _main.app
    finally:
        monkeypatch.delenv("ACM_MCP_TOKEN", raising=False)
        importlib.reload(_config)
        importlib.reload(_main)


async def test_main_mcp_enabled_with_token_gates_mcp_path(
    app_with_mcp_enabled_and_token,
) -> None:
    """End-to-end: ACM_MCP_ENABLED=true + token → /mcp requires bearer.

    The "correct token" leg drives the canonical ``/mcp`` URL all the way
    into the FastMCP streamable-HTTP transport, which requires the app's
    lifespan to have started (the session manager's task group is
    bootstrapped there). Enter ``lifespan_context`` for the duration of
    the call so the success path actually reaches the transport rather
    than dying inside :class:`mcp.server.streamable_http_manager` with a
    ``Task group is not initialized`` ``RuntimeError``.
    """
    transport = ASGITransport(app=app_with_mcp_enabled_and_token)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # No auth → 401 from MCP middleware.
        resp = await ac.get("/mcp")
        assert resp.status_code == 401
        assert resp.json() == {"detail": "MCP authentication required"}
        # Wrong token → 401.
        resp = await ac.get("/mcp", headers={"Authorization": "Bearer nope"})
        assert resp.status_code == 401
        # Correct token → not 401 (the MCP transport itself may still
        # reject a bare GET with 4xx, but it must NOT be the auth 401).
        async with app_with_mcp_enabled_and_token.router.lifespan_context(app_with_mcp_enabled_and_token):
            resp = await ac.get(
                "/mcp",
                headers={"Authorization": "Bearer wired-token"},
            )
        assert resp.status_code != 401, f"correct token must reach MCP transport, got {resp.status_code} {resp.text!r}"


async def test_main_mcp_enabled_with_token_does_not_gate_api(
    app_with_mcp_enabled_and_token,
) -> None:
    """The middleware is installed on the whole app but only enforces on
    ``/mcp/*`` — the rest of the API surface is untouched."""
    transport = ASGITransport(app=app_with_mcp_enabled_and_token)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


async def test_main_mcp_enabled_no_token_passes_through(
    app_with_mcp_enabled_no_token,
) -> None:
    """ACM_MCP_ENABLED=true + ACM_MCP_TOKEN unset: the middleware is
    installed but enforces nothing — /mcp reaches the FastMCP transport
    without an auth 401 from us. The lifespan context wraps the call so
    the FastMCP session manager's task group is initialised before the
    transport is hit (the canonical ``/mcp`` URL no longer 307s, so the
    request lands in the streamable-HTTP code path that needs it)."""
    transport = ASGITransport(app=app_with_mcp_enabled_no_token)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as ac,
        app_with_mcp_enabled_no_token.router.lifespan_context(app_with_mcp_enabled_no_token),
    ):
        resp = await ac.get("/mcp")
        # Whatever the transport replies, it must NOT be our 401.
        assert resp.status_code != 401 or resp.json() != {"detail": "MCP authentication required"}


async def test_main_mcp_disabled_with_token_does_not_install_middleware(
    app_with_mcp_disabled_token_set,
) -> None:
    """When the MCP mount itself is off, the middleware must not be
    installed — the path is 404 and even setting a token has no effect."""
    transport = ASGITransport(app=app_with_mcp_disabled_token_set)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/mcp")
        # /mcp is unmounted → 404 from FastAPI's router, NOT 401 from us.
        assert resp.status_code == 404
        # /api routes still work.
        resp = await ac.get("/api/health")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Smoke: the middleware base class is the right type so ``add_middleware``
# wiring in main.py won't blow up.
# ---------------------------------------------------------------------------


def test_mcp_bearer_token_middleware_is_basehttpmiddleware() -> None:
    from aerospike_cluster_manager_api.mcp.auth import MCPBearerTokenMiddleware

    assert issubclass(MCPBearerTokenMiddleware, BaseHTTPMiddleware)


# Belt-and-braces: the dispatch signature should match Starlette's typing
# contract so pyright doesn't reject the subclass at type-check time.
def test_mcp_bearer_token_middleware_dispatch_signature() -> None:
    import inspect

    from aerospike_cluster_manager_api.mcp.auth import MCPBearerTokenMiddleware

    sig = inspect.signature(MCPBearerTokenMiddleware.dispatch)
    assert list(sig.parameters.keys())[:3] == ["self", "request", "call_next"]


# ---------------------------------------------------------------------------
# Startup refusal — anonymous MCP exposure must be opt-in
# ---------------------------------------------------------------------------


def test_main_refuses_to_start_when_mcp_enabled_without_auth(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """B2 — When ``ACM_MCP_ENABLED=true`` is paired with NO OIDC, NO
    ``ACM_MCP_TOKEN``, and NO ``ACM_MCP_ALLOW_ANONYMOUS=true``, importing
    ``main.py`` must raise ``RuntimeError``. That refusal is the default
    safety net against publishing the MCP surface to the network without
    auth.

    We exercise it via ``importlib.reload(main)`` because the check runs
    at module import time. The error message must mention the three
    knobs an operator can toggle to fix the misconfiguration so a deploy
    failure points to the right knob.
    """
    monkeypatch.setenv("ACM_MCP_ENABLED", "true")
    monkeypatch.delenv("ACM_MCP_TOKEN", raising=False)
    monkeypatch.delenv("ACM_MCP_ALLOW_ANONYMOUS", raising=False)
    monkeypatch.delenv("OIDC_ENABLED", raising=False)

    from aerospike_cluster_manager_api import config as _config
    from aerospike_cluster_manager_api import main as _main

    importlib.reload(_config)
    try:
        with pytest.raises(RuntimeError, match="anonymous MCP surface"):
            importlib.reload(_main)
    finally:
        # Reset env so other tests see a clean main.py.
        monkeypatch.delenv("ACM_MCP_ENABLED", raising=False)
        importlib.reload(_config)
        importlib.reload(_main)


def test_main_starts_when_mcp_enabled_with_allow_anonymous(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``ACM_MCP_ALLOW_ANONYMOUS=true`` is the documented escape hatch for
    localhost-only / trusted-network deployments."""
    monkeypatch.setenv("ACM_MCP_ENABLED", "true")
    monkeypatch.setenv("ACM_MCP_ALLOW_ANONYMOUS", "true")
    monkeypatch.delenv("ACM_MCP_TOKEN", raising=False)
    monkeypatch.delenv("OIDC_ENABLED", raising=False)

    from aerospike_cluster_manager_api import config as _config
    from aerospike_cluster_manager_api import main as _main

    importlib.reload(_config)
    try:
        importlib.reload(_main)  # must NOT raise
        # The app object exists and has the MCP route.
        assert hasattr(_main, "app")
    finally:
        monkeypatch.delenv("ACM_MCP_ENABLED", raising=False)
        monkeypatch.delenv("ACM_MCP_ALLOW_ANONYMOUS", raising=False)
        importlib.reload(_config)
        importlib.reload(_main)


def test_main_starts_when_mcp_enabled_with_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A configured ``ACM_MCP_TOKEN`` is sufficient — the bearer middleware
    will gate the surface."""
    monkeypatch.setenv("ACM_MCP_ENABLED", "true")
    monkeypatch.setenv("ACM_MCP_TOKEN", "any-secret")
    monkeypatch.delenv("ACM_MCP_ALLOW_ANONYMOUS", raising=False)
    monkeypatch.delenv("OIDC_ENABLED", raising=False)

    from aerospike_cluster_manager_api import config as _config
    from aerospike_cluster_manager_api import main as _main

    importlib.reload(_config)
    try:
        importlib.reload(_main)
        assert hasattr(_main, "app")
    finally:
        monkeypatch.delenv("ACM_MCP_ENABLED", raising=False)
        monkeypatch.delenv("ACM_MCP_TOKEN", raising=False)
        importlib.reload(_config)
        importlib.reload(_main)


# Static reference to silence "imported but unused" — the imports help
# readers understand that the middleware is exercised against real Starlette
# Request/Response shapes, even when the smoke tests above don't reference
# them directly.
_ = (Request, Response)
