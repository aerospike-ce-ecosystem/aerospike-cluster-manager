# Logging

The API server uses Python's standard ``logging`` module. The default
configuration emits a single stdout handler with either text or JSON
output (selected by ``LOG_FORMAT``).

When that is not enough, two extension points are provided so you can
forward logs to NELO, Datadog, Loki, Sentry, or any other system without
forking the image.

## Modes

There are three configuration modes, selected by environment variables:

1. **Default** — neither ``LOGGING_CONFIG_FILE`` nor ``LOG_HANDLERS`` is
   set. A single stdout handler (text or JSON) with the existing
   ``RequestIDFilter`` and OpenTelemetry trace/span ID injection.

2. **LOG_HANDLERS** — comma-separated list of handler specs.  Each spec
   is either a ``module.path:ClassName`` (importlib import) or an
   entry-point name registered under the
   ``aerospike_cluster_manager.log_handlers`` group. Each handler is
   constructed with **no arguments** and is expected to read its own
   configuration from environment variables. The default stdout handler
   stays attached; ``LOG_HANDLERS`` adds to it.

3. **LOGGING_CONFIG_FILE** — path to a YAML/JSON dictConfig file.
   The file is loaded as-is via ``logging.config.dictConfig`` and given
   full control over every formatter, handler, filter, and logger.
   ``LOG_HANDLERS`` and ``LOG_LEVEL`` / ``LOG_FORMAT`` are ignored in
   this mode.

## Example A — NELO via LOG_HANDLERS

[``pynelo``](https://github.com/naver/pynelo) is a logging.Handler that
configures itself from ``NELO_HOST`` / ``NELO_PORT`` /
``NELO_PROJECT_NAME`` / ``NELO_PROJECT_TOKEN`` environment variables, so
no Python wrapping is needed.

helm values:

```yaml
ui:
  api:
    extraPipPackages:
      - "pynelo>=1.0.0"
    logging:
      handlers: "pynelo:AsyncNeloHandler"
    extraEnv:
      - name: NELO_HOST
        value: nelo-collector.svc.cluster.local
      - name: NELO_PORT
        value: "10006"
      - name: NELO_PROJECT_NAME
        value: ad-ai-aerospike
    extraEnvFrom:
      - secretRef:
          name: nelo-token
```

Verify by looking for the attach line in pod logs:

```
kubectl logs -n <ns> deploy/<release>-aerospike-ce-kubernetes-operator-ui-api -c api \
  | grep "attached log handler"
# attached log handler: pynelo:AsyncNeloHandler
```

## Example B — Datadog via dictConfig

Building a custom image once is more reliable than ``extraPipPackages``
when you need to install non-Python build dependencies or run in an
airgap cluster.

``Dockerfile``:

```dockerfile
FROM ghcr.io/aerospike-ce-ecosystem/aerospike-cluster-manager-api:latest
RUN pip install ddtrace
```

helm values:

```yaml
ui:
  api:
    image:
      repository: my-registry.example.com/asm-api-with-datadog
      tag: latest
    logging:
      dictConfig:
        version: 1
        disable_existing_loggers: false
        formatters:
          json:
            "()": pythonjsonlogger.json.JsonFormatter
            fmt: "%(asctime)s %(levelname)s %(name)s %(message)s %(otelTraceID)s %(otelSpanID)s"
        handlers:
          console:
            class: logging.StreamHandler
            formatter: json
        loggers:
          aerospike_cluster_manager_api:
            level: INFO
            handlers: [console]
            propagate: false
```

The chart writes the dictConfig payload into a ConfigMap, mounts it at
``/etc/asm/logging.yaml``, and sets ``LOGGING_CONFIG_FILE`` to that
path.  Pod restart applies the new config.

## Registering an entry-point alias (third-party packages)

A package that wants to be addressable by a short name in
``LOG_HANDLERS`` can declare:

```toml
# pyproject.toml of the third-party package
[project.entry-points."aerospike_cluster_manager.log_handlers"]
nelo = "pynelo:AsyncNeloHandler"
```

Then ``LOG_HANDLERS=nelo`` works identically to
``LOG_HANDLERS=pynelo:AsyncNeloHandler``.

## OpenTelemetry trace correlation

When OpenTelemetry is enabled (see ``observability.md``), the
``opentelemetry-instrumentation-logging`` library injects
``otelTraceID`` and ``otelSpanID`` attributes onto every ``LogRecord``.
The default JSON formatter renames these to ``trace_id`` /``span_id`` in
the output, and any third-party handler that serializes
``LogRecord.__dict__`` (like ``pynelo``) will forward them automatically.
No additional configuration required.

## Constraints to be aware of

- Each plugin handler is constructed with **no arguments** (``cls()``).
  Wrap your handler in a no-arg adaptor if its constructor needs
  positional arguments.
- A failure to load one handler is logged at ``ERROR`` level on
  ``aerospike_cluster_manager_api.logging_config`` and skipped.  Other
  handlers in the list keep loading.  Missing module / missing
  entry-point / constructor exception all behave the same way.
- ``LOGGING_CONFIG_FILE`` failure (file missing, top-level not a
  mapping) raises and aborts startup. Falling back to defaults silently
  would make the misconfiguration impossible to debug.
- ``extraPipPackages`` in the helm chart runs ``pip install --target``
  in an init container. This requires PyPI egress from the cluster.
  In airgap environments, build a custom image instead (see Example B).
