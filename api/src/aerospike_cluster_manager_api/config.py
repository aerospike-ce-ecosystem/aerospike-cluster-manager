from __future__ import annotations

import json
import os
import re

from aerospike_cluster_manager_api.mcp.access_profile import AccessProfile, parse_profile


def _get_int(name: str, default: int) -> int:
    """Parse an integer environment variable with validation."""
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        raise ValueError(f"Environment variable {name} must be an integer, got: {raw!r}") from None


def _get_bool(name: str, default: bool) -> bool:
    """Parse a boolean environment variable.

    Accepts ``1``/``true``/``yes``/``on`` (case-insensitive, surrounding
    whitespace ignored) as truthy. Anything else is falsy. Unset returns
    the supplied default.
    """
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


_DURATION_RE = re.compile(r"^(?P<value>\d+)(?P<unit>[smhd]?)$")


def _parse_duration_seconds(raw: str, default_seconds: int) -> int:
    """Accept ``"600"``, ``"10m"``, ``"1h"``, ``"2d"`` and return seconds.

    Bare integers are treated as seconds. Empty/None falls back to ``default_seconds``.
    """
    if raw is None or raw == "":
        return default_seconds
    candidate = raw.strip().lower()
    m = _DURATION_RE.match(candidate)
    if not m:
        raise ValueError(f"Invalid duration {raw!r}; expected forms like '600', '10m', '1h', '2d'")
    value = int(m.group("value"))
    unit = m.group("unit") or "s"
    multiplier = {"s": 1, "m": 60, "h": 3600, "d": 86400}[unit]
    return value * multiplier


def _parse_str_list(raw: str | None) -> list[str]:
    """Parse a CSV or JSON array string into a list of stripped, non-empty entries."""
    if raw is None or raw.strip() == "":
        return []
    raw = raw.strip()
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON list: {raw!r}") from e
        if not isinstance(parsed, list):
            raise ValueError(f"Expected JSON list, got {type(parsed).__name__}: {raw!r}")
        return [str(x).strip() for x in parsed if str(x).strip()]
    return [item.strip() for item in raw.split(",") if item.strip()]


CORS_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3100").split(",") if o.strip()
]

HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = _get_int("PORT", 8000)

ENABLE_POSTGRES: bool = os.getenv("ENABLE_POSTGRES", "false").lower() in ("true", "1", "yes")
SQLITE_PATH: str = os.getenv("SQLITE_PATH", "./data/connections.db")
# Required when ENABLE_POSTGRES=true; set via DATABASE_URL env var
DATABASE_URL: str = os.getenv("DATABASE_URL", "")

LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
LOG_FORMAT: str = os.getenv("LOG_FORMAT", "text")  # "text" or "json"

K8S_MANAGEMENT_ENABLED: bool = os.getenv("K8S_MANAGEMENT_ENABLED", "false").lower() in ("true", "1", "yes")

# Security headers
ENABLE_HSTS: bool = os.getenv("ENABLE_HSTS", "false").lower() in ("true", "1", "yes")
CSP_REPORT_URI: str = os.getenv("CSP_REPORT_URI", "")
# When disabled, the in-app Content-Security-Policy header is not emitted and
# /api/docs falls back to FastAPI's default helper (CDN swagger-ui 5.x with
# inline bootstrap). Operators with an upstream layer enforcing CSP, or those
# whose browsers have unrestricted internet egress, can turn this off to lift
# the swagger-init.js indirection and render OpenAPI 3.1 specs directly (#241).
CSP_ENABLED: bool = os.getenv("CSP_ENABLED", "true").lower() in ("true", "1", "yes")

# Trusted reverse-proxy addresses for X-Forwarded-For support
TRUSTED_PROXIES: list[str] = [p.strip() for p in os.getenv("TRUSTED_PROXIES", "").split(",") if p.strip()]

# Database connection pool
DB_POOL_MIN_SIZE: int = _get_int("DB_POOL_MIN_SIZE", 2)
DB_POOL_MAX_SIZE: int = _get_int("DB_POOL_MAX_SIZE", 10)
DB_COMMAND_TIMEOUT: int = _get_int("DB_COMMAND_TIMEOUT", 30)  # SQL command execution timeout in seconds

# Aerospike client
AS_TEND_INTERVAL: int = _get_int("AS_TEND_INTERVAL", 1000)  # Cluster tend interval in milliseconds

# Kubernetes API
K8S_API_TIMEOUT: int = _get_int("K8S_API_TIMEOUT", 10)
K8S_VERIFY_SSL: bool = os.getenv("K8S_VERIFY_SSL", "true").lower() in ("true", "1", "yes")
# Optional path to a custom CA bundle for verifying the K8s API-server certificate.
# When set (and K8S_VERIFY_SSL is true), overrides the default in-cluster CA bundle.
# Required on clusters whose API-server cert is signed by a CA that lacks the
# Authority Key Identifier extension — CPython 3.13+ rejects such chains by default.
K8S_CA_FILE: str = os.getenv("K8S_CA_FILE", "")
K8S_LOG_TIMEOUT: int = _get_int("K8S_LOG_TIMEOUT", 30)

# SSE (Server-Sent Events) streaming
SSE_ENABLED: bool = os.getenv("SSE_ENABLED", "true").lower() in ("true", "1", "yes")
SSE_HEARTBEAT_INTERVAL: int = _get_int("SSE_HEARTBEAT_INTERVAL", 15)  # seconds between heartbeat pings
SSE_MAX_CONNECTIONS: int = _get_int("SSE_MAX_CONNECTIONS", 50)  # max concurrent SSE subscribers

# CM_SSE_BROADCAST_PER_CONNECTION gates the per-connection broadcast loops in
# ``events.collector`` (cluster.metrics, connection.health, k8s.cluster.*).
# Default ``false`` because the broker has no per-subscriber owner filter --
# emitting tenant-A connection metrics to tenant-B subscribers leaks data.
# Operators of single-tenant deployments can opt back in by setting this to
# true. Tracked as follow-up to ADR-0040 (per-subscriber filtering).
CM_SSE_BROADCAST_PER_CONNECTION: bool = os.getenv("CM_SSE_BROADCAST_PER_CONNECTION", "false").lower() in (
    "true",
    "1",
    "yes",
)

# ---------------------------------------------------------------------------
# OpenTelemetry — exporter/sampler/resource configuration goes through OTel
# SDK standard env vars (OTEL_EXPORTER_OTLP_*, OTEL_TRACES_SAMPLER, ...). The
# only knob this module surfaces is the on/off toggle (OTEL_SDK_DISABLED is
# the SDK's own switch — we just read it here for visibility).
# ---------------------------------------------------------------------------
OTEL_ENABLED: bool = os.getenv("OTEL_SDK_DISABLED", "true").lower() not in ("true", "1", "yes")

# ---------------------------------------------------------------------------
# Pluggable log handlers
# ---------------------------------------------------------------------------
# Comma-separated list of "module:Class" specs (or entry-point names registered
# under the "aerospike_cluster_manager.log_handlers" group). Each handler is
# instantiated with no arguments and is expected to self-configure from its own
# environment variables (e.g. pynelo's NELO_HOST / NELO_PROJECT_TOKEN). Failure
# to load a single handler is logged and skipped — it does not abort startup or
# remove other handlers.
LOG_HANDLERS: str = os.getenv("LOG_HANDLERS", "")

# When set, the file at this path is loaded as a YAML/JSON dictConfig and given
# full control over logging configuration. LOG_LEVEL / LOG_FORMAT / LOG_HANDLERS
# are ignored in this mode — the dictConfig is authoritative.
LOGGING_CONFIG_FILE: str = os.getenv("LOGGING_CONFIG_FILE", "")

# ---------------------------------------------------------------------------
# At-rest encryption for stored connection passwords
# ---------------------------------------------------------------------------
# Fernet key used by ``secrets_crypto.encrypt_password`` to wrap the
# ``connections.password`` column before it touches the database. The
# canonical shape is a 44-char urlsafe base64 string emitted by
# ``Fernet.generate_key()``. The actual validation, ephemeral-mode
# fallback, and process-startup error live in ``secrets_crypto.py`` —
# we surface the variable name here only so operators have a single
# place to grep for "where does ACM read this from?". Reading the env
# at import time would be wrong: the secrets module needs to defer
# until the first encrypt/decrypt call so unrelated tests can import
# the package without setting the KEK.
ACM_PASSWORD_KEK_ENV: str = "ACM_PASSWORD_KEK"
ACM_ALLOW_EPHEMERAL_KEK_ENV: str = "ACM_ALLOW_EPHEMERAL_KEK"

# ---------------------------------------------------------------------------
# OIDC / Keycloak native JWT verification (Phase 0 contracts C-4, C-6, C-7)
# ---------------------------------------------------------------------------
# When OIDC_ENABLED=false the middleware is a no-op (still installed but
# returns immediately) so non-prod and unit-test deployments need no Keycloak.
OIDC_ENABLED: bool = os.getenv("OIDC_ENABLED", "false").lower() in ("true", "1", "yes")
# Keycloak realm root, e.g. https://keycloak.example.com/realms/acko. The
# middleware appends /.well-known/openid-configuration to discover jwks_uri.
OIDC_ISSUER_URL: str = os.getenv("OIDC_ISSUER_URL", "")
# Single audience claim contract C-4: tokens from the SPA carry aud=acko-api.
OIDC_AUDIENCE: str = os.getenv("OIDC_AUDIENCE", "acko-api")
# CSV ("acko:dev,acko:prod") or JSON list ("[\"acko:dev\"]"). Empty = auth-only,
# no role check. Resolved against decoded["realm_access"]["roles"].
OIDC_REQUIRED_ROLES: list[str] = _parse_str_list(os.getenv("OIDC_REQUIRED_ROLES"))
# JWKS cache TTL. Accepts duration string ("10m") or bare seconds ("600").
OIDC_JWKS_CACHE_TTL_SECONDS: int = _parse_duration_seconds(os.getenv("OIDC_JWKS_CACHE_TTL", "10m"), default_seconds=600)
# Paths that bypass auth entirely (exact match). Helm values may override.
OIDC_EXCLUDE_PATHS: list[str] = _parse_str_list(
    os.getenv("OIDC_EXCLUDE_PATHS", "/api/health,/api/openapi.json,/api/docs")
) or ["/api/health", "/api/openapi.json", "/api/docs"]

# OIDC claim used as the workspace owner identity. Defaults to ``sub`` (the
# stable subject identifier mandated by the OIDC core spec). Operators
# running against an IdP whose ``sub`` is unstable across logins can switch
# to ``preferred_username`` / a custom claim. See
# ``docs/plans/2026-05-07-workspace-ownership-schema.md`` Migration risk
# table. Read once at module import time so request hot-paths avoid an
# os.environ lookup on every call.
ACM_OIDC_OWNER_CLAIM: str = os.getenv("ACM_OIDC_OWNER_CLAIM", "sub")

# ---------------------------------------------------------------------------
# MCP (Model Context Protocol) server — phase 1
# ---------------------------------------------------------------------------
# When enabled, ``main.py`` mounts the FastMCP streamable-http transport at
# ``ACM_MCP_PATH``. The mount is opt-in so deployments that don't need the
# AI/agent surface pay no extra import or routing cost. The path is kept
# outside ``/api/*`` on purpose — REST and MCP serve different consumers
# and should be reasoned about as independent surfaces. Authentication still
# applies via the OIDC middleware when ``OIDC_ENABLED`` is true.
ACM_MCP_ENABLED: bool = _get_bool("ACM_MCP_ENABLED", False)
ACM_MCP_PATH: str = os.getenv("ACM_MCP_PATH", "/mcp")
# M2 — validate ACM_MCP_PATH at import time so a misconfigured deployment
# (e.g. ``ACM_MCP_PATH=mcp`` without leading slash, or ``ACM_MCP_PATH=/``
# which would shadow every route) fails loudly on process start instead
# of producing a quietly-broken mount. Canonicalize by trimming the
# trailing slash so the path-segment check in ``mcp/auth.py`` (M1) and
# the FastAPI ``app.mount`` call agree on the same string.
if not ACM_MCP_PATH.startswith("/") or ACM_MCP_PATH == "/":
    raise ValueError(f"ACM_MCP_PATH must start with '/' and not be '/' alone; got {ACM_MCP_PATH!r}")
ACM_MCP_PATH = ACM_MCP_PATH.rstrip("/")
# Optional shared-secret bearer token for the ``/mcp`` surface. When set
# alongside ``ACM_MCP_ENABLED=true``, the MCPBearerTokenMiddleware enforces
# ``Authorization: Bearer <token>`` on requests that OIDC has not already
# authenticated. Empty string (default) disables the bearer leg entirely
# and defers to OIDC. Used by clients that cannot perform a full OAuth
# Authorization Code flow (CI agents, headless scripts).
ACM_MCP_TOKEN: str = os.getenv("ACM_MCP_TOKEN", "")
# Call-time access gate. ``READ_ONLY`` (default) blocks WRITE tools
# at the call site even though the registry still advertises them. ``FULL``
# allows all tools. See ``mcp/access_profile.py`` for the WRITE list.
ACM_MCP_ACCESS_PROFILE: AccessProfile = parse_profile(os.getenv("ACM_MCP_ACCESS_PROFILE", "read_only"))
# B2 — escape hatch for the anonymous-MCP-exposure refusal in main.py.
# Without this flag the API process refuses to start when
# ``ACM_MCP_ENABLED=true`` AND OIDC is disabled AND ``ACM_MCP_TOKEN`` is
# empty, because that combination publishes the MCP surface to the
# entire network with no auth. Operators who are genuinely on a localhost
# loopback or behind a sealed-off ingress can opt back in here, but the
# refusal is the default for a reason.
ACM_MCP_ALLOW_ANONYMOUS: bool = _get_bool("ACM_MCP_ALLOW_ANONYMOUS", False)

# DNS rebinding protection — Host/Origin header allow-list for the streamable-HTTP
# transport.
#
# The MCP Python SDK (``mcp.server.lowlevel.server.streamable_http_app``)
# auto-enables DNS rebinding protection whenever the transport ``host`` falls
# back to its default of ``127.0.0.1`` and no explicit ``TransportSecuritySettings``
# is supplied. Because :func:`mcp.server.server.streamable_http_asgi` calls
# ``mcp.streamable_http_app()`` without arguments, that default kicks in and the
# transport rejects any request whose ``Host`` header is not in
# ``["127.0.0.1:*", "localhost:*", "[::1]:*"]`` with HTTP 421 ``Invalid Host header``.
#
# That is the correct default for ``mcp run`` on a developer laptop, but it
# breaks production deployments where the API is reached through an ingress /
# LoadBalancer / Gateway with a public hostname (e.g.
# ``aerospike-api.example.com``). Operators set this env to a comma-separated
# list of allowed Host values, e.g.::
#
#     ACM_MCP_ALLOWED_HOSTS=aerospike-api.example.com,aerospike-api.example.com:*
#
# Each entry is matched as-is by the SDK's :class:`TransportSecurityMiddleware`,
# which also supports the ``host:*`` wildcard-port pattern. The localhost
# loopback entries are merged in automatically so direct in-pod debugging
# (``kubectl exec ... curl http://localhost:8000/mcp``) keeps working.
#
# When the list is empty (default) we preserve the SDK auto-default behavior —
# only loopback hosts are allowed. This matches what users got before this knob
# existed and avoids silently widening the trust boundary on upgrade.
ACM_MCP_ALLOWED_HOSTS: list[str] = [h.strip() for h in os.getenv("ACM_MCP_ALLOWED_HOSTS", "").split(",") if h.strip()]

# Origin allow-list for the streamable-HTTP transport. Browser-style clients
# send an ``Origin`` header on cross-origin requests; SDK's
# :class:`TransportSecurityMiddleware` matches it against this list.
#
# When empty (default), :func:`mcp.server.server.build_mcp_app` derives
# ``http://<host>`` + ``https://<host>`` entries from ``ACM_MCP_ALLOWED_HOSTS``.
# That works for plain ingress URLs (``aerospike-api.example.com`` →
# ``http://aerospike-api.example.com`` + ``https://...``) and is what you want
# in the common case.
#
# Set this env explicitly when the public Origin form differs from Host — e.g.::
#
#   * non-standard port:     ACM_MCP_ALLOWED_ORIGINS=https://app.example.com:8443
#   * CDN / proxy rewriting: ACM_MCP_ALLOWED_ORIGINS=https://acm.cdn-domain.com
#   * strict-scheme:         ACM_MCP_ALLOWED_ORIGINS=https://aerospike-api.example.com
#                            (only https — no http auto-derivation)
#
# Localhost loopback origins (``http://127.0.0.1:*``, ``http://localhost:*``,
# ``http://[::1]:*``) are merged in automatically — explicit operator entries
# never need to repeat them.
ACM_MCP_ALLOWED_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("ACM_MCP_ALLOWED_ORIGINS", "").split(",") if o.strip()
]
