"""Logging configuration for the application."""

from __future__ import annotations

import logging
import sys


def setup_logging(level: str = "INFO", log_format: str = "text") -> None:
    """Configure structured logging for the application.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
        log_format: Output format — "text" for human-readable, "json" for structured JSON.
    """
    log_level = getattr(logging, level.upper(), logging.INFO)

    if log_format == "json":
        from pythonjsonlogger.json import JsonFormatter

        formatter = JsonFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
            rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
        )
    else:
        formatter = logging.Formatter(
            fmt="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger("aerospike_cluster_manager_api")
    root.setLevel(log_level)
    root.addHandler(handler)
    root.propagate = False
