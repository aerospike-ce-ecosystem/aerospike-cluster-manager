"""Keycloak-style OIDC bearer token middleware.

Verifies inbound ``Authorization: Bearer <jwt>`` tokens locally (signature,
``exp``, ``iss``, ``aud``) using the issuer's public JWKS. The JWKS is fetched
once per ``OIDC_JWKS_CACHE_TTL_SECONDS`` window, with a single :class:`asyncio.Lock`
to prevent stampedes when many requests miss the cache simultaneously.

Cache invalidation triggers (in order of strictness):

* TTL expiry — refetched on the next request after ``expires_at``.
* Unknown ``kid`` — when a token references a key id we have never seen, the
  JWKS is refetched **once** before declaring the token invalid; this covers
  Keycloak realm key rotation without requiring a process restart.

Outage resilience: if a TTL-driven refetch fails because the issuer's JWKS
endpoint is transiently unreachable, the middleware keeps verifying tokens
against the *stale* cached keys for up to ``_STALE_JWKS_GRACE_SECONDS`` rather
than 401-ing every authenticated request. A cold cache (never warmed) still
fails closed. Signing keys rotate on the order of days, so a brief Keycloak
restart no longer takes the whole API down.

The middleware is installed unconditionally in ``main.py``; when
``OIDC_ENABLED=false`` (default) it returns immediately without inspecting the
request, so non-prod deployments need no Keycloak.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable, Iterable
from typing import Any, cast

import httpx
import jwt
from jwt.algorithms import ECAlgorithm, RSAAlgorithm
from jwt.exceptions import (
    DecodeError,
    ExpiredSignatureError,
    InvalidAudienceError,
    InvalidIssuerError,
    InvalidTokenError,
    PyJWTError,
)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from aerospike_cluster_manager_api.events.tickets import ticket_store

logger = logging.getLogger(__name__)

# SSE EventSource cannot send custom headers (HTML5 spec). Instead of
# accepting the raw JWT via query string (removed — issue #345: it leaked
# into ingress access logs, browser history, and Referer headers), these
# stream endpoints accept a single-use, short-TTL opaque ticket minted by
# ``POST /api[/v1]/events/ticket`` (which itself requires normal
# Authorization-header auth). Both the legacy /api/... and versioned
# /api/v1/... aliases are listed.
SSE_TICKET_PATHS: frozenset[str] = frozenset(
    {
        "/api/events/stream",
        "/api/v1/events/stream",
    }
)

# Asymmetric algorithms only — never trust the JWK's ``alg`` field blindly.
# Symmetric algs (HS256/384/512) and ``none`` would let a malicious or
# misconfigured JWKS open a verification path with attacker-known secrets.
# Keycloak issues RS256 by default; ES* are allowed for installations that
# rotate to elliptic-curve signing keys.
_ALLOWED_ALGS: frozenset[str] = frozenset(
    {"RS256", "RS384", "RS512", "ES256", "ES384", "ES512"},
)

# Back-off window for ``kid``-miss-driven JWKS refetches. After a refresh that
# still does not contain the requested ``kid`` (i.e. the token was forged or
# references a key the IdP no longer publishes), additional unknown-kid
# requests within this window do NOT trigger another fetch — they fail fast.
# Prevents an attacker from amplifying a flood of bogus tokens into a flood
# of HTTP requests against the issuer.
_KID_MISS_BACKOFF_SECONDS: int = 30

# Grace window for serving *stale* JWKS keys after a failed TTL refresh.
#
# When the cached JWKS has passed its TTL but the issuer's JWKS endpoint is
# transiently unreachable (Keycloak restart, network blip), rejecting every
# request with 401 would take the whole API down for all authenticated users
# even though the cached keys are almost certainly still valid — IdP signing
# keys rotate on the order of days/weeks, not minutes. Within this grace
# window we keep verifying against the stale cache and only re-attempt the
# fetch (rate-limited) on subsequent requests. Past the grace window the
# cache is considered untrustworthy and requests fail closed again.
_STALE_JWKS_GRACE_SECONDS: int = 3600

# Back-off between failed TTL-driven refresh attempts while serving stale
# keys. Without this, every request during an outage would re-hit the down
# issuer; mirrors the amplification protection on the unknown-kid path.
_STALE_REFRESH_BACKOFF_SECONDS: int = 30


def _public_key_from_jwk(jwk_dict: dict[str, Any]) -> Any:
    """Convert a JWK dict to a PyJWT-compatible public-key object.

    PyJWT's ``jwt.decode`` accepts ``cryptography``-native key objects
    directly. We pick the algorithm class by JWK ``kty`` (key type) and
    delegate to ``RSAAlgorithm.from_jwk`` / ``ECAlgorithm.from_jwk`` so
    PyJWT does the actual parsing and validation. This deliberately
    mirrors what the symmetric ``HMACAlgorithm.from_jwk`` would do — by
    omitting the symmetric branch we silently refuse ``kty=oct`` keys
    here, complementing the alg-whitelist defence-in-depth above.
    """
    import json as _json

    kty = jwk_dict.get("kty")
    raw = _json.dumps(jwk_dict)
    if kty == "RSA":
        return RSAAlgorithm.from_jwk(raw)
    if kty == "EC":
        return ECAlgorithm.from_jwk(raw)
    raise _AuthError(f"Unsupported JWK key type: {kty!r}")


class OIDCAuthMiddleware(BaseHTTPMiddleware):
    """Native (no introspection) JWT verification with cached JWKS."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        enabled: bool,
        issuer_url: str,
        audience: str,
        required_roles: Iterable[str] = (),
        exclude_paths: Iterable[str] = (),
        jwks_cache_ttl_seconds: int = 600,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        super().__init__(app)
        self.enabled = enabled
        self.issuer_url = issuer_url.rstrip("/") if issuer_url else ""
        self.audience = audience
        self.required_roles: frozenset[str] = frozenset(required_roles)
        self.exclude_paths: frozenset[str] = frozenset(exclude_paths)
        self.jwks_cache_ttl_seconds = jwks_cache_ttl_seconds

        # Tests can inject a transport-mocked client; production constructs
        # one lazily on first JWKS fetch (avoids opening a connection pool
        # at import time when OIDC is disabled).
        self._http_client: httpx.AsyncClient | None = http_client
        self._owns_http_client = http_client is None

        # JWKS cache state. ``_jwks_by_kid`` maps the JWS header ``kid`` to
        # the raw JWK dict; we lazily convert to a public-key object on
        # first verification. ``_expires_at`` is a monotonic-ish wall-clock
        # seconds value; we use ``time.time()`` so a process restart resets
        # the cache implicitly.
        self._jwks_by_kid: dict[str, dict[str, Any]] = {}
        self._jwks_expires_at: float = 0.0
        self._jwks_lock = asyncio.Lock()
        # Last wall-clock time we refetched JWKS specifically because of an
        # unknown ``kid``. Used to enforce ``_KID_MISS_BACKOFF_SECONDS`` so
        # an attacker spamming bogus kids cannot turn each request into a
        # round-trip to the issuer.
        self._last_kid_miss_refresh_at: float = 0.0
        # Last wall-clock time a TTL-driven refresh *failed*. Used to rate-
        # limit re-attempts while serving stale keys during an issuer
        # outage (see ``_STALE_REFRESH_BACKOFF_SECONDS``).
        self._last_failed_refresh_at: float = 0.0
        # Cached well-known doc — only the ``jwks_uri`` value is used today,
        # but caching it avoids two HTTP round-trips on every refetch.
        self._jwks_uri: str | None = None

        if enabled and not self.issuer_url:
            raise ValueError("OIDC_ENABLED=true but OIDC_ISSUER_URL is empty")

    # ------------------------------------------------------------------
    # Starlette dispatch
    # ------------------------------------------------------------------
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if not self.enabled:
            return await call_next(request)

        # If an outer middleware has already authenticated this request,
        # defer to it. Kept as a defensive hook so future auth layers can
        # short-circuit OIDC by populating ``request.state.user_claims``.
        if getattr(request.state, "user_claims", None) is not None:
            return await call_next(request)

        path = request.url.path
        if path in self.exclude_paths:
            return await call_next(request)
        # CORS preflight requests carry no Authorization header — passing them
        # through lets CORSMiddleware respond with the negotiated headers.
        if request.method == "OPTIONS":
            return await call_next(request)

        token = self._extract_token(request)
        if token is None and path in SSE_TICKET_PATHS:
            return await self._dispatch_sse_ticket(request, call_next)
        if token is None:
            return _unauthorized("Missing bearer token")

        try:
            claims = await self._verify(token)
        except _AuthError as exc:
            return _unauthorized(exc.detail)

        role_failure = self._role_failure(claims)
        if role_failure is not None:
            return role_failure

        request.state.user_claims = claims
        return await call_next(request)

    async def _dispatch_sse_ticket(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """Authenticate an SSE stream request via a single-use ticket.

        Reached only when the request carries no Authorization header (a
        valid header always takes precedence, so curl-style clients keep
        working). The historical ``?access_token=<jwt>`` escape hatch is
        rejected outright with a pointer at the replacement flow — issue
        #345 removed it because the JWT persisted in ingress access logs.
        """
        if "access_token" in request.query_params:
            return _unauthorized(
                "The access_token query parameter is no longer accepted: "
                "mint a single-use ticket via POST /api/v1/events/ticket "
                "(Authorization header) and connect with ?ticket=<value>.",
            )

        ticket = request.query_params.get("ticket")
        if not ticket:
            return _unauthorized("Missing bearer token")

        claims = ticket_store.redeem(ticket)
        if claims is None:
            return _unauthorized("Invalid, expired, or already-used SSE ticket")

        role_failure = self._role_failure(claims)
        if role_failure is not None:
            return role_failure

        request.state.user_claims = claims
        return await call_next(request)

    def _role_failure(self, claims: dict[str, Any]) -> Response | None:
        """Return a 403 response when ``claims`` lack the required roles."""
        if not self.required_roles:
            return None
        roles = _extract_realm_roles(claims)
        if self.required_roles & roles:
            return None
        return _forbidden(
            f"Token lacks required role(s): {sorted(self.required_roles)}",
        )

    # ------------------------------------------------------------------
    # JWT verification
    # ------------------------------------------------------------------
    @staticmethod
    def _extract_token(request: Request) -> str | None:
        """Extract the bearer JWT from the Authorization header.

        Header-only by design: the ``?access_token=`` query fallback was
        removed (issue #345) — SSE clients authenticate via single-use
        tickets instead (see ``_dispatch_sse_ticket``).
        """
        header = request.headers.get("authorization") or request.headers.get("Authorization")
        if header:
            parts = header.split(None, 1)
            if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
                return parts[1].strip()
        return None

    async def _verify(self, token: str) -> dict[str, Any]:
        try:
            unverified_header = jwt.get_unverified_header(token)
        except PyJWTError as exc:
            raise _AuthError(f"Malformed token header: {exc}") from exc

        kid = unverified_header.get("kid")
        if not kid:
            raise _AuthError("Token header missing 'kid'")

        jwk_dict = await self._key_for_kid(kid)
        if jwk_dict is None:
            raise _AuthError(f"Unknown signing key id (kid={kid!r})")

        algorithm = jwk_dict.get("alg") or unverified_header.get("alg")
        if not algorithm:
            raise _AuthError("Cannot determine signing algorithm")
        if algorithm not in _ALLOWED_ALGS:
            # Defense-in-depth: even though Keycloak issues RS256, refusing
            # everything else here closes off a class of downgrade attacks
            # via a tampered or rogue JWKS endpoint.
            raise _AuthError(f"Unsupported signing algorithm: {algorithm}")

        public_key = _public_key_from_jwk(jwk_dict)

        try:
            claims = jwt.decode(
                token,
                public_key,
                algorithms=[algorithm],
                audience=self.audience,
                issuer=self.issuer_url,
            )
        except ExpiredSignatureError as exc:
            raise _AuthError("Token expired") from exc
        except InvalidAudienceError as exc:
            raise _AuthError(f"Invalid audience: {exc}") from exc
        except InvalidIssuerError as exc:
            raise _AuthError(f"Invalid issuer: {exc}") from exc
        except DecodeError as exc:
            # Signature/format failures land here — keep the message generic
            # so we don't leak which leg of verification failed.
            raise _AuthError(f"Invalid token: {exc}") from exc
        except InvalidTokenError as exc:
            # Catch-all for any other PyJWT-defined claim error
            # (e.g. iat/nbf failures); InvalidTokenError is the umbrella.
            raise _AuthError(f"Invalid token: {exc}") from exc
        return cast(dict[str, Any], claims)

    # ------------------------------------------------------------------
    # JWKS cache
    # ------------------------------------------------------------------
    async def _key_for_kid(self, kid: str) -> dict[str, Any] | None:
        now = time.time()
        if kid in self._jwks_by_kid and now < self._jwks_expires_at:
            return self._jwks_by_kid[kid]

        async with self._jwks_lock:
            # Re-check after acquiring the lock — another task may have
            # already refreshed the cache while we were waiting.
            now = time.time()
            ttl_expired = now >= self._jwks_expires_at
            kid_missing = kid not in self._jwks_by_kid

            if ttl_expired:
                # Standard TTL refresh path. A transient issuer outage must
                # not take the whole API down: if we already hold cached
                # keys, fall back to them (within the stale-grace window)
                # rather than 401-ing every authenticated request. Signing
                # keys rotate on the order of days, so a stale cache is
                # overwhelmingly still correct during a brief outage.
                #
                # While serving stale keys we also rate-limit the re-fetch
                # attempts: without the back-off every request during an
                # outage would re-hit the down issuer.
                in_refresh_backoff = (
                    self._can_serve_stale(now) and now - self._last_failed_refresh_at < _STALE_REFRESH_BACKOFF_SECONDS
                )
                if not in_refresh_backoff:
                    try:
                        await self._refresh_jwks()
                    except _AuthError:
                        if self._can_serve_stale(now):
                            self._last_failed_refresh_at = now
                            logger.warning(
                                "OIDC JWKS refresh failed; serving stale cached keys "
                                "(%d key(s), within %ds grace window)",
                                len(self._jwks_by_kid),
                                _STALE_JWKS_GRACE_SECONDS,
                            )
                        else:
                            # Cold cache, or grace window exhausted — fail closed.
                            raise
            elif kid_missing and (now - self._last_kid_miss_refresh_at >= _KID_MISS_BACKOFF_SECONDS):
                # Unknown-kid refresh, but rate-limited via back-off window so
                # a flood of bogus kids cannot amplify into JWKS requests.
                # Outside the back-off window we fall through and let the
                # caller see ``None`` (token rejected as unknown kid).
                self._last_kid_miss_refresh_at = now
                await self._refresh_jwks()
            return self._jwks_by_kid.get(kid)

    def _can_serve_stale(self, now: float) -> bool:
        """Return True if stale cached keys may still back a verification.

        Requires (a) a non-empty cache (a cold start has nothing to fall
        back on and must fail closed) and (b) the cache having gone stale
        no longer than ``_STALE_JWKS_GRACE_SECONDS`` ago. Beyond the grace
        window the keys are treated as untrustworthy.
        """
        if not self._jwks_by_kid:
            return False
        return now - self._jwks_expires_at <= _STALE_JWKS_GRACE_SECONDS

    async def _refresh_jwks(self) -> None:
        client = self._get_http_client()
        # A transient JWKS-endpoint outage raises httpx.HTTPError
        # (httpx.RequestError for network failures, httpx.HTTPStatusError for
        # non-2xx). These are NOT _AuthError, so without translation they would
        # escape _verify -> dispatch (which only catches _AuthError) and crash
        # every authenticated request with an unhandled HTTP 500. Translate
        # them into _AuthError so dispatch rejects the request cleanly (401).
        try:
            if self._jwks_uri is None:
                well_known = f"{self.issuer_url}/.well-known/openid-configuration"
                resp = await client.get(well_known)
                resp.raise_for_status()
                doc = resp.json()
                uri = doc.get("jwks_uri")
                if not isinstance(uri, str) or not uri:
                    raise _AuthError("OIDC discovery document is missing jwks_uri")
                self._jwks_uri = uri

            resp = await client.get(self._jwks_uri)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise _AuthError(f"OIDC JWKS fetch failed: {exc}") from exc
        payload = resp.json()
        keys = payload.get("keys") if isinstance(payload, dict) else None
        if not isinstance(keys, list):
            raise _AuthError("JWKS response missing 'keys' array")

        new_index: dict[str, dict[str, Any]] = {}
        for k in keys:
            if isinstance(k, dict) and isinstance(k.get("kid"), str):
                new_index[k["kid"]] = k
        self._jwks_by_kid = new_index
        self._jwks_expires_at = time.time() + self.jwks_cache_ttl_seconds
        logger.info(
            "OIDC JWKS refreshed: %d key(s), ttl=%ss",
            len(new_index),
            self.jwks_cache_ttl_seconds,
        )

    def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=httpx.Timeout(10.0))
        return self._http_client

    async def aclose(self) -> None:
        """Close the lazily-created JWKS HTTP client on app shutdown.

        Only closes a client this middleware constructed itself
        (``_owns_http_client``). A client injected by a test (or any
        future caller) is left untouched — its lifecycle belongs to
        whoever passed it in. Safe to call multiple times: the client
        reference is cleared so a second call is a no-op.
        """
        if self._owns_http_client and self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


class _AuthError(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


def _extract_realm_roles(claims: dict[str, Any]) -> frozenset[str]:
    realm_access = claims.get("realm_access")
    if isinstance(realm_access, dict):
        roles = realm_access.get("roles")
        if isinstance(roles, list):
            return frozenset(str(r) for r in roles if isinstance(r, str))
    return frozenset()


def _unauthorized(detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={"detail": detail},
        headers={"WWW-Authenticate": 'Bearer realm="acko-api"'},
    )


def _forbidden(detail: str) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": detail})
