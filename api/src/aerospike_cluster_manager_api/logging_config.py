"""Logging configuration for the application.

A single stdout handler with either text or JSON output (selected by
``LOG_FORMAT``), plus an optional rotating file mirror.

External log routing — PII redaction, sampling, vendor-specific exporters
(Datadog, Loki, Elasticsearch, Sentry, ...) — is the responsibility of an
OpenTelemetry Collector that receives this process's stdout (or tails the
``LOG_FILE_PATH`` rotating file via a pod-internal sidecar). Any transform
pipeline lives in the Collector configuration, so operators swap backends
from helm values alone without touching the application image.

Two modes:

1. ``LOG_FILE_PATH`` is set
   Attach a ``RotatingFileHandler`` *in addition to* stdout so a pod-
   internal sidecar (fluent-bit, vector, promtail, ...) sharing an
   ``emptyDir`` volume can tail the file and forward records to an
   external OTel Collector OTLP endpoint. Rotation policy is controlled
   by ``LOG_FILE_MAX_BYTES`` (default 50 MiB) and ``LOG_FILE_BACKUP_COUNT``
   (default 3). Failure to open the file (parent dir unwritable, etc.)
   is reported to stderr and the application falls back to stdout-only
   logging instead of failing startup.

2. Default
   A single stdout handler with the existing ``RequestIDFilter`` for
   X-Request-ID propagation and ``otelTraceID`` / ``otelSpanID`` fields
   for OTel correlation when the LoggingInstrumentor has patched the
   LogRecord factory.

See docs/logging.md for OTel Collector deployment shapes and an
example fluent-bit sidecar configuration.
"""

from __future__ import annotations

import logging
import logging.handlers
import os
import sys
from pathlib import Path

from aerospike_cluster_manager_api.middleware.trace_id import RequestIDFilter

_LOGGER_NAME = "aerospike_cluster_manager_api"

# Rotation defaults applied when LOG_FILE_PATH is set but the size / backup-
# count knobs are not. 50 MiB * 3 keeps disk usage bounded to ~200 MiB while
# leaving enough history that an emptyDir-tail sidecar that briefly stalls
# (image pull during pod restart, etc.) doesn't lose records on the next
# rotation.
_DEFAULT_LOG_FILE_MAX_BYTES = 50 * 1024 * 1024
_DEFAULT_LOG_FILE_BACKUP_COUNT = 3


def setup_logging(level: str = "INFO", log_format: str = "text") -> None:
    """Configure stdout (and optional file-mirror) logging.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
        log_format: Output format — "text" for human-readable, "json" for
            structured JSON. Pick "json" when shipping to an OTel Collector
            with a JSON parser.
    """
    formatter = _build_formatter(log_format)
    _setup_default_logging(level, formatter)
    _attach_file_mirror(os.getenv("LOG_FILE_PATH", ""), formatter)


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
    # Close before remove so any RotatingFileHandler attached on a previous
    # setup_logging() call releases its file descriptor immediately rather
    # than waiting for GC — important on Windows / under pytest where the
    # next tmp_path cleanup races against the leaked fd.
    for h in list(root.handlers):
        h.close()
        root.removeHandler(h)
    root.setLevel(log_level)
    root.addHandler(handler)
    root.propagate = False


def _attach_file_mirror(path: str, formatter: logging.Formatter) -> None:
    """Mirror logs to a rotating file when ``LOG_FILE_PATH`` is set.

    Intended for a pod-internal sidecar log shipper (fluent-bit / vector /
    promtail / ...) that tails a file on a shared ``emptyDir`` volume and
    forwards records via OTLP to an external OTel Collector. ``kubectl logs``
    scraping is the alternative but requires the sidecar (or a node-level
    DaemonSet) to know the container-runtime's per-host log path, which is
    brittle across Docker, containerd, and CRI-O.

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
        # parents=True creates missing intermediates; exist_ok=True keeps
        # this idempotent across pod restarts. mkdir on a path whose
        # parent already exists as a regular file raises NotADirectoryError
        # (OSError subclass) and is reported via the except branch below.
        # Bare filenames have parent == Path(".") which is always present,
        # so an explicit truthy guard would never short-circuit anyway.
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
