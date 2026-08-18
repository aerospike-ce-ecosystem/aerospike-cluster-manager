"""Unit tests for the connection-target SSRF gate.

The gate used to live inside ``connections_service.test_connection`` and was
applied nowhere else, so create-then-health walked around it (#470). It now
lives in :mod:`target_policy` — a leaf module ``client_manager`` can import —
and these tests pin the decision itself, independently of any route.
"""

from __future__ import annotations

import pytest

from aerospike_cluster_manager_api.target_policy import (
    ALLOW_LOOPBACK_TARGETS_ENV,
    BlockedConnectionTargetError,
    allow_private_targets,
    assert_targets_allowed,
    is_blocked_target,
)


class TestIsBlockedTarget:
    @pytest.mark.parametrize(
        "host",
        [
            "127.0.0.1",
            "127.1.2.3",  # the whole 127.0.0.0/8, not just .0.1
            "::1",
            "[::1]",  # bracketed IPv6 as it arrives from a host string
            "169.254.169.254",  # EC2 / GCP / Azure IMDS
            "169.254.0.1",
            "fe80::1",  # IPv6 link-local
        ],
    )
    def test_denied_literals(self, host: str) -> None:
        assert is_blocked_target(host) is True

    @pytest.mark.parametrize(
        "host",
        [
            "10.0.0.1",
            "192.168.1.10",
            "203.0.113.5",
            "2001:db8::1",
            "aerospike-node-1",
            "aerospike.default.svc.cluster.local",
            "example.com",
        ],
    )
    def test_allowed_targets(self, host: str) -> None:
        assert is_blocked_target(host) is False

    @pytest.mark.parametrize(
        "host",
        [
            "127.1",  # inet_aton short form
            "127.0.1",
            "2130706433",  # decimal
            "0x7f000001",  # hex
            "0177.0.0.1",  # octal
            "2852039166",  # decimal IMDS -- the sharpest of the set
            "0.0.0.0",  # unspecified; most stacks route it to localhost
            "::",
            "::ffff:127.0.0.1",  # IPv4-mapped IPv6
            "::ffff:169.254.169.254",
        ],
    )
    def test_alternative_spellings_of_denied_addresses(self, host: str) -> None:
        # `ipaddress.ip_address` accepts only the canonical forms, and treating a
        # parse failure as "not a literal, let it through" made every one of
        # these a working bypass of the gate -- `2852039166` reaches the cloud
        # metadata service. `getaddrinfo`, which the client actually dials
        # through, accepts them all.
        assert is_blocked_target(host) is True

    @pytest.mark.parametrize(
        "host",
        [
            "example.com",
            "aerospike-node-1",
            "1.2.3.4.5",  # too many octets: not an address at all
            "127.0.0.1x",  # trailing garbage
            "10.0.0.1",  # private, but never in scope -- see the module docstring
        ],
    )
    def test_the_inet_aton_fallback_does_not_over_block(self, host: str) -> None:
        # The fallback must widen the gate for numeric addresses only. A
        # hostname that `inet_aton` refuses has to stay allowed, or the gate
        # starts rejecting legitimate clusters.
        assert is_blocked_target(host) is False

    def test_hostname_is_not_pre_resolved(self) -> None:
        # Documented scope limit: a hostname that resolves to loopback is NOT
        # blocked here. Re-checking after a resolve races with the client's own
        # resolution, so egress policy is the backstop. Pinned as a test so the
        # limit is a decision rather than an oversight.
        assert is_blocked_target("localhost") is False

    def test_empty_host_is_not_blocked(self) -> None:
        assert is_blocked_target("") is False
        assert is_blocked_target("   ") is False


class TestAllowPrivateTargetsOverride:
    def test_default_is_deny(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("ACM_ALLOW_PRIVATE_TARGETS", raising=False)
        monkeypatch.delenv("ACM_CONNECTION_TEST_ALLOW_PRIVATE", raising=False)
        assert allow_private_targets() is False
        assert is_blocked_target("127.0.0.1") is True

    @pytest.mark.parametrize("value", ["true", "TRUE", "1", "yes", "on", " true "])
    def test_truthy_values(self, monkeypatch: pytest.MonkeyPatch, value: str) -> None:
        monkeypatch.setenv("ACM_ALLOW_PRIVATE_TARGETS", value)
        assert allow_private_targets() is True
        assert is_blocked_target("127.0.0.1") is False

    @pytest.mark.parametrize("value", ["false", "0", "no", "off", "", "maybe"])
    def test_falsy_values(self, monkeypatch: pytest.MonkeyPatch, value: str) -> None:
        monkeypatch.setenv("ACM_ALLOW_PRIVATE_TARGETS", value)
        monkeypatch.delenv("ACM_CONNECTION_TEST_ALLOW_PRIVATE", raising=False)
        assert allow_private_targets() is False

    def test_documented_name_opens_the_gate(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # `.env.example` documents ACM_ALLOW_LOOPBACK_TARGETS as the name to
        # set, and for a while nothing read it -- an operator who set it got
        # silence. Pinned so the documented knob and the honoured knob cannot
        # drift apart again.
        monkeypatch.setenv(ALLOW_LOOPBACK_TARGETS_ENV, "true")
        assert allow_private_targets() is True
        assert is_blocked_target("2130706433") is False

    def test_legacy_name_still_opens_the_gate(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # The original name predates the gate covering more than
        # test-connection. Deployments already setting it must keep working.
        monkeypatch.delenv("ACM_ALLOW_PRIVATE_TARGETS", raising=False)
        monkeypatch.setenv("ACM_CONNECTION_TEST_ALLOW_PRIVATE", "true")
        assert allow_private_targets() is True


class TestAssertTargetsAllowed:
    def test_allows_a_clean_list(self) -> None:
        assert_targets_allowed(["10.0.0.1", "aerospike-node-2"], 3000)

    def test_raises_naming_the_offending_entry(self) -> None:
        with pytest.raises(BlockedConnectionTargetError) as exc_info:
            assert_targets_allowed(["10.0.0.1", "169.254.169.254"], 3000)
        assert exc_info.value.host == "169.254.169.254"

    @pytest.mark.parametrize(
        "entry",
        [
            "127.0.0.1:3000",  # host:port suffix
            "127.0.0.1:abc",  # non-integer port — parse_host_port must still
            # yield the bare host, or the gate silently no-ops
            "[::1]:3000",  # bracketed IPv6 with port
        ],
    )
    def test_port_suffixes_do_not_defeat_the_gate(self, entry: str) -> None:
        with pytest.raises(BlockedConnectionTargetError):
            assert_targets_allowed([entry], 3000)

    @pytest.mark.parametrize("entry", ["2852039166", "2130706433:3000", "0x7f000001"])
    def test_alternative_forms_are_rejected_at_the_list_gate(self, entry: str) -> None:
        # The three call sites (create, update, every client build) all go
        # through here, so this is the assertion that actually protects them.
        with pytest.raises(BlockedConnectionTargetError):
            assert_targets_allowed([entry], 3000)

    def test_error_is_a_value_error(self) -> None:
        # Subclassing ValueError means a caller that only handles ValueError
        # from the client-build path degrades to a 404 rather than a 500.
        # Routers that want the specific shape catch this class first.
        with pytest.raises(ValueError):
            assert_targets_allowed(["127.0.0.1"], 3000)
