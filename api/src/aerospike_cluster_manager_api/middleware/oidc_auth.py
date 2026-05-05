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
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)

# SSE EventSource cannot send custom headers (HTML5 spec), so we accept the
# token via ``?access_token=`` on the documented stream endpoints. Both the
# legacy /api/... and versioned /api/v1/... aliases are listed.
SSE_QUERY_TOKEN_PATHS: frozenset[str] = frozenset(
    {
        "/api/events/stream",
        "/api/v1/events/stream",
    }
)


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
        # the raw JWK dict; jose accepts dicts directly. ``_expires_at`` is a
        # monotonic-ish wall-clock seconds value; we use ``time.time()`` so a
        # process restart resets the cache implicitly.
        self._jwks_by_kid: dict[str, dict[str, Any]] = {}
        self._jwks_expires_at: float = 0.0
        self._jwks_lock = asyncio.Lock()
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

        path = request.url.path
        if path in self.exclude_paths:
            return await call_next(request)
        # CORS preflight requests carry no Authorization header — passing them
        # through lets CORSMiddleware respond with the negotiated headers.
        if request.method == "OPTIONS":
            return await call_next(request)

        token = self._extract_token(request, path)
        if token is None:
            return _unauthorized("Missing bearer token")

        try:
            claims = await self._verify(token)
        except _AuthError as exc:
            return _unauthorized(exc.detail)

        if self.required_roles:
            roles = _extract_realm_roles(claims)
            if not (self.required_roles & roles):
                return _forbidden(
                    f"Token lacks required role(s): {sorted(self.required_roles)}",
                )

        request.state.user_claims = claims
        return await call_next(request)

    # ------------------------------------------------------------------
    # JWT verification
    # ------------------------------------------------------------------
    @staticmethod
    def _extract_token(request: Request, path: str) -> str | None:
        header = request.headers.get("authorization") or request.headers.get("Authorization")
        if header:
            parts = header.split(None, 1)
            if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
                return parts[1].strip()
        if path in SSE_QUERY_TOKEN_PATHS:
            qs_token = request.query_params.get("access_token")
            if qs_token:
                return qs_token
        return None

    async def _verify(self, token: str) -> dict[str, Any]:
        try:
            unverified_header = jwt.get_unverified_header(token)
        except JWTError as exc:
            raise _AuthError(f"Malformed token header: {exc}") from exc

        kid = unverified_header.get("kid")
        if not kid:
            raise _AuthError("Token header missing 'kid'")

        key = await self._key_for_kid(kid)
        if key is None:
            raise _AuthError(f"Unknown signing key id (kid={kid!r})")

        algorithm = key.get("alg") or unverified_header.get("alg")
        if not algorithm:
            raise _AuthError("Cannot determine signing algorithm")

        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=[algorithm],
                audience=self.audience,
                issuer=self.issuer_url,
            )
        except ExpiredSignatureError as exc:
            raise _AuthError("Token expired") from exc
        except JWTClaimsError as exc:
            raise _AuthError(f"Invalid claims: {exc}") from exc
        except JWTError as exc:
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
            need_refresh = now >= self._jwks_expires_at or kid not in self._jwks_by_kid
            if need_refresh:
                await self._refresh_jwks()
            return self._jwks_by_kid.get(kid)

    async def _refresh_jwks(self) -> None:
        client = self._get_http_client()
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
