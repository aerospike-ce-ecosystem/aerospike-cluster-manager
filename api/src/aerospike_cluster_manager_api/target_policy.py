"""Default-deny SSRF gate for Aerospike connection targets.

The API dials whatever host a caller puts in a connection profile. Without a
gate that makes it an SSRF primitive: point a profile at ``127.0.0.1`` or
``169.254.169.254`` and the response distinguishes "closed", "filtered", and
"something is listening", which maps internal listeners and confirms cloud
metadata reachability from the API pod.

The gate used to live inside ``connections_service.test_connection`` alone.
``create_connection`` never called it and ``client_manager.get_client``
dialled the stored hosts with no gate of its own, so create-then-health
bypassed it entirely (#470). It lives here now because it has to be
enforceable from both the service layer and ``client_manager``, and
``connections_service`` imports ``client_manager`` — a shared leaf module is
the only import direction that works.

Scope, unchanged from the original gate: **bare IP literals only**. A
hostname is not pre-resolved, because re-checking after a resolve races with
the client's own resolution (TOCTOU) and would give a false sense of
coverage. Literal-IP rejection is the cheap first line; egress firewall
policy is expected to backstop DNS-based bypasses.
"""

from __future__ import annotations

import ipaddress
import os
import socket

from aerospike_cluster_manager_api.utils import parse_host_port

__all__ = [
    "ALLOW_LOOPBACK_TARGETS_ENV",
    "ALLOW_PRIVATE_TARGETS_ENV",
    "BlockedConnectionTargetError",
    "assert_targets_allowed",
    "is_blocked_target",
]

# Preferred name, and the one ``.env.example`` documents. What the gate denies
# is loopback / link-local / unspecified — not "private" ranges, which it has
# never blocked (10/8 and 192.168/16 targets are legitimate). The older names
# invited the wrong threat model.
ALLOW_LOOPBACK_TARGETS_ENV = "ACM_ALLOW_LOOPBACK_TARGETS"

# Superseded names, still honoured so no deployment breaks on upgrade. Any of
# the three being truthy opens the gate.
ALLOW_PRIVATE_TARGETS_ENV = "ACM_ALLOW_PRIVATE_TARGETS"
_LEGACY_ALLOW_PRIVATE_TARGETS_ENV = "ACM_CONNECTION_TEST_ALLOW_PRIVATE"

_TRUTHY = {"1", "true", "yes", "on"}


class BlockedConnectionTargetError(ValueError):
    """Raised when a connection target points at a denied address.

    Default-deny: loopback, link-local (especially the EC2 IMDS
    ``169.254.169.254``), and IPv6 ``::1`` are rejected before any network
    syscall so the API cannot be repurposed as an internal port scanner or a
    metadata-service exfil channel. Operators can override the default-deny
    via :data:`ALLOW_PRIVATE_TARGETS_ENV` for dev deployments where the API
    and Aerospike share a host.

    Subclasses :class:`ValueError` so callers that already handle
    ``ValueError`` from the client-build path degrade safely rather than
    escaping as a 500; routers that want the specific wire shape catch this
    class *before* their ``ValueError`` branch.
    """

    def __init__(self, host: str) -> None:
        super().__init__(f"Connection target '{host}' is not allowed")
        self.host = host


def allow_private_targets() -> bool:
    """Return True when operators have opted into private-range targets.

    Read live (not snapshotted) so test fixtures can flip the env var via
    monkeypatch. The default is False — production deployments default-deny
    loopback / link-local to keep the connection API from being repurposed
    as an internal port scanner or IMDS exfil channel.
    """
    for name in (
        ALLOW_LOOPBACK_TARGETS_ENV,
        ALLOW_PRIVATE_TARGETS_ENV,
        _LEGACY_ALLOW_PRIVATE_TARGETS_ENV,
    ):
        if os.environ.get(name, "").strip().lower() in _TRUTHY:
            return True
    return False


def _parse_ip_literal(candidate: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    """Parse ``candidate`` the way the client's resolver will, or return None.

    ``ipaddress.ip_address`` accepts only the canonical forms. ``getaddrinfo``,
    which is what the Aerospike client actually dials through, additionally
    accepts the historical ``inet_aton`` encodings — and each one is a working
    alias for an address this gate is supposed to deny::

        127.1        -> 127.0.0.1        (short form)
        2130706433   -> 127.0.0.1        (decimal)
        0x7f000001   -> 127.0.0.1        (hex)
        2852039166   -> 169.254.169.254  (IMDS, decimal)

    Treating a canonical-parse failure as "not a literal, let it through" made
    every one of those a bypass. So fall back to ``socket.inet_aton`` and judge
    the quad it yields. ``inet_aton`` still rejects anything that is not a
    numeric address (``example.com``, ``1.2.3.4.5``, ``127.0.0.1x`` all raise),
    so a real hostname is unaffected and the documented scope limit — hostnames
    are not pre-resolved — is unchanged.
    """
    try:
        return ipaddress.ip_address(candidate)
    except ValueError:
        pass
    try:
        return ipaddress.IPv4Address(socket.inet_aton(candidate))
    except (OSError, ipaddress.AddressValueError):
        return None


def is_blocked_target(host: str) -> bool:
    """Return True iff ``host`` is a denied IP literal.

    Blocks loopback (``127.0.0.0/8``, ``::1``), link-local (``169.254.0.0/16``
    — includes the EC2 IMDS ``169.254.169.254`` — and the IPv6 ``fe80::/10``
    equivalent), and the unspecified address (``0.0.0.0``, ``::``), which most
    stacks route to localhost.

    Every alternative spelling of those addresses is denied too; see
    :func:`_parse_ip_literal`. IPv4-mapped IPv6 (``::ffff:127.0.0.1``) needs no
    special handling — :mod:`ipaddress` already reports the mapped address's
    properties.

    Hostnames that are not bare IP literals are *not* blocked here; see the
    module docstring for why.
    """
    if allow_private_targets():
        return False
    candidate = host.strip()
    if not candidate:
        return False
    # IPv6 literals may arrive bracketed (`[::1]`); strip before parsing.
    if candidate.startswith("[") and candidate.endswith("]"):
        candidate = candidate[1:-1]
    ip = _parse_ip_literal(candidate)
    if ip is None:
        # Not a numeric address at all -- let it through; DNS-based abuse is
        # explicitly out of scope per the module docstring rationale.
        return False
    return bool(ip.is_loopback or ip.is_link_local or ip.is_unspecified)


def assert_targets_allowed(hosts: list[str], default_port: int) -> None:
    """Raise :class:`BlockedConnectionTargetError` for the first denied host.

    ``hosts`` entries may carry a ``:port`` suffix, so each is parsed with
    :func:`utils.parse_host_port` before the literal check — passing the raw
    ``"127.0.0.1:3000"`` to :func:`is_blocked_target` would fail to parse as
    an IP and silently no-op the gate.
    """
    for host_str in hosts:
        host_only, _ = parse_host_port(host_str, default_port)
        if is_blocked_target(host_only):
            raise BlockedConnectionTargetError(host_str)
