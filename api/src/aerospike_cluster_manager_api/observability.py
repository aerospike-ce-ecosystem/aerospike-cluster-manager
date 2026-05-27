"""OpenTelemetry tracer/meter/logger initialization.

When ``OTEL_SDK_DISABLED=true`` (the default), :func:`setup_observability` is a
no-op — the OTel API falls back to NoOp providers and ``aerospike-py[otel]``'s
automatic spans become free-running NoOps with effectively zero cost.

When enabled, all exporter/sampler/resource configuration is sourced from
OpenTelemetry SDK standard environment variables (``OTEL_EXPORTER_OTLP_*``,
``OTEL_TRACES_SAMPLER``, ``OTEL_RESOURCE_ATTRIBUTES``, …). The only
service-level convenience this module adds on top is
``OTEL_DEPLOYMENT_ENVIRONMENT`` mapped to the ``deployment.environment``
resource attribute.

Per-signal disable is honored: setting ``OTEL_TRACES_EXPORTER=none`` /
``OTEL_METRICS_EXPORTER=none`` / ``OTEL_LOGS_EXPORTER=none`` skips construction
of the matching provider so its NoOp default survives globally, while the
remaining signals continue to export. This matters when the OTel collector only
ships a subset of pipelines (e.g. traces+logs but no metrics receiver) — the
all-or-nothing ``OTEL_SDK_DISABLED=true`` would otherwise force operators to
choose between every signal or none. Reference:
https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/#exporter-selection

The OTel SDK does NOT auto-pick the exporter implementation from
``OTEL_EXPORTER_OTLP_PROTOCOL`` — the package layout requires the caller to
import either the gRPC or the HTTP/protobuf exporter explicitly. We do that
selection here so the operator can switch protocol via env alone.
"""

from __future__ import annotations

import logging
import os
from importlib.metadata import PackageNotFoundError, version
from typing import Any

import aerospike_py
from opentelemetry import metrics, trace
from opentelemetry._logs import set_logger_provider
from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

logger = logging.getLogger(__name__)

_initialized = False
# Python OTel SDK providers, retained at module scope so shutdown_observability()
# can flush and stop them deterministically instead of relying on interpreter
# atexit ordering. None until setup_observability() runs the enabled path.
_tracer_provider: TracerProvider | None = None
_meter_provider: MeterProvider | None = None
_logger_provider: LoggerProvider | None = None


def _service_version() -> str:
    try:
        return version("aerospike-cluster-manager-api")
    except PackageNotFoundError:
        return "unknown"


# Maps OTel signal name -> (grpc_module_path, http_module_path, class_name). The
# package layout differs per signal (note the leading underscore on log
# exporters), so we keep this table central to make the selection code below
# data-driven instead of branchy.
_EXPORTER_MODULES: dict[str, tuple[str, str, str]] = {
    "traces": (
        "opentelemetry.exporter.otlp.proto.grpc.trace_exporter",
        "opentelemetry.exporter.otlp.proto.http.trace_exporter",
        "OTLPSpanExporter",
    ),
    "metrics": (
        "opentelemetry.exporter.otlp.proto.grpc.metric_exporter",
        "opentelemetry.exporter.otlp.proto.http.metric_exporter",
        "OTLPMetricExporter",
    ),
    "logs": (
        "opentelemetry.exporter.otlp.proto.grpc._log_exporter",
        "opentelemetry.exporter.otlp.proto.http._log_exporter",
        "OTLPLogExporter",
    ),
}


def _otlp_exporter_class(signal: str) -> type[Any] | None:
    """Return the OTLP exporter class for ``signal`` (traces/metrics/logs).

    Returns ``None`` when ``OTEL_<SIGNAL>_EXPORTER=none``, signalling that the
    caller must skip provider construction for that signal so its NoOp global
    default survives. ``OTEL_EXPORTER_OTLP_PROTOCOL`` selects gRPC vs HTTP.
    """
    selection = os.getenv(f"OTEL_{signal.upper()}_EXPORTER", "otlp").strip().lower()
    if selection == "none":
        return None
    if selection != "otlp":
        # Stay strict: silently accepting an unsupported value would let an
        # operator believe Jaeger / console / Prometheus export is configured
        # when in fact nothing happens. Surface the misconfig at startup.
        raise ValueError(
            f"Unsupported OTEL_{signal.upper()}_EXPORTER={selection!r}; expected 'otlp' or 'none'"
        )

    grpc_module, http_module, class_name = _EXPORTER_MODULES[signal]
    protocol = os.getenv("OTEL_EXPORTER_OTLP_PROTOCOL", "grpc").strip().lower()
    module_path = http_module if protocol in ("http/protobuf", "http") else grpc_module
    module = __import__(module_path, fromlist=[class_name])
    return getattr(module, class_name)


# ---------------------------------------------------------------------------
# aerospike-py native instrumentation
#
# aerospike-py runs an async Rust core. It is a hard dependency of ACM and
# carries its own observability surface that does NOT come for free with the
# ``[otel]`` extra:
#
#   * Logs  — the Rust core forwards log records into the stdlib ``logging``
#     tree (loggers ``aerospike_py`` / ``_aerospike`` / ``aerospike_core``),
#     but only once ``set_log_level`` opens that bridge at a chosen verbosity.
#   * Traces — the Rust core emits ``aerospike.<op>`` spans through its OWN
#     OTLP exporter, started by ``init_tracing()``. The ``[otel]`` extra only
#     wires W3C context *propagation* so those spans nest under ACM's active
#     span — it does not start span *emission*. Before this wiring ACM
#     produced FastAPI/asyncpg spans but silently dropped every
#     Aerospike-operation span, despite docs/observability.md claiming
#     otherwise.
#
# Every call below is wrapped so a failure can never break app startup or
# shutdown — observability is best-effort, exactly like the log file mirror.
# ---------------------------------------------------------------------------

# stdlib logging level name -> aerospike_py.LOG_LEVEL_* constant.
_AEROSPIKE_PY_LOG_LEVELS: dict[str, int] = {
    "OFF": aerospike_py.LOG_LEVEL_OFF,
    "NONE": aerospike_py.LOG_LEVEL_OFF,
    "CRITICAL": aerospike_py.LOG_LEVEL_ERROR,
    "FATAL": aerospike_py.LOG_LEVEL_ERROR,
    "ERROR": aerospike_py.LOG_LEVEL_ERROR,
    "WARNING": aerospike_py.LOG_LEVEL_WARN,
    "WARN": aerospike_py.LOG_LEVEL_WARN,
    "INFO": aerospike_py.LOG_LEVEL_INFO,
    "NOTSET": aerospike_py.LOG_LEVEL_INFO,
    "DEBUG": aerospike_py.LOG_LEVEL_DEBUG,
    "TRACE": aerospike_py.LOG_LEVEL_TRACE,
}


def apply_aerospike_py_log_level(level_name: str | None = None) -> None:
    """Route aerospike-py's Rust-core logs into the stdlib logging tree.

    Call once at startup, after :func:`logging_config.setup_logging`, so the
    records land in ACM's configured formatter (and, when OTel is on, the
    OTLP log pipeline). Unlike tracing, this applies regardless of
    ``OTEL_SDK_DISABLED`` — the Rust-core logs are useful on stdout alone.

    ``level_name`` defaults to ``AEROSPIKE_PY_LOG_LEVEL`` and then to
    ``LOG_LEVEL``. The Rust core is very chatty at DEBUG/TRACE, hence the
    dedicated env var: keep ACM at INFO while turning the client core up (or
    the reverse). Unknown names fall back to INFO.
    """
    name = (level_name or os.getenv("AEROSPIKE_PY_LOG_LEVEL") or os.getenv("LOG_LEVEL", "INFO")).strip().upper()
    level = _AEROSPIKE_PY_LOG_LEVELS.get(name, aerospike_py.LOG_LEVEL_INFO)
    try:
        aerospike_py.set_log_level(level)
    except Exception:  # observability must never break startup
        logger.warning("aerospike-py set_log_level(%s) failed; Rust-core logs unrouted", name, exc_info=True)
        return
    logger.info("aerospike-py log level set to %s", name)


def _init_aerospike_py_tracing() -> bool:
    """Start aerospike-py's native OTLP span exporter. Idempotent.

    Only meaningful when OTel is enabled — aerospike-py's ``init_tracing()``
    honours ``OTEL_SDK_DISABLED`` itself, so this is reached only from the
    enabled branch of :func:`setup_observability`. Set ``AEROSPIKE_PY_TRACING``
    falsy to opt out (the per-operation spans can be high-volume).

    Returns True if aerospike-py tracing was started, False if skipped/failed.
    """
    if os.getenv("AEROSPIKE_PY_TRACING", "true").strip().lower() in ("false", "0", "no", "off"):
        logger.info("aerospike-py tracing skipped (AEROSPIKE_PY_TRACING is falsy)")
        return False

    # aerospike-py's Rust exporter speaks OTLP/gRPC only. If ACM itself is
    # configured for HTTP, the endpoint must still accept gRPC (collector port
    # 4317) or aerospike.<op> spans are silently dropped on export.
    protocol = os.getenv("OTEL_EXPORTER_OTLP_PROTOCOL", "grpc").strip().lower()
    if protocol not in ("", "grpc"):
        logger.warning(
            "OTEL_EXPORTER_OTLP_PROTOCOL=%s but aerospike-py exports spans over OTLP/gRPC only; "
            "point OTEL_EXPORTER_OTLP_ENDPOINT at a gRPC-capable collector port (4317) "
            "or aerospike.<op> spans will be dropped",
            protocol,
        )

    try:
        aerospike_py.init_tracing()
    except Exception:  # observability must never break startup
        logger.warning("aerospike-py init_tracing() failed; Aerospike-operation spans disabled", exc_info=True)
        return False
    logger.info("aerospike-py OTLP span exporter started")
    return True


def shutdown_observability() -> None:
    """Flush and stop the OTel pipeline. Call last in lifespan shutdown.

    Both aerospike-py's Rust tracer and the Python OTel SDK providers buffer a
    final batch of spans/metrics/logs. The Python SDK does register an atexit
    flush, but shutting the providers down explicitly here exports that batch
    deterministically — before the process tears down — rather than relying on
    interpreter atexit ordering. Safe to call when observability was never
    enabled: every step is a guarded no-op.
    """
    try:
        dropped = aerospike_py.dropped_log_count()
        if dropped:
            logger.warning("aerospike-py dropped %d Rust-core log record(s) under GIL contention", dropped)
        aerospike_py.shutdown_tracing()
    except Exception:  # observability must never break shutdown
        logger.warning("aerospike-py shutdown_tracing() failed", exc_info=True)

    # Flush the Python SDK providers. shutdown() is idempotent in the SDK, so a
    # later atexit call is harmless.
    for name, provider in (
        ("tracer", _tracer_provider),
        ("meter", _meter_provider),
        ("logger", _logger_provider),
    ):
        if provider is None:
            continue
        try:
            provider.shutdown()
        except Exception:  # observability must never break shutdown
            logger.warning("OTel %s provider shutdown failed", name, exc_info=True)


def setup_observability() -> bool:
    """Initialize OTel providers once. Idempotent.

    Returns True if observability was activated, False if disabled.
    """
    global _initialized, _tracer_provider, _meter_provider, _logger_provider
    if _initialized:
        return True
    if os.getenv("OTEL_SDK_DISABLED", "true").lower() in ("true", "1", "yes"):
        return False

    span_exporter_cls = _otlp_exporter_class("traces")
    metric_exporter_cls = _otlp_exporter_class("metrics")
    log_exporter_cls = _otlp_exporter_class("logs")

    resource = Resource.create(
        {
            "service.name": os.getenv("OTEL_SERVICE_NAME", "aerospike-cluster-manager-api"),
            "service.version": _service_version(),
            "service.instance.id": os.getenv("HOSTNAME", "unknown"),
            "deployment.environment": os.getenv("OTEL_DEPLOYMENT_ENVIRONMENT", "production"),
        }
    )

    if span_exporter_cls is not None:
        tracer_provider = TracerProvider(resource=resource)
        tracer_provider.add_span_processor(BatchSpanProcessor(span_exporter_cls()))
        trace.set_tracer_provider(tracer_provider)
        _tracer_provider = tracer_provider

    if metric_exporter_cls is not None:
        meter_provider = MeterProvider(
            resource=resource,
            metric_readers=[PeriodicExportingMetricReader(metric_exporter_cls())],
        )
        metrics.set_meter_provider(meter_provider)
        _meter_provider = meter_provider

    if log_exporter_cls is not None:
        logger_provider = LoggerProvider(resource=resource)
        logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter_cls()))
        set_logger_provider(logger_provider)
        _logger_provider = logger_provider

    # set_logging_format=False so we don't override the formatter that
    # logging_config.setup_logging configures. We only need the LogRecord
    # attribute injection (otelTraceID/otelSpanID).
    LoggingInstrumentor().instrument(set_logging_format=False)
    AsyncPGInstrumentor().instrument()
    # FastAPIInstrumentor must be invoked before the FastAPI app is constructed
    # in main.py — setup_observability() runs at module import time, before
    # `app = FastAPI(...)`, so the global instrument() form patches every app
    # created afterwards. Without this, no HTTP request spans are produced and
    # asyncpg child spans float without an HTTP parent (see #264).
    FastAPIInstrumentor().instrument()

    # Start aerospike-py's own OTLP span exporter so Aerospike-operation spans
    # are actually emitted (the [otel] extra only wires context propagation).
    # Skip when traces are disabled — there is no global TracerProvider for the
    # Rust core's spans to nest under, and the gRPC exporter would just churn.
    if span_exporter_cls is not None:
        _init_aerospike_py_tracing()

    _initialized = True
    logger.info(
        "OpenTelemetry providers initialized (traces=%s metrics=%s logs=%s)",
        "on" if span_exporter_cls else "off",
        "on" if metric_exporter_cls else "off",
        "on" if log_exporter_cls else "off",
    )
    return True


# ---------------------------------------------------------------------------
# Custom metric instruments — registered lazily so they bind to whichever
# meter provider is active when the first call to get_meter() is made (NoOp
# when OTel is disabled, real provider when enabled).
# ---------------------------------------------------------------------------


def _meter() -> metrics.Meter:
    return metrics.get_meter("aerospike_cluster_manager_api")


def make_instruments() -> dict[str, Any]:
    """Create the four custom instruments described in the spec.

    Lazy, so callers can initialize them after :func:`setup_observability` has
    selected a provider. Safe to call when OTel is disabled — the NoOp meter
    returns NoOp instruments.
    """
    m = _meter()
    return {
        "active_aerospike_connections": m.create_up_down_counter(
            name="asm.aerospike.connections.active",
            description="Active aerospike-py AsyncClient instances managed by client_manager",
            unit="{connection}",
        ),
        "active_sse_subscribers": m.create_up_down_counter(
            name="asm.sse.subscribers.active",
            description="Active SSE subscribers across all event channels",
            unit="{subscriber}",
        ),
        "event_broadcast_duration_ms": m.create_histogram(
            name="asm.events.broadcast.duration_ms",
            description="Time to fan out a single event to all SSE subscribers",
            unit="ms",
        ),
        "aerospike_op_errors": m.create_counter(
            name="asm.aerospike.op.errors",
            description="Aerospike op exceptions (excluding RecordNotFound which is a normal control-flow signal)",
            unit="{error}",
        ),
    }
