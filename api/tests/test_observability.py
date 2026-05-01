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
    yield
    obs._initialized = False


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
