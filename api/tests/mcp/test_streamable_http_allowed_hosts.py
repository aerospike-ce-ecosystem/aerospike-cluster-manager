"""Unit tests for ACM_MCP_ALLOWED_HOSTS plumbing.

The MCP SDK auto-enables DNS rebinding protection with a loopback-only
allow-list (``127.0.0.1:*``, ``localhost:*``, ``[::1]:*``) whenever
``FastMCP`` is constructed without an explicit ``transport_security`` and
the streamable-HTTP transport ``host`` falls back to its default
(``127.0.0.1``). That is correct for ``mcp run`` on a developer laptop,
but it makes every production ingress hostname return HTTP 421
``Invalid Host header``.

The :func:`build_mcp_app` helper widens that allow-list with the
operator-configured ``ACM_MCP_ALLOWED_HOSTS`` list while keeping the
loopback entries so in-pod debugging keeps working. These tests verify
that plumbing without booting a real HTTP server.
"""

from __future__ import annotations

from aerospike_cluster_manager_api.mcp.server import (
    _LOOPBACK_HOSTS,
    _LOOPBACK_ORIGINS,
    build_mcp_app,
)


def test_no_allowed_hosts_uses_sdk_default() -> None:
    """No allow-list → SDK auto-fills loopback-only defaults.

    We pass ``None`` to FastMCP, and the SDK's pydantic ``Settings`` model
    materialises its ``host=127.0.0.1`` auto-default —
    ``allowed_hosts=['127.0.0.1:*', 'localhost:*', '[::1]:*']``. External
    hostnames are NOT silently injected: an unconfigured deployment
    behaves exactly as the SDK does upstream.
    """
    mcp = build_mcp_app()
    settings = mcp.settings.transport_security
    assert settings is not None
    assert settings.enable_dns_rebinding_protection is True
    assert set(settings.allowed_hosts) == set(_LOOPBACK_HOSTS)
    # External hosts are not silently widened.
    assert "aerospike-api.example.com" not in settings.allowed_hosts


def test_external_host_merged_with_loopback_defaults() -> None:
    """Non-empty list → explicit TransportSecuritySettings on FastMCP.

    The merge is additive — we never strip the loopback entries because
    that would break ``kubectl exec ... curl http://localhost:8000/mcp``.
    """
    mcp = build_mcp_app(allowed_hosts=["aerospike-api.example.com"])
    settings = mcp.settings.transport_security
    assert settings is not None
    assert settings.enable_dns_rebinding_protection is True
    assert "aerospike-api.example.com" in settings.allowed_hosts
    for host in _LOOPBACK_HOSTS:
        assert host in settings.allowed_hosts
    # Origin allow-list mirrors the bare-hostname entries with both schemes;
    # loopback origins are merged in for browser-style probes against the
    # in-pod debug port.
    assert "http://aerospike-api.example.com" in settings.allowed_origins
    assert "https://aerospike-api.example.com" in settings.allowed_origins
    for origin in _LOOPBACK_ORIGINS:
        assert origin in settings.allowed_origins


def test_wildcard_port_host_does_not_generate_origin() -> None:
    """``host:*`` wildcard-port entries are accepted on the Host axis only.

    Generating ``http://example.com:*`` automatically would over-grant —
    operators who need browser flows on a non-standard port can supply an
    explicit origin allow-list in a follow-up.
    """
    mcp = build_mcp_app(allowed_hosts=["example.com:*"])
    settings = mcp.settings.transport_security
    assert settings is not None
    assert "example.com:*" in settings.allowed_hosts
    assert "http://example.com:*" not in settings.allowed_origins
    assert "https://example.com:*" not in settings.allowed_origins


def test_multiple_external_hosts_all_merged() -> None:
    """Multiple operator-supplied hosts all land in the allow-list."""
    mcp = build_mcp_app(
        allowed_hosts=["aerospike-api.example.com", "aerospike-api.staging.example.com"]
    )
    settings = mcp.settings.transport_security
    assert settings is not None
    assert "aerospike-api.example.com" in settings.allowed_hosts
    assert "aerospike-api.staging.example.com" in settings.allowed_hosts
    assert "http://aerospike-api.example.com" in settings.allowed_origins
    assert "http://aerospike-api.staging.example.com" in settings.allowed_origins
