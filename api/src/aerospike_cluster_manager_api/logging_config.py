"""Logging configuration for the application."""

from __future__ import annotations

import logging
import sys

from aerospike_cluster_manager_api.middleware.trace_id import RequestIDFilter


def setup_logging(level: str = "INFO", log_format: str = "text") -> None:
    """Configure structured logging for the application.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
        log_format: Output format — "text" for human-readable, "json" for structured JSON.
    """
    log_level = getattr(logging, level.upper(), logging.INFO)

    if log_format == "json":
        from pythonjsonlogger.json import JsonFormatter

        # %(request_id)s is populated by RequestIDFilter (attached below) so each
        # JSON record carries the current X-Request-ID for log correlation.
        # `defaults` ensures missing request_id never raises if a handler is
        # attached without the filter (defense-in-depth for python-json-logger >= 2.0).
        formatter = JsonFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(request_id)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
            rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
            defaults={"request_id": "-"},
        )
    else:
        formatter = logging.Formatter(
            fmt="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    # Attach to the handler so the filter runs for every record this handler
    # processes, regardless of which logger emitted it.
    handler.addFilter(RequestIDFilter())

    root = logging.getLogger("aerospike_cluster_manager_api")
    # Clear existing handlers before attaching a new one. Repeated calls
    # (test fixtures, uvicorn --reload) would otherwise accumulate handlers
    # with mismatched filter coverage and produce duplicate log lines.
    for h in list(root.handlers):
        root.removeHandler(h)
    root.setLevel(log_level)
    root.addHandler(handler)
    root.propagate = False
