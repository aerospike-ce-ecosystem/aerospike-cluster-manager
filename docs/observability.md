# Observability (OpenTelemetry)

The API server emits OpenTelemetry **traces, metrics, and logs** when
``OTEL_SDK_DISABLED=false`` is set. Defaults are off — there is zero
runtime cost when the variable is at its default and OTel API calls fall
back to NoOp providers.

All exporter / sampler / resource configuration uses the **OTel SDK
standard environment variables**. The API does not introduce wrapper
variables for any of them.

## Quick start: send everything to a local collector

```bash
docker run --rm -d --name otel-collector \
  -p 4317:4317 -p 4318:4318 \
  otel/opentelemetry-collector-contrib:latest \
  --config=/etc/otelcol-contrib/otel-collector.yaml

OTEL_SDK_DISABLED=false \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
OTEL_EXPORTER_OTLP_PROTOCOL=grpc \
OTEL_SERVICE_NAME=aerospike-cluster-manager-api \
uvicorn aerospike_cluster_manager_api.main:app --host 0.0.0.0 --port 8000
```

Open the collector logs and you will see:

- HTTP server spans for every API request (``/api/v1/clusters/...`` etc.)
- ``aerospike.<op>`` spans emitted automatically by ``aerospike-py[otel]``
  for every Aerospike operation
- ``asm.events.collect`` / ``asm.events.broadcast`` spans for the SSE event loop
- ``asm.aerospike.client.connect`` / ``...close`` spans for the
  connection-pool lifecycle
- ``asm.k8s.<operation>`` spans for every K8s management endpoint
- ``asm.sample_data.generate`` / ``...batch`` spans for bulk sample-data inserts

## Configuration matrix

| Variable | Purpose | Example |
| --- | --- | --- |
| ``OTEL_SDK_DISABLED`` | Master switch. ``true`` (default) → all OTel calls are NoOps. | ``false`` |
| ``OTEL_EXPORTER_OTLP_ENDPOINT`` | Collector endpoint. | ``http://otel-collector:4317`` |
| ``OTEL_EXPORTER_OTLP_PROTOCOL`` | ``grpc`` (default) or ``http/protobuf``. | ``grpc`` |
| ``OTEL_EXPORTER_OTLP_HEADERS`` | Auth headers for the collector. | ``api-key=xxxxxxxx`` |
| ``OTEL_TRACES_SAMPLER`` | SDK standard sampler name. | ``parentbased_traceidratio`` |
| ``OTEL_TRACES_SAMPLER_ARG`` | Sampler argument (e.g. ratio). | ``1.0`` |
| ``OTEL_SERVICE_NAME`` | ``service.name`` resource attribute. | ``aerospike-cluster-manager-api`` |
| ``OTEL_DEPLOYMENT_ENVIRONMENT`` | Maps to ``deployment.environment``. | ``production`` |
| ``OTEL_RESOURCE_ATTRIBUTES`` | Comma-separated extra resource attrs. | ``team=ad-ai,region=krs1`` |

The full list of OTel SDK standard variables is at
[opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/).
The exporter selection in the API picks the right module per
``OTEL_EXPORTER_OTLP_PROTOCOL`` — ``grpc`` imports
``opentelemetry.exporter.otlp.proto.grpc`` and ``http`` /
``http/protobuf`` imports ``opentelemetry.exporter.otlp.proto.http``.

## Custom metrics emitted

In addition to whatever the auto-instrumentations emit (``http.server.*``
from ``opentelemetry-instrumentation-fastapi``, ``db.client.*`` from
``opentelemetry-instrumentation-asyncpg``, etc.), the API publishes:

| Metric | Kind | Description |
| --- | --- | --- |
| ``asm.aerospike.connections.active`` | UpDownCounter | Active aerospike-py AsyncClient instances managed by ``client_manager`` |
| ``asm.sse.subscribers.active`` | UpDownCounter | Active SSE subscribers across all event channels |
| ``asm.events.broadcast.duration_ms`` | Histogram | Time taken to fan a single event out to all SSE subscribers |
| ``asm.aerospike.op.errors`` | Counter | Aerospike op exceptions (excluding ``RecordNotFound``, which is normal control flow) |

## Helm chart wiring

The operator helm chart exposes ``ui.api.otel.*`` values that map directly
to the env vars above:

```yaml
ui:
  api:
    otel:
      enabled: true
      endpoint: http://otel-collector.observability.svc.cluster.local:4317
      protocol: grpc
      sampler: parentbased_traceidratio
      samplerArg: "1.0"
      serviceName: aerospike-cluster-manager-api
      resourceAttributes: "deployment.environment=staging,team=platform"
      headers: ""
```

When ``ui.api.otel.enabled=false`` (default), the deployment sets
``OTEL_SDK_DISABLED=true`` and OpenTelemetry is fully NoOp.

## Reading the trace shape

A typical incoming request to ``GET /api/v1/clusters/<conn>/namespaces``
produces:

```
http.server (FastAPI)
└── asm.events.collect (only if collector loop runs concurrently)
└── aerospike.info (auto, from aerospike-py[otel])
└── asm.aerospike.client.connect (first call only — pooled afterwards)
```

A ``POST /api/v1/k8s/clusters`` produces:

```
http.server
└── asm.k8s.create.kubernetes.cluster
    ├── (HTTPS PUT to apiserver, captured by kubernetes client)
    └── (no aerospike-py spans — k8s-only flow)
```

This shape is what makes the trace useful for diagnosing both
**aerospike-py behaviour** (how many retries did one op produce, what was
the cluster-tend latency at the moment of failure) and **cluster-manager
internal flow** (where in our handler chain time was spent, whether a 500
came from k8s API or from our own validation).
