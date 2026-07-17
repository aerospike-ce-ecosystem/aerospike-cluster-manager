# Logging

The API uses Python's standard ``logging`` module. By default, one stdout
handler writes text or JSON, as selected by ``LOG_FORMAT``.

An **OpenTelemetry Collector** handles external routing, PII redaction,
sampling, field enrichment, and vendor exporters such as Datadog, Loki,
Elasticsearch, and Sentry. Keep transformation pipelines in the Collector
configuration. Operators can then change backends through Helm values without
rebuilding the application image.

## Architecture

```
+----------------+         +------------------+         +-----------------+
| ACM api        | stdout  | pod-internal     |  OTLP   | OTel Collector  |
| (stdout +      | + file  | sidecar          | -----> | (cluster /      |
| LOG_FILE_PATH) | ------> | (fluent-bit /    |         | namespace,      |
|                |         | vector / ...)    |         | NOT inside this |
+----------------+         +------------------+         | helm chart)     |
                                                        +-----------------+
                                                                 |
                                                +----------------+----------------+
                                                v                                 v
                                         Loki / Elastic /                  Datadog / Splunk /
                                         Tempo / Sentry                    your-vendor-bridge
```

The ACKO Helm chart does **not** deploy the OTel Collector. It assumes the
cluster already has a node-level DaemonSet, a namespace-level Deployment, or
one Collector per namespace when isolation matters. The chart can optionally
deploy the **sidecar that forwards logs to the Collector**.

## Modes

Choose one of two modes:

1. **Default — stdout only**
   A single ``StreamHandler(sys.stdout)`` with the existing
   ``RequestIDFilter`` and OpenTelemetry trace/span ID injection. Pick
   this when a node-level OTel Collector DaemonSet scrapes container
   logs (e.g. via the Collector's ``filelog`` receiver against
   ``/var/log/containers/*.log``).

2. **Stdout + rotating file mirror — ``LOG_FILE_PATH``**
   Attach a ``RotatingFileHandler`` so a pod-internal sidecar sharing
   an ``emptyDir`` volume can tail the file and forward records via
   OTLP. Rotation is size-based: ``LOG_FILE_MAX_BYTES`` (default 50
   MiB) and ``LOG_FILE_BACKUP_COUNT`` (default 3). Failure to open the
   file (parent dir unwritable, etc.) is reported to stderr and the
   application falls back to stdout-only logging instead of failing
   startup.

When ``LOG_FORMAT=json``, both stdout and the rotating file emit JSON
records with the same schema. OTel Collector's ``filelog`` receiver
parses them via the ``json_parser`` operator.

## Example — fluent-bit OTLP forwarder sidecar (helm)

The ACKO chart's default values for the logging sidecar do exactly this
pattern. The relevant knobs:

```yaml
ui:
  env:
    logFormat: "json"           # recommended for downstream parsing
  api:
    logging:
      fileMirror:
        enabled: true           # writes /var/log/acm/api.log on a shared emptyDir
      sidecar:
        enabled: true           # fluent-bit container, mounts the same emptyDir read-only
        otlp:
          endpoint: "otel-collector.observability.svc.cluster.local:4317"
          # headers: "x-tenant=acm,authorization=Bearer ..."
```

The chart pre-bakes a fluent-bit config that:

- tails ``LOG_FILE_PATH`` with the ``tail`` input + ``json_parser``
- forwards records to ``otlp.endpoint`` via the ``opentelemetry`` output
- propagates ``otlp.headers`` as OTLP HTTP/gRPC metadata

To use another shipper, such as vector, promtail, or a vendor agent, override
``sidecar.image`` and ``sidecar.config.content``. The ACKO chart's
``values.yaml`` documents the schema.

## OpenTelemetry trace correlation

When OpenTelemetry is enabled (see ``observability.md``), the
``opentelemetry-instrumentation-logging`` library injects
``otelTraceID`` and ``otelSpanID`` attributes onto every ``LogRecord``.
The default JSON formatter renames these to ``trace_id`` / ``span_id``
in the output. Downstream Collector pipelines forward them as OTel log
attributes so logs are linkable to spans in the same backend without
any extra configuration.

## Constraints to be aware of

- ``LOG_FILE_PATH`` rotation uses Python's stdlib
  ``RotatingFileHandler`` — size-based, not time-based. Tune via
  ``LOG_FILE_MAX_BYTES`` / ``LOG_FILE_BACKUP_COUNT``. For
  time-based rotation, point the sidecar at the Collector and let
  the Collector's batch/queue settings govern flush cadence instead.
- The file path must live on a volume the sidecar also mounts. The
  ACKO chart wires this via a shared ``emptyDir`` automatically when
  ``ui.api.logging.fileMirror.enabled=true`` and
  ``ui.api.logging.sidecar.enabled=true``.
- Sidecar without ``fileMirror`` is rejected at ``helm install`` time
  — the sidecar would otherwise have nothing to tail. Either enable
  both, or skip the sidecar and rely on a node-level DaemonSet OTel
  Collector scraping ``/var/log/containers/*.log``.
