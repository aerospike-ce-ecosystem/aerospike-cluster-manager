"""Logging configuration for the application.

Three layered modes:

1. ``LOGGING_CONFIG_FILE`` is set
   The file is loaded as YAML/JSON and applied verbatim via
   :func:`logging.config.dictConfig`. The user owns every formatter, handler,
   filter, and logger. ``LOG_LEVEL`` / ``LOG_FORMAT`` / ``LOG_HANDLERS`` are
   ignored. Use this when you need full programmatic control (third-party
   handlers with non-trivial constructors, complex routing, etc.).

2. ``LOG_HANDLERS`` is set (and ``LOGGING_CONFIG_FILE`` is not)
   The default stdout handler is configured first, then each spec in
   ``LOG_HANDLERS`` is resolved and attached. A spec is either
   ``module.path:ClassName`` or an entry-point name registered under
   ``aerospike_cluster_manager.log_handlers``. Each handler is constructed
   with no arguments and is expected to read its own configuration from the
   environment (e.g. ``pynelo``'s ``NELO_HOST`` / ``NELO_PROJECT_TOKEN``).
   A failure to load one handler is logged and skipped — it does not abort
   startup or remove other handlers.

3. Neither is set
   Default behaviour preserved: a single stdout handler with a text or JSON
   formatter (selected by ``LOG_FORMAT``), the existing ``RequestIDFilter``
   for X-Request-ID propagation, and ``otelTraceID`` / ``otelSpanID`` fields
   for OTel correlation when the logging instrumentor has patched the
   LogRecord factory.
"""

from __future__ import annotations

import importlib
import logging
import logging.config
import os
import sys
from importlib.metadata import entry_points
from pathlib import Path
from typing import Any

import yaml

from aerospike_cluster_manager_api.middleware.trace_id import RequestIDFilter

ENTRY_POINT_GROUP = "aerospike_cluster_manager.log_handlers"
_LOGGER_NAME = "aerospike_cluster_manager_api"


def setup_logging(level: str = "INFO", log_format: str = "text") -> None:
    """Configure structured logging for the application.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
        log_format: Output format — "text" for human-readable, "json" for structured JSON.
    """
    config_file = os.getenv("LOGGING_CONFIG_FILE", "").strip()
    if config_file:
        _apply_dictconfig_file(config_file)
        return

    _setup_default_logging(level, log_format)
    _attach_extra_handlers(os.getenv("LOG_HANDLERS", ""))


# ---------------------------------------------------------------------------
# Mode 1: external dictConfig file
# ---------------------------------------------------------------------------


def _apply_dictconfig_file(path: str) -> None:
    p = Path(path)
    if not p.exists():
        # fail-fast: silently falling back to defaults would make the
        # misconfiguration nearly impossible to debug ("why are my logs not
        # going to NELO?"). Crashing on startup forces the operator to fix
        # the path or unset the env var.
        raise FileNotFoundError(f"LOGGING_CONFIG_FILE not found: {path}")
    with p.open() as f:
        cfg: Any = yaml.safe_load(f)
    if not isinstance(cfg, dict):
        raise ValueError(
            f"LOGGING_CONFIG_FILE must contain a dictConfig mapping at the top level, got {type(cfg).__name__}"
        )
    logging.config.dictConfig(cfg)


# ---------------------------------------------------------------------------
# Mode 2 + 3: default stdout handler + optional plugin handlers
# ---------------------------------------------------------------------------


def _setup_default_logging(level: str, log_format: str) -> None:
    log_level = getattr(logging, level.upper(), logging.INFO)

    if log_format == "json":
        from pythonjsonlogger.json import JsonFormatter

        # otelTraceID / otelSpanID are injected on every LogRecord by
        # LoggingInstrumentor (see observability.setup_observability). When OTel
        # is disabled, they are absent from the record — the `defaults` arg
        # keeps the JSON output stable instead of raising KeyError.
        formatter: logging.Formatter = JsonFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(request_id)s %(otelTraceID)s %(otelSpanID)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
            rename_fields={
                "asctime": "timestamp",
                "levelname": "level",
                "name": "logger",
                "otelTraceID": "trace_id",
                "otelSpanID": "span_id",
            },
            defaults={"request_id": "-", "otelTraceID": "0", "otelSpanID": "0"},
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

    root = logging.getLogger(_LOGGER_NAME)
    # Clear existing handlers before attaching a new one. Repeated calls
    # (test fixtures, uvicorn --reload) would otherwise accumulate handlers
    # with mismatched filter coverage and produce duplicate log lines.
    for h in list(root.handlers):
        root.removeHandler(h)
    root.setLevel(log_level)
    root.addHandler(handler)
    root.propagate = False


def _attach_extra_handlers(spec: str) -> None:
    spec = spec.strip()
    if not spec:
        return
    root = logging.getLogger(_LOGGER_NAME)
    self_logger = logging.getLogger(__name__)
    discovered = _load_entry_points()
    for raw in (s.strip() for s in spec.split(",") if s.strip()):
        try:
            handler_cls = _resolve_handler(raw, discovered)
            instance = handler_cls()
        except Exception as e:
            # Per-handler isolation: one failed plugin must not silently disable
            # the rest or abort startup. Visible at INFO logs since attached
            # handlers are also reported there.
            self_logger.error("failed to attach log handler %r: %s", raw, e)
            continue
        # The default stdout handler attaches RequestIDFilter to itself; we
        # also attach it to plugin handlers so they get a populated
        # `request_id` field without each one having to opt in.
        instance.addFilter(RequestIDFilter())
        root.addHandler(instance)
        self_logger.info("attached log handler: %s", raw)


def _load_entry_points() -> dict[str, type[logging.Handler]]:
    out: dict[str, type[logging.Handler]] = {}
    try:
        eps = entry_points(group=ENTRY_POINT_GROUP)
    except Exception:
        return out
    for ep in eps:
        try:
            out[ep.name] = ep.load()
        except Exception as e:
            logging.getLogger(__name__).error("entry-point %s load failed: %s", ep.name, e)
    return out


def _resolve_handler(spec: str, ep_cache: dict[str, type[logging.Handler]]) -> type[logging.Handler]:
    if ":" in spec:
        mod_name, _, cls_name = spec.partition(":")
        if not mod_name or not cls_name:
            raise ValueError(f"invalid 'module:Class' spec: {spec!r}")
        mod = importlib.import_module(mod_name)
        return getattr(mod, cls_name)
    if spec in ep_cache:
        return ep_cache[spec]
    raise ValueError(
        f"unknown handler {spec!r}: not a 'module:Class' spec and not in entry-points group {ENTRY_POINT_GROUP!r}"
    )
