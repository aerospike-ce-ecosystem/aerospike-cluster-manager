import logging
import re
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import fastapi_offline
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

from aerospike_cluster_manager_api import config, db
from aerospike_cluster_manager_api.aerospike_errors import RESULT_CODE_FAIL_FORBIDDEN, result_code_of
from aerospike_cluster_manager_api.client_manager import client_manager
from aerospike_cluster_manager_api.events.broker import broker
from aerospike_cluster_manager_api.events.collector import collector
from aerospike_cluster_manager_api.logging_config import setup_logging
from aerospike_cluster_manager_api.middleware.oidc_auth import OIDCAuthMiddleware
from aerospike_cluster_manager_api.middleware.trace_id import TraceIDMiddleware
from aerospike_cluster_manager_api.observability import (
    apply_aerospike_py_log_level,
    setup_observability,
    shutdown_observability,
)
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.routers import (
    admin_roles,
    admin_users,
    clusters,
    connections,
    events,
    guides,
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
# the LogRecord factory before the first log line is emitted. setup_observability
# is a no-op when OTEL_SDK_DISABLED=true.
setup_observability()
setup_logging(config.LOG_LEVEL, config.LOG_FORMAT)
# Open aerospike-py's Rust-core log bridge now that the formatter is configured,
# so client-core records share ACM's formatting and OTLP log pipeline.
apply_aerospike_py_log_level()
logger = logging.getLogger(__name__)


def _find_oidc_middleware(app: FastAPI) -> OIDCAuthMiddleware | None:
    """Locate the live OIDCAuthMiddleware instance in the built ASGI stack.

    Starlette instantiates middleware lazily inside
    ``build_middleware_stack()``; the resulting instances form a chain
    via each layer's ``app`` attribute. We walk that chain so the
    lifespan shutdown hook can close the middleware's JWKS HTTP client.
    Returns ``None`` when OIDC is disabled (the middleware is never added).
    """
    node: object | None = app.middleware_stack
    while node is not None:
        if isinstance(node, OIDCAuthMiddleware):
            return node
        node = getattr(node, "app", None)
    return None


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    logger.info("Starting Aerospike Cluster Manager API")
    await db.init_db()

    # Configure broker max connections from config and start event collector
    broker.max_connections = config.SSE_MAX_CONNECTIONS
    if config.SSE_ENABLED:
        await collector.start()

    yield

    if config.SSE_ENABLED:
        await collector.stop()
    await client_manager.close_all()
    # Close the OIDC middleware's lazily-created JWKS HTTP client, if it
    # built one. _find_oidc_middleware walks the built middleware stack;
    # it returns None when OIDC is disabled (no middleware installed).
    oidc_mw = _find_oidc_middleware(_app)
    if oidc_mw is not None:
        await oidc_mw.aclose()
    await db.close_db()
    logger.info("Shutdown complete")
    # Flush the OTel pipeline last so the final spans/logs/metrics batch —
    # including the line above — is exported before the exporters close.
    shutdown_observability()


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

# Serve swagger-ui-dist files vendored by the fastapi-offline package so
# /api/docs has no public-internet egress requirement. fastapi-offline ships
# swagger-ui 5.x, which parses the OpenAPI 3.1 documents FastAPI emits; the
# previously used swagger-ui-bundle package is stale at swagger-ui 4.15.5,
# which rejects 3.1 specs outright and left /api/docs blank (#250).
_SWAGGER_UI_STATIC_DIR = Path(fastapi_offline.__file__).parent / "static"
app.mount(
    "/api/docs/static",
    StaticFiles(directory=str(_SWAGGER_UI_STATIC_DIR)),
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
<link rel="shortcut icon" href="/api/docs/static/favicon.png">
<title>Aerospike Cluster Manager API - Swagger UI</title>
</head>
<body>
<div id="swagger-ui"></div>
<script src="/api/docs/static/swagger-ui-bundle.js"></script>
<script src="/api/docs/swagger-init.js"></script>
</body>
</html>
"""

# NOTE: no SwaggerUIStandalonePreset here (#250). swagger-ui-dist 4.x/5.x
# bundles do not expose it as a SwaggerUIBundle property (it lives in the
# separate swagger-ui-standalone-preset.js, which defines a window global
# instead), so referencing SwaggerUIBundle.SwaggerUIStandalonePreset passes
# `undefined` as a preset. The preset only supplies StandaloneLayout + the top
# bar, which `layout: 'BaseLayout'` never uses, so the correct fix is to omit
# it rather than load an extra unused asset.
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
    ],
});
"""


@app.get("/api/docs", include_in_schema=False)
async def custom_swagger_ui() -> HTMLResponse:
    """Swagger UI page.

    With CSP_ENABLED=true (default): self-hosted assets + external
    swagger-init.js so the page renders under strict `script-src 'self'`
    (#238). The assets are swagger-ui 5.x vendored by fastapi-offline, so
    the OpenAPI 3.1 documents FastAPI emits render fully offline (#250).

    With CSP_ENABLED=false: FastAPI's default helper which loads swagger-ui
    5.x from cdn.jsdelivr.net with no init.js indirection (#241). Browsers
    fetch the assets directly, so this works whenever the operator's
    workstation has internet egress, regardless of whether the cluster's
    pods do.
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

# Matches credential-bearing query keys in a URL query string before the
# request line is logged. ``?access_token=`` is no longer *accepted* by the
# API (issue #345 replaced it with single-use SSE tickets), but old or
# misconfigured clients may still send it — keep masking so a rejected
# request doesn't persist the JWT either. ``ticket`` values are single-use
# and short-lived, but masking them too keeps even a burned credential out
# of the logs.
_SENSITIVE_QS_RE = re.compile(r"(access_token|id_token|ticket|token)=[^&\s]+", re.IGNORECASE)


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
# layering becomes (outermost → innermost): TraceID → OIDC →
# security_headers → request_logging → CORS → SlowAPI. That way every
# authenticated request already has a request_id in scope when the JWT
# verifier logs, and CORS preflight responses are still produced even
# when the bearer token is missing/invalid (the OIDC dispatch
# short-circuits OPTIONS so CORSMiddleware downstream answers the
# preflight).
if config.OIDC_ENABLED:
    app.add_middleware(
        OIDCAuthMiddleware,
        enabled=True,
        issuer_url=config.OIDC_ISSUER_URL,
        audience=config.OIDC_AUDIENCE,
        required_roles=config.OIDC_REQUIRED_ROLES,
        exclude_paths=config.OIDC_EXCLUDE_PATHS,
        jwks_cache_ttl_seconds=config.OIDC_JWKS_CACHE_TTL_SECONDS,
    )

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


def _internal_error_response() -> JSONResponse:
    """Build a 500 JSON response that surfaces requestId for log correlation.

    Issues #257 and #260 specifically asked for log-correlation context in 500
    bodies. TraceIDMiddleware populates ``request_id_var`` for the duration of
    every request, so the handler can read it without a dependency on
    request.state.

    The body intentionally carries only a generic message — the underlying
    ``str(exc)`` / traceback can leak internal detail (hostnames, query
    fragments, stack context) to API clients, so callers must log the full
    error server-side and clients correlate via ``requestId``.
    """
    from aerospike_cluster_manager_api.middleware.trace_id import REQUEST_ID_HEADER, request_id_var

    request_id = request_id_var.get()
    body: dict[str, str] = {"detail": "An internal server error occurred", "error": "Internal server error"}
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
        # Map by the stable numeric Aerospike result code rather than by
        # matching substrings of the (release-dependent) message text.
        # result_code_of prefers a structured ``exc.result_code`` attribute
        # (aerospike-py ADR-0011) and falls back to the code embedded in the
        # message ("AEROSPIKE_ERR (<code>)") for currently-released builds.
        code = result_code_of(exc)
        if code == RESULT_CODE_FAIL_FORBIDDEN:
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "Operation forbidden by server. "
                    "If setting TTL, ensure the namespace has 'nsup-period' configured."
                },
            )
        logger.warning("Unrecognized ServerError (result_code=%s): %s", code, exc)
        return _internal_error_response()

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
        logger.exception("Aerospike error: %s", exc)
        return _internal_error_response()

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
    guides.router,
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

    # Check DB health. db.check_health() dispatches through _get_backend(),
    # which raises DBNotInitialized when init_db() has not run (or is still
    # running). The backends' own check_health() swallow errors and return
    # False, but that guard sits BEFORE their try-block — so an uninitialized
    # backend would surface as an unhandled 500 instead of a "degraded"
    # report. Treat any failure as not-healthy so the endpoint always returns
    # a structured 200 status the readiness probe can act on.
    try:
        db_ok = await db.check_health()
    except Exception:
        logger.warning("Health check: database is not ready", exc_info=True)
        db_ok = False

    overall = "ok" if db_ok else "degraded"
    return {
        "status": overall,
        "components": {
            "database": {"status": "ok" if db_ok else "error"},
        },
    }
