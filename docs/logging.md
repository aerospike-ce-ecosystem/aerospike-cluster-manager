# Logging

The API server uses Python's standard ``logging`` module. The default
configuration emits a single stdout handler with either text or JSON
output (selected by ``LOG_FORMAT``).

External log routing — PII redaction, sampling, field enrichment,
vendor-specific exporters (NELO, Datadog, Loki, Elasticsearch, ...) —
is delegated to an **OpenTelemetry Collector** that receives this
process's logs. The ACM image deliberately does not embed in-process
SDK handlers anymore: any pipeline you would have implemented inside
Python (`attributes/redact`, per-record sampling, fixed-field injection,
tenant-aware fan-out) is already covered by OTel Collector
processors/exporters, and centralizing it there avoids per-vendor
Python wrappers and lets operators swap backends from helm values
alone.

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
                                         Loki / Elastic /                 NELO / Datadog /
                                         Tempo / Sentry                   sentry-otel-bridge
```

The OTel Collector itself is **not** deployed by the ACKO helm chart —
the assumption is that the cluster already has one (a DaemonSet for
node-level, a Deployment for namespace-level, or one per-namespace
when isolation matters). The chart only opt-in deploys the **sidecar
that forwards to it**.

## Modes

Two modes:

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

Operators who need a different shipper (vector, promtail, vendor agent)
can override ``sidecar.image`` and ``sidecar.config.content`` — the
schema is documented in the ACKO chart's ``values.yaml``.

## Migrating from pre-0.X.0 ``LOG_HANDLERS`` / ``LOGGING_CONFIG_FILE``

Earlier ACM releases shipped two in-process extension hooks:

- ``LOG_HANDLERS=module:Class`` (or entry-point name registered under
  ``aerospike_cluster_manager.log_handlers``) — attached additional
  ``logging.Handler`` instances such as ``pynelo.AsyncNeloHandler``.
- ``LOGGING_CONFIG_FILE`` — path to a YAML/JSON ``dictConfig`` file
  given full ownership of the logging pipeline.

Both hooks were removed in this release. Each prior use case maps to an
OTel Collector primitive:

| Old pattern | OTel Collector equivalent |
|---|---|
| Vendor SDK handler (NELO, Datadog, ...) | Run the vendor exporter (or an OTLP→vendor bridge) on the cluster's Collector. ACM stays vendor-neutral. |
| Per-record PII redaction inside the handler | Pipeline with the `attributes` / `redaction` / `transform` processor. |
| Sampling inside the handler (`error 100% / info 1%`) | `probabilistic_sampler` or `tail_sampling` processor. |
| Fixed extra fields (`service`, `env`, `tenant`) | `resource` / `attributes` processor; or set OTel SDK resource attributes via env. |
| Multi-sink fan-out (stdout + vendor) | Multiple exporters on the same Collector pipeline. |
| Full ``dictConfig`` for routing/level overrides | Collector ``service.pipelines.logs`` configuration. |

If a use case truly cannot be expressed in the Collector (extremely
high-cardinality per-record context that has to be derived inside the
application process), file an issue with the specific transform you
need — we will reconsider, but the bar for re-introducing in-process
hooks is high because each one becomes a per-vendor Python dependency
that complicates the airgap and dependency-pin story.

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
