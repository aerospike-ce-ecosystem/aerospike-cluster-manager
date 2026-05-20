"""Tests for observability.setup_observability and exporter selection."""

from __future__ import annotations

import importlib
from unittest.mock import patch

import pytest

import aerospike_cluster_manager_api.observability as obs


@pytest.fixture(autouse=True)
def reset_initialized_flag():
    """Tests must not bleed initialization state into each other."""
    obs._initialized = False
    obs._tracer_provider = None
    obs._meter_provider = None
    obs._logger_provider = None
    yield
    obs._initialized = False
    obs._tracer_provider = None
    obs._meter_provider = None
    obs._logger_provider = None


def test_setup_observability_disabled_returns_false(monkeypatch):
    monkeypatch.setenv("OTEL_SDK_DISABLED", "true")
    assert obs.setup_observability() is False


def test_setup_observability_default_is_disabled(monkeypatch):
    """When OTEL_SDK_DISABLED is unset, the default is disabled."""
    monkeypatch.delenv("OTEL_SDK_DISABLED", raising=False)
    assert obs.setup_observability() is False


def test_setup_observability_idempotent(monkeypatch):
    """Calling setup twice must not double-register processors."""
    monkeypatch.setenv("OTEL_SDK_DISABLED", "false")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_PROTOCOL", "grpc")

    # First call: returns True and sets the initialized flag
    assert obs.setup_observability() is True
    # Second call: still True (already initialized) — but does NOT re-add
    # processors. We verify by patching TracerProvider and asserting it
    # is constructed at most once.
    with patch("aerospike_cluster_manager_api.observability.TracerProvider") as mock_tp:
        assert obs.setup_observability() is True
        mock_tp.assert_not_called()


@pytest.mark.parametrize(
    ("protocol", "expected_module"),
    [
        ("grpc", "opentelemetry.exporter.otlp.proto.grpc.trace_exporter"),
        ("http", "opentelemetry.exporter.otlp.proto.http.trace_exporter"),
        ("http/protobuf", "opentelemetry.exporter.otlp.proto.http.trace_exporter"),
    ],
)
def test_otlp_exporter_selection(monkeypatch, protocol, expected_module):
    """OTEL_EXPORTER_OTLP_PROTOCOL determines which exporter module is imported."""
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_PROTOCOL", protocol)
    span_cls, _, _ = obs._otlp_exporters()
    assert span_cls.__module__ == expected_module


def test_otlp_exporter_default_grpc(monkeypatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_PROTOCOL", raising=False)
    span_cls, _, _ = obs._otlp_exporters()
    assert "grpc" in span_cls.__module__


def test_make_instruments_returns_four_keys():
    """Even when OTel is disabled, NoOp instruments must be returned with the documented keys."""
    inst = obs.make_instruments()
    assert set(inst.keys()) == {
        "active_aerospike_connections",
        "active_sse_subscribers",
        "event_broadcast_duration_ms",
        "aerospike_op_errors",
    }


def test_make_instruments_noop_when_disabled():
    """The disabled-default path returns NoOp instruments that are safely callable."""
    inst = obs.make_instruments()
    # Calling each instrument should not raise even with no provider configured
    inst["active_aerospike_connections"].add(1)
    inst["active_aerospike_connections"].add(-1)
    inst["active_sse_subscribers"].add(1)
    inst["event_broadcast_duration_ms"].record(1.5)
    inst["aerospike_op_errors"].add(1)


def test_service_version_falls_back_to_unknown(monkeypatch):
    """Unknown package metadata must surface as 'unknown', not crash."""
    # Swap in a fake distribution that raises PackageNotFoundError so we don't
    # depend on the real installed version.
    from importlib.metadata import PackageNotFoundError

    def _fake_version(_name: str) -> str:
        raise PackageNotFoundError(_name)

    monkeypatch.setattr(obs, "version", _fake_version)
    assert obs._service_version() == "unknown"


def test_module_reload_resets_state():
    """Re-importing the module produces a fresh _initialized flag."""
    importlib.reload(obs)
    assert obs._initialized is False


# ---------------------------------------------------------------------------
# aerospike-py native instrumentation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "level_name",
    ["DEBUG", "INFO", "WARNING", "WARN", "ERROR", "CRITICAL", "TRACE", "OFF"],
)
def test_apply_aerospike_py_log_level_maps_names(level_name):
    """Each stdlib level name maps to the matching aerospike_py LOG_LEVEL_* constant."""
    with patch.object(obs, "aerospike_py") as mock_ap:
        obs.apply_aerospike_py_log_level(level_name)
    mock_ap.set_log_level.assert_called_once_with(obs._AEROSPIKE_PY_LOG_LEVELS[level_name])


def test_apply_aerospike_py_log_level_unknown_falls_back_to_info(monkeypatch):
    """An unrecognised level name must not crash — it falls back to INFO."""
    monkeypatch.delenv("AEROSPIKE_PY_LOG_LEVEL", raising=False)
    with patch.object(obs, "aerospike_py") as mock_ap:
        obs.apply_aerospike_py_log_level("BOGUS")
    mock_ap.set_log_level.assert_called_once_with(mock_ap.LOG_LEVEL_INFO)


def test_apply_aerospike_py_log_level_reads_env_default(monkeypatch):
    """With no explicit arg, AEROSPIKE_PY_LOG_LEVEL drives the level."""
    monkeypatch.setenv("AEROSPIKE_PY_LOG_LEVEL", "DEBUG")
    with patch.object(obs, "aerospike_py") as mock_ap:
        obs.apply_aerospike_py_log_level()
    mock_ap.set_log_level.assert_called_once_with(obs._AEROSPIKE_PY_LOG_LEVELS["DEBUG"])


def test_apply_aerospike_py_log_level_falls_back_to_log_level(monkeypatch):
    """When AEROSPIKE_PY_LOG_LEVEL is unset, LOG_LEVEL is used."""
    monkeypatch.delenv("AEROSPIKE_PY_LOG_LEVEL", raising=False)
    monkeypatch.setenv("LOG_LEVEL", "WARNING")
    with patch.object(obs, "aerospike_py") as mock_ap:
        obs.apply_aerospike_py_log_level()
    mock_ap.set_log_level.assert_called_once_with(obs._AEROSPIKE_PY_LOG_LEVELS["WARNING"])


def test_apply_aerospike_py_log_level_swallows_errors():
    """A failing set_log_level must never propagate out of startup."""
    with patch.object(obs, "aerospike_py") as mock_ap:
        mock_ap.set_log_level.side_effect = RuntimeError("boom")
        obs.apply_aerospike_py_log_level("INFO")  # must not raise


def test_init_aerospike_py_tracing_calls_init(monkeypatch):
    """The default path starts aerospike-py's native OTLP exporter."""
    monkeypatch.delenv("AEROSPIKE_PY_TRACING", raising=False)
    with patch.object(obs, "aerospike_py") as mock_ap:
        assert obs._init_aerospike_py_tracing() is True
    mock_ap.init_tracing.assert_called_once_with()


@pytest.mark.parametrize("falsy", ["false", "0", "no", "off", "FALSE", "Off"])
def test_init_aerospike_py_tracing_opt_out(monkeypatch, falsy):
    """AEROSPIKE_PY_TRACING falsy values skip aerospike-py span emission."""
    monkeypatch.setenv("AEROSPIKE_PY_TRACING", falsy)
    with patch.object(obs, "aerospike_py") as mock_ap:
        assert obs._init_aerospike_py_tracing() is False
    mock_ap.init_tracing.assert_not_called()


def test_init_aerospike_py_tracing_swallows_errors(monkeypatch):
    """A failing init_tracing (e.g. collector down) must not crash startup."""
    monkeypatch.delenv("AEROSPIKE_PY_TRACING", raising=False)
    with patch.object(obs, "aerospike_py") as mock_ap:
        mock_ap.init_tracing.side_effect = RuntimeError("collector down")
        assert obs._init_aerospike_py_tracing() is False  # must not raise


def test_shutdown_observability_flushes_tracer():
    """shutdown_observability flushes aerospike-py's Rust tracer."""
    with patch.object(obs, "aerospike_py") as mock_ap:
        mock_ap.dropped_log_count.return_value = 0
        obs.shutdown_observability()
    mock_ap.shutdown_tracing.assert_called_once_with()


def test_shutdown_observability_swallows_errors():
    """A failing shutdown_tracing must never propagate out of lifespan shutdown."""
    with patch.object(obs, "aerospike_py") as mock_ap:
        mock_ap.shutdown_tracing.side_effect = RuntimeError("boom")
        obs.shutdown_observability()  # must not raise


def test_shutdown_observability_shuts_down_python_providers():
    """The Python OTel SDK providers are flushed alongside aerospike-py."""
    from unittest.mock import MagicMock

    tp, mp, lp = MagicMock(), MagicMock(), MagicMock()
    obs._tracer_provider = tp
    obs._meter_provider = mp
    obs._logger_provider = lp
    with patch.object(obs, "aerospike_py"):
        obs.shutdown_observability()
    tp.shutdown.assert_called_once_with()
    mp.shutdown.assert_called_once_with()
    lp.shutdown.assert_called_once_with()


def test_shutdown_observability_provider_error_swallowed():
    """A failing provider.shutdown() must not propagate out of lifespan shutdown."""
    from unittest.mock import MagicMock

    bad = MagicMock()
    bad.shutdown.side_effect = RuntimeError("boom")
    obs._tracer_provider = bad
    with patch.object(obs, "aerospike_py"):
        obs.shutdown_observability()  # must not raise
    bad.shutdown.assert_called_once_with()


def test_setup_observability_starts_aerospike_py_tracing(monkeypatch):
    """The enabled path wires aerospike-py span emission, not just propagation."""
    monkeypatch.setenv("OTEL_SDK_DISABLED", "false")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_PROTOCOL", "grpc")
    monkeypatch.delenv("AEROSPIKE_PY_TRACING", raising=False)
    with patch.object(obs, "aerospike_py") as mock_ap:
        assert obs.setup_observability() is True
    mock_ap.init_tracing.assert_called_once_with()


def test_setup_observability_disabled_skips_aerospike_py_tracing(monkeypatch):
    """When OTel is disabled, aerospike-py tracing is never started."""
    monkeypatch.setenv("OTEL_SDK_DISABLED", "true")
    with patch.object(obs, "aerospike_py") as mock_ap:
        assert obs.setup_observability() is False
    mock_ap.init_tracing.assert_not_called()
