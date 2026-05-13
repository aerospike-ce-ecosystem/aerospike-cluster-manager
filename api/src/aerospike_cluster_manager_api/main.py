import logging
import re
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response
from swagger_ui_bundle import swagger_ui_path  # type: ignore[import-untyped]

from aerospike_cluster_manager_api import config, db
from aerospike_cluster_manager_api.client_manager import client_manager
from aerospike_cluster_manager_api.events.broker import broker
from aerospike_cluster_manager_api.events.collector import collector
from aerospike_cluster_manager_api.logging_config import setup_logging
from aerospike_cluster_manager_api.middleware.oidc_auth import OIDCAuthMiddleware
from aerospike_cluster_manager_api.middleware.trace_id import TraceIDMiddleware
from aerospike_cluster_manager_api.observability import setup_observability
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.routers import (
    admin_roles,
    admin_users,
    clusters,
    connections,
    events,
    indexes,
    metrics,
    notes,
    query,
    records,
    sample_data,
    sets,
    udfs,
    workspaces,
)

if config.K8S_MANAGEMENT_ENABLED:
    from aerospike_cluster_manager_api.routers import k8s_clusters

# OTel must initialize BEFORE setup_logging so LoggingInstrumentor can patch
# the LogRecord factory before the first log line is emitted. Both calls are
# no-ops when their respective env vars are at their defaults
# (OTEL_SDK_DISABLED=true / LOG_HANDLERS empty / LOGGING_CONFIG_FILE empty).
setup_observability()
setup_logging(config.LOG_LEVEL, config.LOG_FORMAT)
logger = logging.getLogger(__name__)


# ORDERING INVARIANT: this module-global is SET by the MCP mount block
# below at module-import time (see ``if config.ACM_MCP_ENABLED:`` further
# down — it assigns ``_mcp_app = build_mcp_app()``), and READ by
# ``lifespan()`` at FastAPI startup to drive the FastMCP session_manager.
# The two events happen in different phases of the process lifecycle, so
# leaving the variable as a module-level binding (rather than a closure
# or app.state attribute) is intentional. Don't move this declaration
# below the mount block — Python would still resolve the name at call
# time, but the explicit ``None`` default is what makes the
# else-branch in lifespan() correct when MCP is disabled.
_mcp_app = None  # populated below when ACM_MCP_ENABLED so lifespan can drive its session_manager


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    logger.info("Starting Aerospike Cluster Manager API")
    await db.init_db()

    # Configure broker max connections from config and start event collector
    broker.max_connections = config.SSE_MAX_CONNECTIONS
    if config.SSE_ENABLED:
        await collector.start()

    # FastMCP's streamable_http_app spawns a session_manager whose async task
    # group is bootstrapped in its OWN lifespan. Mounted Starlette sub-apps
    # do NOT share lifespan with the parent FastAPI, so we drive the MCP
    # session_manager from here directly.
    if _mcp_app is not None:
        async with _mcp_app.session_manager.run():
            yield
    else:
        yield

    if config.SSE_ENABLED:
        await collector.stop()
    await client_manager.close_all()
    await db.close_db()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Aerospike Cluster Manager API",
    version="0.1.0",
    description="REST API for managing Aerospike Community Edition clusters",
    # /api/docs is served below from self-hosted swagger-ui assets so the docs
    # page works in airgap / firewalled clusters that can't reach jsdelivr (#234).
    docs_url=None,
    # Redoc is disabled — FastAPI's default /api/redoc loads redoc.standalone.js
    # from cdn.jsdelivr.net and there is no maintained Python package that
    # vendors it. /api/docs (Swagger UI) covers the same use case and is
    # self-hosted, so disabling redoc avoids the airgap footgun without losing
    # API-explorer functionality. Re-enable + vendor JS at build time if needed.
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# Serve swagger-ui-dist files vendored by the swagger-ui-bundle package so
# /api/docs has no public-internet egress requirement.
app.mount(
    "/api/docs/static",
    StaticFiles(directory=str(swagger_ui_path)),
    name="swagger-ui-static",
)


# FastAPI's get_swagger_ui_html() emits an inline <script> that calls
# SwaggerUIBundle({...}). Our CSP sets `script-src 'self'`, which blocks any
# inline script and leaves /api/docs blank in the browser (#238). The custom
# HTML below mirrors FastAPI's layout but moves the bootstrap call to the
# external /api/docs/swagger-init.js route below, so the page renders under
# strict CSP without weakening it for the rest of the API surface.
_SWAGGER_UI_HTML = """\
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link type="text/css" rel="stylesheet" href="/api/docs/static/swagger-ui.css">
<link rel="shortcut icon" href="/api/docs/static/favicon-32x32.png">
<title>Aerospike Cluster Manager API - Swagger UI</title>
</head>
<body>
<div id="swagger-ui"></div>
<script src="/api/docs/static/swagger-ui-bundle.js"></script>
<script src="/api/docs/swagger-init.js"></script>
</body>
</html>
"""

_SWAGGER_INIT_JS = """\
window.ui = SwaggerUIBundle({
    url: '/api/openapi.json',
    dom_id: '#swagger-ui',
    layout: 'BaseLayout',
    deepLinking: true,
    showExtensions: true,
    showCommonExtensions: true,
    presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset,
    ],
});
"""


@app.get("/api/docs", include_in_schema=False)
async def custom_swagger_ui() -> HTMLResponse:
    """Swagger UI page.

    With CSP_ENABLED=true (default): self-hosted assets + external
    swagger-init.js so the page renders under strict `script-src 'self'`
    (#238). The vendored swagger-ui is 4.15.5 and does not parse OpenAPI 3.1.

    With CSP_ENABLED=false: FastAPI's default helper which loads swagger-ui
    5.x from cdn.jsdelivr.net — full OpenAPI 3.1 support and no init.js
    indirection (#241). Browsers fetch the assets directly, so this works
    whenever the operator's workstation has internet egress, regardless of
    whether the cluster's pods do.
    """
    if not config.CSP_ENABLED:
        return get_swagger_ui_html(
            openapi_url=app.openapi_url or "/api/openapi.json",
            title=f"{app.title} - Swagger UI",
        )
    return HTMLResponse(content=_SWAGGER_UI_HTML)


@app.get("/api/docs/swagger-init.js", include_in_schema=False)
async def swagger_ui_init_js() -> Response:
    """SwaggerUIBundle bootstrap — split into its own JS file so CSP `script-src 'self'` permits it (#238)."""
    return Response(content=_SWAGGER_INIT_JS, media_type="application/javascript")


app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[reportArgumentType]
app.add_middleware(SlowAPIMiddleware)

# CORS wildcard + credentials is unsafe -- the browser will silently drop
# the response when both are set. Treat the dangerous combo as a
# configuration error: log a warning and force credentials off so the
# server starts in a recognizably-broken-but-safe state instead of
# silently leaking a "*" origin with cookies/Authorization echoed back.
_cors_allow_credentials = True
if "*" in config.CORS_ORIGINS:
    logger.warning(
        "CORS_ORIGINS contains '*' which is incompatible with allow_credentials=True; "
        "forcing allow_credentials=False. Set CORS_ORIGINS to an explicit list of origins to re-enable credentials."
    )
    _cors_allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=_cors_allow_credentials,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)


# ---------------------------------------------------------------------------
# Request logging middleware
# ---------------------------------------------------------------------------

# Matches ``access_token=...`` (and a few common JWT-like query keys) in a
# URL query string. We log the path + (optionally) query, and SSE clients
# pass JWTs as ``?access_token=`` because EventSource cannot send Authorization
# headers — masking before logging keeps tokens out of access logs.
_SENSITIVE_QS_RE = re.compile(r"(access_token|id_token|token)=[^&\s]+", re.IGNORECASE)


def _mask_query_string(qs: str) -> str:
    if not qs:
        return qs
    return _SENSITIVE_QS_RE.sub(lambda m: f"{m.group(1)}=***", qs)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next: RequestResponseEndpoint) -> Response:
    # TraceIDMiddleware (registered below) runs as the outermost layer and
    # populates request_id_var before this handler executes. It also owns
    # the X-Request-ID response header — do NOT set it here.
    start = time.monotonic()
    response = await call_next(request)
    elapsed_ms = (time.monotonic() - start) * 1000
    # The structured `request_id` JSON field (populated by RequestIDFilter)
    # is the source of truth for log correlation; no need to repeat it in
    # the message text.
    masked_qs = _mask_query_string(request.url.query)
    path_for_log = f"{request.url.path}?{masked_qs}" if masked_qs else request.url.path
    logger.info(
        "%s %s %d %.1fms",
        request.method,
        path_for_log,
        response.status_code,
        elapsed_ms,
    )
    return response


# ---------------------------------------------------------------------------
# Security headers middleware
# ---------------------------------------------------------------------------


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next: RequestResponseEndpoint) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    if config.CSP_ENABLED:
        csp = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; font-src 'self'"
        )
        if config.CSP_REPORT_URI:
            sanitized_uri = config.CSP_REPORT_URI.split(";")[0].strip()
            if sanitized_uri:
                csp += f"; report-uri {sanitized_uri}"
        response.headers["Content-Security-Policy"] = csp

    if config.ENABLE_HSTS:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"

    return response


# OIDCAuthMiddleware is added BEFORE TraceIDMiddleware so the runtime
# layering becomes (outermost → innermost): TraceID → MCP → OIDC →
# security_headers → request_logging → CORS → SlowAPI. That way every
# authenticated request already has a request_id in scope when the JWT
# verifier logs, and CORS preflight responses are still produced even
# when the bearer token is missing/invalid (the OIDC dispatch
# short-circuits OPTIONS so CORSMiddleware downstream answers the
# preflight).
# The MCP bearer-token middleware is installed AFTER OIDC in the
# ``add_middleware`` order so that — given Starlette's reverse-add
# semantics — it runs BEFORE OIDC at request time. That ordering is
# critical for the OIDC-OR-bearer gate: a bearer-only token (opaque,
# not a JWT) must be accepted/rejected by MCP middleware *before* OIDC
# tries to JWT-verify it and 401s on the way in. On a successful
# bearer match MCP middleware sets a sentinel ``request.state.user_claims``
# so the inner OIDCAuthMiddleware defers (it short-circuits when
# user_claims is already populated). When OIDC is enabled and the
# bearer doesn't match, MCP middleware falls through and lets OIDC try
# the header as a JWT — preserving the documented OR semantic.
# We install only when ``ACM_MCP_ENABLED=true`` — when the mount itself
# is off, the path doesn't exist and the middleware would be dead weight.
# B2 — refuse to start when the MCP surface would be unauthenticated.
# OIDC OR a shared-secret bearer token must be configured, otherwise
# ``/mcp/*`` would be open to any network peer that can reach the API
# port. ``ACM_MCP_ALLOW_ANONYMOUS=true`` is the documented escape
# hatch for localhost-only or trusted-network deployments.
if (
    config.ACM_MCP_ENABLED
    and not config.OIDC_ENABLED
    and not config.ACM_MCP_TOKEN
    and not config.ACM_MCP_ALLOW_ANONYMOUS
):
    raise RuntimeError(
        "ACM_MCP_ENABLED=true but neither OIDC nor ACM_MCP_TOKEN is configured. "
        "Refusing to start an anonymous MCP surface. Set OIDC_ENABLED=true and "
        "OIDC_ISSUER_URL, OR set ACM_MCP_TOKEN to a shared secret, OR set "
        "ACM_MCP_ALLOW_ANONYMOUS=true if you have verified the deployment is "
        "isolated to localhost / a trusted network."
    )

# Starlette ``add_middleware`` semantics: each call ``insert(0, ...)`` into
# ``user_middleware``, then ``build_middleware_stack`` wraps them in
# ``reversed()`` order. Net effect: the LAST ``add_middleware`` call becomes
# the OUTERMOST layer at request time. We exploit that to land:
#
#   request -> MCPBearerToken -> OIDC -> MCPUserContext -> ... -> route
#
# i.e. MCPBearerToken runs first to handle opaque bearer tokens (it
# stashes a sentinel ``request.state.user_claims`` on success, otherwise
# falls through), OIDC runs next to JWT-verify and populate
# ``request.state.user_claims`` for real, and MCPUserContextMiddleware
# runs *after* both so it can copy the now-populated claims onto the
# contextvar for the MCP tool registry. The order of the ``add_middleware``
# calls below is therefore deliberately reversed from the runtime order.
if config.ACM_MCP_ENABLED:
    # E.2 (#307): bridge ``request.state.user_claims`` into a contextvar
    # so the MCP registry's workspace gate can read the caller identity
    # without re-threading the FastAPI ``Request``. Added FIRST here so
    # it ends up INNERMOST among the auth-related middlewares — it reads
    # the claims OIDC + MCPBearer have already populated.
    from aerospike_cluster_manager_api.mcp.user_context import MCPUserContextMiddleware

    app.add_middleware(MCPUserContextMiddleware)

if config.OIDC_ENABLED:
    # OIDC sits in the middle of the stack: outer to MCPUserContext (so
    # claims are populated before the bridge reads them) but inner to
    # MCPBearerToken (so an opaque bearer token can short-circuit OIDC's
    # JWT verifier).
    app.add_middleware(
        OIDCAuthMiddleware,
        enabled=True,
        issuer_url=config.OIDC_ISSUER_URL,
        audience=config.OIDC_AUDIENCE,
        required_roles=config.OIDC_REQUIRED_ROLES,
        exclude_paths=config.OIDC_EXCLUDE_PATHS,
        jwks_cache_ttl_seconds=config.OIDC_JWKS_CACHE_TTL_SECONDS,
    )

if config.ACM_MCP_ENABLED:
    # Added LAST among the MCP/OIDC trio so it ends up OUTERMOST and
    # gets first crack at the request -- bearer-only callers never reach
    # OIDC's JWT verifier.
    from aerospike_cluster_manager_api.mcp.auth import MCPBearerTokenMiddleware

    app.add_middleware(MCPBearerTokenMiddleware)

# TraceIDMiddleware is registered AFTER all other middleware (CORS, SlowAPI,
# request_logging, security_headers, OIDC) so that — given Starlette's
# reverse-add semantics where the last middleware added is the outermost
# layer — it reads or generates X-Request-ID and stores it in the ContextVar
# BEFORE any inner middleware or route handler runs, and echoes the header on
# the way out.
app.add_middleware(TraceIDMiddleware)


# ---------------------------------------------------------------------------
# Global exception handlers for aerospike-py errors
# ---------------------------------------------------------------------------


def _internal_error_response(message: str) -> JSONResponse:
    """Build a 500 JSON response that surfaces requestId + the underlying error.

    Issues #257 and #260 specifically asked for log-correlation context in 500
    bodies. TraceIDMiddleware populates ``request_id_var`` for the duration of
    every request, so the handler can read it without a dependency on
    request.state.
    """
    from aerospike_cluster_manager_api.middleware.trace_id import REQUEST_ID_HEADER, request_id_var

    request_id = request_id_var.get()
    body: dict[str, str] = {"detail": "An internal server error occurred", "error": message}
    if request_id and request_id != "-":
        body["requestId"] = request_id
    response = JSONResponse(status_code=500, content=body)
    if request_id and request_id != "-":
        response.headers[REQUEST_ID_HEADER] = request_id
    return response


try:
    from aerospike_py.exception import (
        AdminError,
        AerospikeError,
        AerospikeTimeoutError,
        BackpressureError,
        ClusterError,
        IndexFoundError,
        IndexNotFound,
        RecordExistsError,
        RecordGenerationError,
        RecordNotFound,
        RustPanicError,
        ServerError,
    )

    @app.exception_handler(RecordNotFound)
    async def _record_not_found(_req: Request, exc: RecordNotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": "Record not found"})

    @app.exception_handler(RecordExistsError)
    async def _record_exists(_req: Request, exc: RecordExistsError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": "Record already exists"})

    @app.exception_handler(RecordGenerationError)
    async def _record_generation(_req: Request, exc: RecordGenerationError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": "Generation conflict"})

    @app.exception_handler(IndexNotFound)
    async def _index_not_found(_req: Request, exc: IndexNotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": "Index not found"})

    @app.exception_handler(IndexFoundError)
    async def _index_found(_req: Request, exc: IndexFoundError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": "Index already exists"})

    @app.exception_handler(AdminError)
    async def _admin_error(_req: Request, exc: AdminError) -> JSONResponse:
        return JSONResponse(
            status_code=403,
            content={"detail": "User/role management requires Aerospike Enterprise Edition"},
        )

    @app.exception_handler(ServerError)
    async def _server_error(_req: Request, exc: ServerError) -> JSONResponse:
        msg = str(exc)
        # TODO: Replace string check with proper error code when aerospike-py exposes result_code
        if "failforbidden" in msg.lower():
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "Operation forbidden by server. "
                    "If setting TTL, ensure the namespace has 'nsup-period' configured."
                },
            )
        logger.warning("Unrecognized ServerError: %s", msg)
        return _internal_error_response(msg)

    @app.exception_handler(AerospikeTimeoutError)
    async def _timeout_error(_req: Request, exc: AerospikeTimeoutError) -> JSONResponse:
        return JSONResponse(status_code=504, content={"detail": "Operation timed out"})

    @app.exception_handler(BackpressureError)
    async def _backpressure_error(_req: Request, exc: BackpressureError) -> JSONResponse:
        # aerospike-py backpressure: native client refused the call because
        # its in-flight queue is full. 503 + Retry-After (seconds) matches
        # the aerospike-py-fastapi skill contract so clients can retry with
        # exponential backoff instead of treating it as a hard failure.
        return JSONResponse(
            status_code=503,
            content={"detail": "Aerospike client is overloaded; retry after backoff"},
            headers={"Retry-After": "1"},
        )

    @app.exception_handler(ClusterError)
    async def _cluster_error(_req: Request, exc: ClusterError) -> JSONResponse:
        logger.exception("Aerospike cluster error")
        return JSONResponse(status_code=503, content={"detail": "Connection error: unable to reach Aerospike cluster"})

    @app.exception_handler(RustPanicError)
    async def _rust_panic(_req: Request, exc: RustPanicError) -> JSONResponse:
        # aerospike-py #280: a record on the cluster carries a particle type
        # the native client cannot decode (commonly PYTHON_BLOB / JAVA_BLOB
        # legacy data). The native panic was caught and surfaced; the backend
        # process is alive but this request can't complete because aerospike-
        # core's stream cannot resume after the panic.
        logger.warning("Native panic surfaced as RustPanicError: %s", exc)
        return JSONResponse(
            status_code=422,
            content={
                "detail": (
                    "This record (or one in the result stream) contains a "
                    "particle type the native client cannot decode "
                    "(e.g. PYTHON_BLOB / JAVA_BLOB written by a legacy "
                    "language-specific client). See aerospike-py issue #280."
                ),
                "error_kind": "rust_panic",
            },
        )

    @app.exception_handler(AerospikeError)
    async def _aerospike_error(_req: Request, exc: AerospikeError) -> JSONResponse:
        logger.exception("Aerospike error")
        return _internal_error_response(str(exc))

except ImportError:
    pass

# ---------------------------------------------------------------------------
# Routers — versioned (/api/v1/...) and backward-compatible (/api/...)
# ---------------------------------------------------------------------------

# Each sub-router uses a domain prefix (e.g. /connections, /clusters).
# We mount them under both /api and /api/v1 so that:
#   - Existing clients using /api/... continue to work (backward compat)
#   - New clients can target /api/v1/... for explicit versioning

_routers = [
    workspaces.router,
    connections.router,
    clusters.router,
    records.router,
    sets.router,
    notes.router,
    query.router,
    indexes.router,
    admin_users.router,
    admin_roles.router,
    udfs.router,
    sample_data.router,
    metrics.router,
    events.router,
]

if config.K8S_MANAGEMENT_ENABLED:
    _routers.append(k8s_clusters.router)

api_router = APIRouter(prefix="/api", include_in_schema=False)
v1_router = APIRouter(prefix="/api/v1")

for r in _routers:
    api_router.include_router(r)
    v1_router.include_router(r)

app.include_router(v1_router)
app.include_router(api_router)

# ---------------------------------------------------------------------------
# MCP (Model Context Protocol) — opt-in mount
# ---------------------------------------------------------------------------
# Mounted AFTER the REST router includes so the MCP path stays a sibling of
# /api/* (different consumer, different auth/UX). The import is local so a
# disabled flag pays no import cost at startup.
if config.ACM_MCP_ENABLED:
    from aerospike_cluster_manager_api.mcp.server import CanonicalMCPMount, build_mcp_app, streamable_http_asgi

    _mcp_app = build_mcp_app(
        allowed_hosts=config.ACM_MCP_ALLOWED_HOSTS,
        allowed_origins=config.ACM_MCP_ALLOWED_ORIGINS,
    )
    # ``CanonicalMCPMount`` replaces ``app.mount(...)`` because the default
    # Starlette ``Mount`` regex (``^/mcp/(?P<path>.*)$``) does not match
    # the bare ``/mcp`` URL — the parent Router then falls into the
    # ``redirect_slashes`` branch and 307s clients to ``/mcp/``. Many MCP
    # clients refuse to follow a 307 on a POST that carries an
    # ``Authorization`` header, so the redirect would break the canonical
    # transport URL. The custom route matches both spellings directly.
    app.router.routes.append(CanonicalMCPMount(config.ACM_MCP_PATH, streamable_http_asgi(_mcp_app)))

# FastAPIInstrumentor wraps every route handler with a server span. The
# wiring is a no-op when OTel is disabled (NoOp tracer). We exclude the
# health and docs endpoints from instrumentation because they're high-volume
# and uninteresting for tracing — only the /api/v1/* business surface and
# /api/* legacy aliases produce useful spans.
try:
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

    FastAPIInstrumentor.instrument_app(
        app,
        excluded_urls="/api/health,/api/docs.*,/api/openapi.json",
    )
except ImportError:
    # OTel deps are required at install time; this guard only catches an
    # explicitly broken environment.
    logger.warning("opentelemetry-instrumentation-fastapi not available; HTTP server spans disabled")


@app.get("/api/health")
async def health_check(detail: bool = Query(False)) -> dict:
    if not detail:
        return {"status": "ok"}

    # Check DB health
    db_ok = await db.check_health()

    overall = "ok" if db_ok else "degraded"
    return {
        "status": overall,
        "components": {
            "database": {"status": "ok" if db_ok else "error"},
        },
    }
