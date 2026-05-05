"""Tests for the OIDC bearer-token middleware.

Each scenario builds a tiny FastAPI app wired up to ``OIDCAuthMiddleware``
and a mocked JWKS endpoint (httpx ``MockTransport``). The mock counts hits
so JWKS-cache assertions can compare against a deterministic baseline.
"""

from __future__ import annotations

import io
import logging
import time
import uuid
from collections.abc import Iterable

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
from httpx import ASGITransport, AsyncClient
from jose import jwt as jose_jwt
from jose.backends.cryptography_backend import CryptographyRSAKey
from jose.constants import ALGORITHMS

from aerospike_cluster_manager_api.middleware.oidc_auth import OIDCAuthMiddleware

ISSUER = "https://kc.example.com/realms/acko"
AUDIENCE = "acko-api"


# ---------------------------------------------------------------------------
# Crypto helpers — generate a real RSA key pair and serialise it as JWK so the
# middleware exercises the same code path Keycloak does in production.
# ---------------------------------------------------------------------------


def _rsa_keypair() -> tuple[rsa.RSAPrivateKey, dict]:
    """Return (private_key, jwk_public). ``kid`` is a stable random uuid."""
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pub_jwk = CryptographyRSAKey(priv.public_key(), ALGORITHMS.RS256).to_dict()
    pub_jwk["kid"] = uuid.uuid4().hex
    pub_jwk["alg"] = "RS256"
    pub_jwk["use"] = "sig"
    return priv, pub_jwk


def _sign(
    private_key: rsa.RSAPrivateKey,
    kid: str,
    *,
    audience: str = AUDIENCE,
    issuer: str = ISSUER,
    realm_roles: Iterable[str] | None = None,
    expires_in: int = 300,
    extra_claims: dict | None = None,
) -> str:
    now = int(time.time())
    claims: dict = {
        "iss": issuer,
        "aud": audience,
        "sub": "user-1",
        "iat": now,
        "exp": now + expires_in,
    }
    if realm_roles is not None:
        claims["realm_access"] = {"roles": list(realm_roles)}
    if extra_claims:
        claims.update(extra_claims)
    priv_jwk = CryptographyRSAKey(private_key, ALGORITHMS.RS256).to_dict()
    return jose_jwt.encode(claims, priv_jwk, algorithm="RS256", headers={"kid": kid})


# ---------------------------------------------------------------------------
# JWKS HTTP mock — tracks the number of fetches so we can assert caching.
# ---------------------------------------------------------------------------


class _JWKSMock:
    def __init__(self, jwks: list[dict]) -> None:
        self.jwks = list(jwks)
        self.well_known_calls = 0
        self.jwks_calls = 0

    def update(self, jwks: list[dict]) -> None:
        self.jwks = list(jwks)

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/.well-known/openid-configuration"):
            self.well_known_calls += 1
            return httpx.Response(
                200,
                json={
                    "issuer": ISSUER,
                    "jwks_uri": f"{ISSUER}/protocol/openid-connect/certs",
                },
            )
        if path.endswith("/protocol/openid-connect/certs"):
            self.jwks_calls += 1
            return httpx.Response(200, json={"keys": list(self.jwks)})
        return httpx.Response(404)


def _client_for(mock: _JWKSMock) -> httpx.AsyncClient:
    transport = httpx.MockTransport(mock.handler)
    return httpx.AsyncClient(transport=transport, timeout=5.0)


def _build_app(
    *,
    enabled: bool = True,
    required_roles: Iterable[str] = (),
    exclude_paths: Iterable[str] = ("/api/health",),
    jwks_cache_ttl_seconds: int = 600,
    http_client: httpx.AsyncClient | None = None,
) -> FastAPI:
    app = FastAPI()

    @app.get("/api/health")
    async def health() -> dict:
        return {"status": "ok"}

    @app.get("/api/me")
    async def me(request: Request) -> dict:
        return {"sub": getattr(request.state, "user_claims", {}).get("sub")}

    @app.get("/api/v1/events/stream")
    async def stream() -> PlainTextResponse:
        return PlainTextResponse("event:hello\n\n")

    app.add_middleware(
        OIDCAuthMiddleware,
        enabled=enabled,
        issuer_url=ISSUER,
        audience=AUDIENCE,
        required_roles=required_roles,
        exclude_paths=exclude_paths,
        jwks_cache_ttl_seconds=jwks_cache_ttl_seconds,
        http_client=http_client,
    )
    return app


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_valid_token_passes_and_injects_claims():
    priv, jwk = _rsa_keypair()
    mock = _JWKSMock([jwk])
    app = _build_app(http_client=_client_for(mock))
    token = _sign(priv, jwk["kid"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == {"sub": "user-1"}


@pytest.mark.asyncio
async def test_missing_token_yields_401():
    _priv, jwk = _rsa_keypair()
    mock = _JWKSMock([jwk])
    app = _build_app(http_client=_client_for(mock))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/me")
    assert resp.status_code == 401
    assert resp.headers.get("WWW-Authenticate", "").startswith("Bearer")
    assert "detail" in resp.json()


@pytest.mark.asyncio
async def test_expired_token_is_rejected():
    priv, jwk = _rsa_keypair()
    mock = _JWKSMock([jwk])
    app = _build_app(http_client=_client_for(mock))
    token = _sign(priv, jwk["kid"], expires_in=-30)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert "expired" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_wrong_audience_is_rejected():
    priv, jwk = _rsa_keypair()
    mock = _JWKSMock([jwk])
    app = _build_app(http_client=_client_for(mock))
    token = _sign(priv, jwk["kid"], audience="other-api")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_bad_signature_is_rejected():
    _priv_real, jwk = _rsa_keypair()
    priv_attacker, _ = _rsa_keypair()
    mock = _JWKSMock([jwk])  # JWKS only advertises the real key
    app = _build_app(http_client=_client_for(mock))
    # Sign with attacker key but claim the real key id — signature will fail
    token = _sign(priv_attacker, jwk["kid"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_excluded_path_skips_auth():
    mock = _JWKSMock([])
    app = _build_app(http_client=_client_for(mock))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/health")
    assert resp.status_code == 200
    # Excluded paths must not trigger any JWKS round-trip.
    assert mock.well_known_calls == 0
    assert mock.jwks_calls == 0


@pytest.mark.asyncio
async def test_sse_query_token_accepted():
    priv, jwk = _rsa_keypair()
    mock = _JWKSMock([jwk])
    app = _build_app(http_client=_client_for(mock))
    token = _sign(priv, jwk["kid"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/events/stream?access_token={token}")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_required_role_missing_yields_403():
    priv, jwk = _rsa_keypair()
    mock = _JWKSMock([jwk])
    app = _build_app(
        required_roles=["acko:dev"],
        http_client=_client_for(mock),
    )
    token = _sign(priv, jwk["kid"], realm_roles=["other-role"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_required_role_present_passes():
    priv, jwk = _rsa_keypair()
    mock = _JWKSMock([jwk])
    app = _build_app(
        required_roles=["acko:dev"],
        http_client=_client_for(mock),
    )
    token = _sign(priv, jwk["kid"], realm_roles=["acko:dev"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_jwks_fetched_once_within_ttl():
    priv, jwk = _rsa_keypair()
    mock = _JWKSMock([jwk])
    app = _build_app(http_client=_client_for(mock), jwks_cache_ttl_seconds=600)
    token = _sign(priv, jwk["kid"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        for _ in range(5):
            resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
            assert resp.status_code == 200
    assert mock.well_known_calls == 1
    assert mock.jwks_calls == 1


@pytest.mark.asyncio
async def test_jwks_refetched_after_ttl_expiry():
    priv, jwk = _rsa_keypair()
    mock = _JWKSMock([jwk])
    # 0-second TTL so every call is past the deadline; we still verify the
    # cache only refetches once per request rather than once per token op.
    app = _build_app(http_client=_client_for(mock), jwks_cache_ttl_seconds=0)
    token = _sign(priv, jwk["kid"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        for _ in range(3):
            resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
            assert resp.status_code == 200
    assert mock.jwks_calls == 3


@pytest.mark.asyncio
async def test_unknown_kid_triggers_immediate_refetch():
    priv_old, jwk_old = _rsa_keypair()
    priv_new, jwk_new = _rsa_keypair()
    mock = _JWKSMock([jwk_old])
    app = _build_app(http_client=_client_for(mock), jwks_cache_ttl_seconds=3600)
    token_old = _sign(priv_old, jwk_old["kid"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token_old}"})
        assert resp.status_code == 200
        baseline_jwks_calls = mock.jwks_calls
        # Realm rotates: only the new key is published. A token signed with
        # the rotated kid arrives — the middleware must refetch JWKS once
        # (kid miss) and then accept the new key.
        mock.update([jwk_new])
        token_new = _sign(priv_new, jwk_new["kid"])
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token_new}"})
        assert resp.status_code == 200
    assert mock.jwks_calls == baseline_jwks_calls + 1


@pytest.mark.asyncio
async def test_disabled_middleware_is_passthrough():
    mock = _JWKSMock([])
    app = _build_app(enabled=False, http_client=_client_for(mock))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/me")
    assert resp.status_code == 200
    assert mock.well_known_calls == 0
    assert mock.jwks_calls == 0


@pytest.mark.asyncio
async def test_options_preflight_passes_without_token():
    """CORS preflight must not be 401'd — CORSMiddleware downstream handles it."""
    mock = _JWKSMock([])
    app = _build_app(http_client=_client_for(mock))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.request(
            "OPTIONS",
            "/api/me",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
    # Without an inner CORSMiddleware in this minimal app the preflight returns
    # 405, but the critical assertion is that OIDC did NOT 401 the request.
    assert resp.status_code != 401


# ---------------------------------------------------------------------------
# Logging — query string masking in main.py's request_logging_middleware.
# ---------------------------------------------------------------------------


def test_request_logging_masks_access_token_query():
    from aerospike_cluster_manager_api.main import _mask_query_string

    assert _mask_query_string("access_token=eyJabc.def.ghi") == "access_token=***"
    assert (
        _mask_query_string("foo=bar&access_token=eyJabc.def.ghi&baz=1")
        == "foo=bar&access_token=***&baz=1"
    )
    # Case-insensitive
    assert _mask_query_string("Access_Token=secret") == "Access_Token=***"
    # Other JWT-shaped query keys also get masked
    assert _mask_query_string("id_token=abc&token=xyz") == "id_token=***&token=***"
    # No-op when no token is present
    assert _mask_query_string("foo=bar") == "foo=bar"
    assert _mask_query_string("") == ""


@pytest.mark.asyncio
async def test_main_request_logging_masks_query_token():
    """End-to-end: a request through ``main.app`` with a query token logs the masked form.

    We attach a temporary StringIO handler to the ``main`` logger because
    ``setup_logging`` (called at import time) sets ``propagate=False`` on the
    package root logger, which prevents pytest's ``caplog`` from observing the
    record.
    """
    from aerospike_cluster_manager_api.main import app as main_app

    transport = ASGITransport(app=main_app)
    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter("%(message)s"))
    target = logging.getLogger("aerospike_cluster_manager_api.main")
    target.addHandler(handler)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # /api/health is in the default exclude list for OIDC and works
            # regardless of OIDC_ENABLED, so the log line is emitted.
            await ac.get("/api/health?access_token=secret123")
    finally:
        target.removeHandler(handler)

    output = buf.getvalue()
    assert "access_token=***" in output, f"expected masked token in log, got: {output!r}"
    assert "secret123" not in output, f"raw token leaked in log: {output!r}"
