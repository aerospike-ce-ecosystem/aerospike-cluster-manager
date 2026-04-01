import logging
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from aerospike_cluster_manager_api import config, db
from aerospike_cluster_manager_api.client_manager import client_manager
from aerospike_cluster_manager_api.events.broker import broker
from aerospike_cluster_manager_api.events.collector import collector
from aerospike_cluster_manager_api.logging_config import setup_logging
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.routers import (
    admin_roles,
    admin_users,
    clusters,
    connections,
    events,
    indexes,
    metrics,
    query,
    records,
    sample_data,
    udfs,
)

if config.K8S_MANAGEMENT_ENABLED:
    from aerospike_cluster_manager_api.routers import k8s_clusters

setup_logging(config.LOG_LEVEL, config.LOG_FORMAT)
logger = logging.getLogger(__name__)


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
    await db.close_db()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Aerospike Cluster Manager API",
    version="0.1.0",
    description="REST API for managing Aerospike Community Edition clusters",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[reportArgumentType]
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)


# ---------------------------------------------------------------------------
# Request logging middleware
# ---------------------------------------------------------------------------


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next: RequestResponseEndpoint) -> Response:
    request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:16])
    start = time.monotonic()
    response = await call_next(request)
    elapsed_ms = (time.monotonic() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "%s %s %d %.1fms request_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
        request_id,
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

    csp = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'"
    )
    if config.CSP_REPORT_URI:
        sanitized_uri = config.CSP_REPORT_URI.split(";")[0].strip()
        if sanitized_uri:
            csp += f"; report-uri {sanitized_uri}"
    response.headers["Content-Security-Policy"] = csp

    if config.ENABLE_HSTS:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"

    return response


# ---------------------------------------------------------------------------
# Global exception handlers for aerospike-py errors
# ---------------------------------------------------------------------------

try:
    from aerospike_py.exception import (
        AdminError,
        AerospikeError,
        AerospikeTimeoutError,
        ClusterError,
        IndexFoundError,
        IndexNotFound,
        RecordExistsError,
        RecordGenerationError,
        RecordNotFound,
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
        return JSONResponse(status_code=500, content={"detail": "An internal server error occurred"})

    @app.exception_handler(AerospikeTimeoutError)
    async def _timeout_error(_req: Request, exc: AerospikeTimeoutError) -> JSONResponse:
        return JSONResponse(status_code=504, content={"detail": "Operation timed out"})

    @app.exception_handler(ClusterError)
    async def _cluster_error(_req: Request, exc: ClusterError) -> JSONResponse:
        logger.exception("Aerospike cluster error")
        return JSONResponse(status_code=503, content={"detail": "Connection error: unable to reach Aerospike cluster"})

    @app.exception_handler(AerospikeError)
    async def _aerospike_error(_req: Request, exc: AerospikeError) -> JSONResponse:
        logger.exception("Aerospike error")
        return JSONResponse(status_code=500, content={"detail": "An internal server error occurred"})

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
    connections.router,
    clusters.router,
    records.router,
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
