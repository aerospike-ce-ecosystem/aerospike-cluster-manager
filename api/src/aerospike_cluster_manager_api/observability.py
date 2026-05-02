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


def _service_version() -> str:
    try:
        return version("aerospike-cluster-manager-api")
    except PackageNotFoundError:
        return "unknown"


def _otlp_exporters() -> tuple[type[Any], type[Any], type[Any]]:
    """Pick gRPC or HTTP/protobuf OTLP exporters per ``OTEL_EXPORTER_OTLP_PROTOCOL``."""
    protocol = os.getenv("OTEL_EXPORTER_OTLP_PROTOCOL", "grpc").lower()
    if protocol in ("http/protobuf", "http"):
        from opentelemetry.exporter.otlp.proto.http._log_exporter import (
            OTLPLogExporter as HttpLogExporter,
        )
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
            OTLPMetricExporter as HttpMetricExporter,
        )
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter as HttpSpanExporter,
        )

        return HttpSpanExporter, HttpMetricExporter, HttpLogExporter

    from opentelemetry.exporter.otlp.proto.grpc._log_exporter import (
        OTLPLogExporter as GrpcLogExporter,
    )
    from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import (
        OTLPMetricExporter as GrpcMetricExporter,
    )
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
        OTLPSpanExporter as GrpcSpanExporter,
    )

    return GrpcSpanExporter, GrpcMetricExporter, GrpcLogExporter


def setup_observability() -> bool:
    """Initialize OTel providers once. Idempotent.

    Returns True if observability was activated, False if disabled.
    """
    global _initialized
    if _initialized:
        return True
    if os.getenv("OTEL_SDK_DISABLED", "true").lower() in ("true", "1", "yes"):
        return False

    span_exporter_cls, metric_exporter_cls, log_exporter_cls = _otlp_exporters()

    resource = Resource.create(
        {
            "service.name": os.getenv("OTEL_SERVICE_NAME", "aerospike-cluster-manager-api"),
            "service.version": _service_version(),
            "service.instance.id": os.getenv("HOSTNAME", "unknown"),
            "deployment.environment": os.getenv("OTEL_DEPLOYMENT_ENVIRONMENT", "production"),
        }
    )

    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(BatchSpanProcessor(span_exporter_cls()))
    trace.set_tracer_provider(tracer_provider)

    meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[PeriodicExportingMetricReader(metric_exporter_cls())],
    )
    metrics.set_meter_provider(meter_provider)

    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter_cls()))
    set_logger_provider(logger_provider)

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

    _initialized = True
    logger.info("OpenTelemetry providers initialized")
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
