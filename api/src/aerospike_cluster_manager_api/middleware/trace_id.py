"""X-Request-ID trace middleware for log correlation.

Each incoming request is assigned a request id (echoed in the response) so
operator UI actions can be correlated with API logs and downstream Kubernetes
operator events. The id is stored in a ``contextvars.ContextVar`` so that any
log call made while handling the request can attach it to the structured log
record without explicit plumbing.
"""

from __future__ import annotations

import contextvars
import logging
import uuid
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"

# Default "-" follows the convention used by access-log formatters when no
# request id is in scope (e.g. logs emitted from app startup or shutdown).
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class TraceIDMiddleware(BaseHTTPMiddleware):
    """Read or generate ``X-Request-ID`` and expose it via a ContextVar.

    - If the client sent ``X-Request-ID``, reuse it.
    - Otherwise mint a new ``uuid.uuid4().hex`` (32 chars, no dashes).
    - The id is set on a ContextVar for the duration of the request so any
      logger in the call chain can pick it up via :class:`RequestIDFilter`.
    - The same id is echoed back in the response so the caller (UI) can
      correlate downstream logs.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        rid = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers[REQUEST_ID_HEADER] = rid
        return response


class RequestIDFilter(logging.Filter):
    """Inject the current request id (or ``-``) onto every log record.

    Attached to the root API logger so JSON formatters can include
    ``request_id`` as a top-level field without every call site having to
    pass ``extra={"request_id": ...}``.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True
