"""Logging configuration for the application.

Three layered modes:

1. ``LOGGING_CONFIG_FILE`` is set
   The file is loaded as YAML/JSON and applied verbatim via
   :func:`logging.config.dictConfig`. The user owns every formatter, handler,
   filter, and logger. ``LOG_LEVEL`` / ``LOG_FORMAT`` / ``LOG_HANDLERS`` /
   ``LOG_FILE_PATH`` are ignored. Use this when you need full programmatic
   control (third-party handlers with non-trivial constructors, complex
   routing, etc.).

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

In modes 2 and 3, setting ``LOG_FILE_PATH`` additionally attaches a rotating
file handler so a logging sidecar (fluent-bit, vector, promtail, ...) sharing
an ``emptyDir`` volume can tail logs without scraping ``kubectl logs``. The
rotation policy is controlled by ``LOG_FILE_MAX_BYTES`` (default 50 MiB) and
``LOG_FILE_BACKUP_COUNT`` (default 3). Failure to open the file (parent dir
unwritable, etc.) is reported to stderr and the application falls back to
stdout-only logging instead of failing startup.
"""

from __future__ import annotations

import importlib
import logging
import logging.config
import logging.handlers
import os
import sys
from importlib.metadata import entry_points
from pathlib import Path
from typing import Any

import yaml

from aerospike_cluster_manager_api.middleware.trace_id import RequestIDFilter

ENTRY_POINT_GROUP = "aerospike_cluster_manager.log_handlers"
_LOGGER_NAME = "aerospike_cluster_manager_api"

# Rotation defaults applied when LOG_FILE_PATH is set but the size / backup-
# count knobs are not. 50 MiB * 3 keeps disk usage bounded to ~200 MiB while
# leaving enough history that an emptyDir-tail sidecar that briefly stalls
# (image pull during pod restart, etc.) doesn't lose records on the next
# rotation.
_DEFAULT_LOG_FILE_MAX_BYTES = 50 * 1024 * 1024
_DEFAULT_LOG_FILE_BACKUP_COUNT = 3


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

    formatter = _build_formatter(log_format)
    _setup_default_logging(level, formatter)
    _attach_file_mirror(os.getenv("LOG_FILE_PATH", ""), formatter)
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


def _build_formatter(log_format: str) -> logging.Formatter:
    if log_format == "json":
        from pythonjsonlogger.json import JsonFormatter

        # otelTraceID / otelSpanID are injected on every LogRecord by
        # LoggingInstrumentor (see observability.setup_observability). When OTel
        # is disabled, they are absent from the record — the `defaults` arg
        # keeps the JSON output stable instead of raising KeyError.
        return JsonFormatter(
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
    return logging.Formatter(
        fmt="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def _setup_default_logging(level: str, formatter: logging.Formatter) -> None:
    log_level = getattr(logging, level.upper(), logging.INFO)

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


def _attach_file_mirror(path: str, formatter: logging.Formatter) -> None:
    """Mirror logs to a rotating file when ``LOG_FILE_PATH`` is set.

    Intended for sidecar log shippers that tail a file on a shared ``emptyDir``
    volume — kubectl-logs scraping is the alternative but it forces operators
    to also configure container-runtime log paths, which is brittle across
    Docker, containerd, and CRI-O. The file handler reuses the same formatter
    as stdout so the on-disk format matches what ``kubectl logs`` shows.

    Failures are non-fatal: an unwritable directory or insufficient
    permissions emit a warning to stderr (logging is not yet usable for its
    own errors at this point) and the application keeps stdout-only logging
    so the pod still starts.
    """
    path = path.strip()
    if not path:
        return
    try:
        target = Path(path)
        if target.parent:
            # parents=True creates missing intermediates; exist_ok=True keeps
            # this idempotent across pod restarts. mkdir on a path whose
            # parent already exists as a regular file raises NotADirectoryError
            # (OSError subclass) and is reported via the except branch below.
            target.parent.mkdir(parents=True, exist_ok=True)
        max_bytes = _get_int_env("LOG_FILE_MAX_BYTES", _DEFAULT_LOG_FILE_MAX_BYTES)
        backup_count = _get_int_env("LOG_FILE_BACKUP_COUNT", _DEFAULT_LOG_FILE_BACKUP_COUNT)
        # delay=False forces the file to be opened during setup so a bad
        # path/permission surfaces immediately as an OSError that we can log
        # and recover from, rather than failing later at the first log emit.
        handler = logging.handlers.RotatingFileHandler(
            filename=str(target),
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
            delay=False,
        )
    except OSError as e:
        # Don't crash the pod just because the operator typo'd LOG_FILE_PATH.
        # logging isn't fully wired for our own diagnostics yet, so write the
        # warning straight to stderr — kubectl logs will still surface it.
        print(
            f"WARNING: LOG_FILE_PATH={path!r} could not be opened ({e}); continuing with stdout-only logging",
            file=sys.stderr,
        )
        return
    handler.setFormatter(formatter)
    handler.addFilter(RequestIDFilter())
    logging.getLogger(_LOGGER_NAME).addHandler(handler)


def _get_int_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        print(
            f"WARNING: {name}={raw!r} is not an integer; falling back to default {default}",
            file=sys.stderr,
        )
        return default
    if value <= 0:
        print(
            f"WARNING: {name}={value} must be positive; falling back to default {default}",
            file=sys.stderr,
        )
        return default
    return value


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
