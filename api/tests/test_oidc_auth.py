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
import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
from httpx import ASGITransport, AsyncClient
from jwt.algorithms import RSAAlgorithm

from aerospike_cluster_manager_api.middleware.oidc_auth import OIDCAuthMiddleware

ISSUER = "https://kc.example.com/realms/acko"
AUDIENCE = "acko-api"


# ---------------------------------------------------------------------------
# Crypto helpers — generate a real RSA key pair and serialise it as JWK so the
# middleware exercises the same code path Keycloak does in production.
# ---------------------------------------------------------------------------


def _rsa_keypair() -> tuple[rsa.RSAPrivateKey, dict]:
    """Return (private_key, jwk_public). ``kid`` is a stable random uuid.

    PyJWT's ``RSAAlgorithm.to_jwk`` returns a JSON string by default; we ask
    for a dict and then graft on Keycloak-style ``kid``/``alg``/``use`` fields
    so the resulting JWK is byte-compatible with what the IdP would emit.
    """
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pub_jwk = RSAAlgorithm.to_jwk(priv.public_key(), as_dict=True)
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
    return pyjwt.encode(claims, private_key, algorithm="RS256", headers={"kid": kid})


# ---------------------------------------------------------------------------
# JWKS HTTP mock — tracks the number of fetches so we can assert caching.
# ---------------------------------------------------------------------------


class _JWKSMock:
    def __init__(self, jwks: list[dict]) -> None:
        self.jwks = list(jwks)
        self.well_known_calls = 0
        self.jwks_calls = 0
        # When set, the JWKS endpoint simulates an issuer outage: the
        # ``.well-known`` doc still serves (it is cached after the first
        # hit anyway) but the certs endpoint raises a connection error.
        self.outage = False

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
            if self.outage:
                raise httpx.ConnectError("JWKS endpoint unreachable")
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
async def test_disallowed_alg_is_rejected():
    """A JWK advertising a non-asymmetric/non-allowlisted alg must be rejected
    even if the JWKS cache somehow contains it (defense-in-depth against
    downgrade or rogue-IdP scenarios)."""
    priv, jwk = _rsa_keypair()
    jwk["alg"] = "HS256"  # symmetric — not in _ALLOWED_ALGS
    mock = _JWKSMock([jwk])
    app = _build_app(http_client=_client_for(mock), jwks_cache_ttl_seconds=600)
    token = _sign(priv, jwk["kid"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert "Unsupported signing algorithm" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_unknown_kid_back_off_prevents_amplification():
    """An attacker spamming tokens with random kids must not amplify into a
    flood of JWKS requests. After one refetch fails to resolve a bogus kid,
    subsequent unknown-kid requests within the back-off window must NOT
    trigger additional fetches."""
    priv, jwk = _rsa_keypair()
    mock = _JWKSMock([jwk])
    # Long TTL so the TTL-driven refetch path never fires during this test.
    app = _build_app(http_client=_client_for(mock), jwks_cache_ttl_seconds=3600)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Warm the cache via a valid token.
        valid = _sign(priv, jwk["kid"])
        await ac.get("/api/me", headers={"Authorization": f"Bearer {valid}"})
        baseline = mock.jwks_calls
        # First bogus kid: triggers ONE refetch (cache-miss path).
        bogus1 = _sign(priv, "kid-bogus-1")
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {bogus1}"})
        assert resp.status_code == 401
        assert mock.jwks_calls == baseline + 1
        # Multiple subsequent bogus kids within the back-off window must NOT
        # trigger more refetches.
        for i in range(2, 12):
            bogus = _sign(priv, f"kid-bogus-{i}")
            resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {bogus}"})
            assert resp.status_code == 401
        assert mock.jwks_calls == baseline + 1, (
            "JWKS was refetched more than once for unknown-kid storm (amplification protection failed)"
        )


@pytest.mark.asyncio
async def test_jwks_fetch_network_error_yields_401_not_500():
    """A transient JWKS-endpoint network outage must be rejected cleanly (401)
    rather than escaping as an unhandled HTTP 500 on every request."""
    priv, jwk = _rsa_keypair()
    token = _sign(priv, jwk["kid"])

    def _failing_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("JWKS endpoint unreachable")

    transport = httpx.MockTransport(_failing_handler)
    failing_client = httpx.AsyncClient(transport=transport, timeout=5.0)
    app = _build_app(http_client=failing_client)
    asgi = ASGITransport(app=app)
    async with AsyncClient(transport=asgi, base_url="http://test") as ac:
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code in (401, 503)
    assert resp.status_code != 500
    assert "detail" in resp.json()


@pytest.mark.asyncio
async def test_jwks_fetch_non_200_yields_401_not_500():
    """A non-200 response from the JWKS endpoint (e.g. 503 from the IdP) must
    be rejected cleanly rather than crashing the request with an HTTP 500."""
    priv, jwk = _rsa_keypair()
    token = _sign(priv, jwk["kid"])

    def _error_handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/.well-known/openid-configuration"):
            return httpx.Response(
                200,
                json={
                    "issuer": ISSUER,
                    "jwks_uri": f"{ISSUER}/protocol/openid-connect/certs",
                },
            )
        # JWKS endpoint itself is down.
        return httpx.Response(503, text="service unavailable")

    transport = httpx.MockTransport(_error_handler)
    failing_client = httpx.AsyncClient(transport=transport, timeout=5.0)
    app = _build_app(http_client=failing_client)
    asgi = ASGITransport(app=app)
    async with AsyncClient(transport=asgi, base_url="http://test") as ac:
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code in (401, 503)
    assert resp.status_code != 500
    assert "detail" in resp.json()


@pytest.mark.asyncio
async def test_jwks_outage_after_warm_cache_serves_stale_keys():
    """A JWKS-endpoint outage that strikes *after* the cache went stale must
    not 401 every authenticated request. Within the stale-grace window the
    middleware keeps verifying against the still-valid cached keys."""
    priv, jwk = _rsa_keypair()
    mock = _JWKSMock([jwk])
    # TTL=0 forces a TTL-driven refresh attempt on every request, which is
    # exactly the path that previously failed closed during an outage.
    app = _build_app(http_client=_client_for(mock), jwks_cache_ttl_seconds=0)
    token = _sign(priv, jwk["kid"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Warm the cache with a successful fetch.
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

        # Issuer goes down. The cached keys are still cryptographically valid.
        mock.outage = True
        for _ in range(5):
            resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
            assert resp.status_code == 200, "stale cached keys must still verify a valid token during an outage"
            assert resp.json() == {"sub": "user-1"}


@pytest.mark.asyncio
async def test_jwks_outage_with_cold_cache_still_fails_closed():
    """An outage with a cold cache (never warmed) has no keys to fall back on
    and must fail closed — the stale-cache path must not weaken a cold start."""
    priv, jwk = _rsa_keypair()
    mock = _JWKSMock([jwk])
    mock.outage = True  # down before the very first request
    app = _build_app(http_client=_client_for(mock), jwks_cache_ttl_seconds=0)
    token = _sign(priv, jwk["kid"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code in (401, 503)
    assert resp.status_code != 500
    assert "detail" in resp.json()


@pytest.mark.asyncio
async def test_jwks_outage_rate_limits_refetch_attempts():
    """While serving stale keys during an outage, the middleware must not
    re-hit the down issuer on every request — repeated failed fetches are
    rate-limited the same way the unknown-kid storm path is."""
    priv, jwk = _rsa_keypair()
    mock = _JWKSMock([jwk])
    app = _build_app(http_client=_client_for(mock), jwks_cache_ttl_seconds=0)
    token = _sign(priv, jwk["kid"])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
        mock.outage = True
        baseline = mock.jwks_calls
        for _ in range(10):
            resp = await ac.get("/api/me", headers={"Authorization": f"Bearer {token}"})
            assert resp.status_code == 200
        # At most one re-fetch attempt within the back-off window.
        assert mock.jwks_calls - baseline <= 1, (
            "JWKS endpoint was re-hit on every request during an outage (back-off failed)"
        )


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
    assert _mask_query_string("foo=bar&access_token=eyJabc.def.ghi&baz=1") == "foo=bar&access_token=***&baz=1"
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


# ---------------------------------------------------------------------------
# JWKS HTTP client lifecycle — aclose()
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_aclose_closes_self_constructed_client():
    """aclose() must close the lazily-created JWKS client and clear it."""
    mw = OIDCAuthMiddleware(
        app=lambda *a, **kw: None,  # type: ignore[arg-type]
        enabled=False,
        issuer_url=ISSUER,
        audience=AUDIENCE,
    )
    # Lazily build the client the way _refresh_jwks does in production.
    client = mw._get_http_client()
    assert client is mw._http_client
    assert mw._owns_http_client is True
    assert client.is_closed is False

    await mw.aclose()
    assert client.is_closed is True
    # Reference cleared so a second aclose() is a no-op.
    assert mw._http_client is None
    await mw.aclose()


@pytest.mark.asyncio
async def test_aclose_leaves_injected_client_untouched():
    """An injected client is owned by the caller — aclose() must not close it."""
    _priv, jwk = _rsa_keypair()
    injected = _client_for(_JWKSMock([jwk]))
    mw = OIDCAuthMiddleware(
        app=lambda *a, **kw: None,  # type: ignore[arg-type]
        enabled=False,
        issuer_url=ISSUER,
        audience=AUDIENCE,
        http_client=injected,
    )
    assert mw._owns_http_client is False

    await mw.aclose()
    # The injected client's lifecycle belongs to the test, not the middleware.
    assert injected.is_closed is False
    await injected.aclose()


@pytest.mark.asyncio
async def test_aclose_noop_when_client_never_built():
    """aclose() is safe when no JWKS fetch ever happened (cold middleware)."""
    mw = OIDCAuthMiddleware(
        app=lambda *a, **kw: None,  # type: ignore[arg-type]
        enabled=False,
        issuer_url=ISSUER,
        audience=AUDIENCE,
    )
    assert mw._http_client is None
    await mw.aclose()  # must not raise
    assert mw._http_client is None
