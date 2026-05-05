"""Custom Starlette/FastAPI middleware for the Aerospike Cluster Manager API."""

from __future__ import annotations

from aerospike_cluster_manager_api.middleware.oidc_auth import (
    SSE_QUERY_TOKEN_PATHS,
    OIDCAuthMiddleware,
)
from aerospike_cluster_manager_api.middleware.trace_id import (
    REQUEST_ID_HEADER,
    RequestIDFilter,
    TraceIDMiddleware,
    request_id_var,
)

__all__ = [
    "REQUEST_ID_HEADER",
    "SSE_QUERY_TOKEN_PATHS",
    "OIDCAuthMiddleware",
    "RequestIDFilter",
    "TraceIDMiddleware",
    "request_id_var",
]
