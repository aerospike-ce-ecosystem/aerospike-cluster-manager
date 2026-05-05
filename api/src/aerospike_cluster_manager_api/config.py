from __future__ import annotations

import json
import os
import re


def _get_int(name: str, default: int) -> int:
    """Parse an integer environment variable with validation."""
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        raise ValueError(f"Environment variable {name} must be an integer, got: {raw!r}") from None


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
