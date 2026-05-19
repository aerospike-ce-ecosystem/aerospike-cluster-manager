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
   ``LOG_HANDLERS``, ``LOG_LEVEL``, ``LOG_FORMAT``, and ``LOG_FILE_PATH``
   are ignored in this mode.

Across modes 1 and 2, setting ``LOG_FILE_PATH`` additionally attaches a
``RotatingFileHandler`` that mirrors records to a file. This is the
recommended pairing with a logging sidecar (fluent-bit, vector, promtail)
that tails a shared ``emptyDir`` volume — see Example C below.

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

## Example C — Sidecar log shipper via ``LOG_FILE_PATH``

When the operator wants to forward logs through a generic agent
(fluent-bit, vector, promtail) instead of an in-process SDK, the sidecar
needs a stable file to tail. The ACM API writes records to
``LOG_FILE_PATH`` in addition to stdout — the sidecar mounts the same
``emptyDir`` volume and runs ``tail -F`` (or its equivalent).

helm values:

```yaml
ui:
  api:
    logging:
      # Both knobs are wired up by the ACKO helm chart — see ACKO's
      # values.yaml for the chart-side defaults. Setting fileMirror
      # also auto-mounts the shared emptyDir at /var/log/acm.
      fileMirror:
        enabled: true
        path: /var/log/acm/api.log
        maxBytes: 52428800   # 50 MiB
        backupCount: 3
      sidecar:
        enabled: true
        image: cr.fluentbit.io/fluent/fluent-bit:3.2
        # configFile is rendered into a ConfigMap and mounted at
        # /fluent-bit/etc/fluent-bit.conf inside the sidecar.
        configFile: |
          [SERVICE]
              Flush 1
          [INPUT]
              Name tail
              Path /var/log/acm/*.log
              Refresh_Interval 5
          [OUTPUT]
              Name stdout
              Match *
```

Equivalent raw env (bare ACM image, no helm):

```bash
LOG_FILE_PATH=/var/log/acm/api.log
LOG_FILE_MAX_BYTES=52428800
LOG_FILE_BACKUP_COUNT=3
LOG_FORMAT=json   # recommended so the sidecar can parse fields directly
```

Why a file and not ``kubectl logs``? Container-runtime log paths
(``/var/log/containers/...``) differ across Docker, containerd, and
CRI-O, and the sidecar would need elevated privileges to read them.
A shared ``emptyDir`` works the same way on every runtime and stays
inside the pod's security boundary.

If ``LOG_FILE_PATH`` is unwritable (parent directory missing
permissions, etc.) the API logs a single warning to stderr and falls
back to stdout-only — the pod still starts so the operator can
investigate via ``kubectl logs``.

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
- ``LOG_FILE_PATH`` rotation uses Python's stdlib
  ``RotatingFileHandler`` — size-based, not time-based. Default 50 MiB
  per file, 3 backups. Tune via ``LOG_FILE_MAX_BYTES`` /
  ``LOG_FILE_BACKUP_COUNT`` or supply a full ``LOGGING_CONFIG_FILE`` if
  you need a different rotation policy (e.g. ``TimedRotatingFileHandler``).
