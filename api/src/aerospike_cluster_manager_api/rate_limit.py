"""Rate limiter wiring.

Built on top of :mod:`slowapi`. Two responsibilities live here:

* ``_get_client_ip`` — derive the rate-limit bucket key from the request,
  honouring an ``X-Forwarded-For`` chain only for hops we explicitly trust.
* ``limiter`` — the module-global :class:`slowapi.Limiter` consumed by
  routers. Carries a conservative default applied to every request that
  passes through ``SlowAPIMiddleware``; long-lived endpoints (SSE) opt out
  via ``@limiter.exempt``.
"""

from __future__ import annotations

import ipaddress

from limits import RateLimitItem, parse
from slowapi import Limiter
from starlette.requests import Request

from aerospike_cluster_manager_api import config


def _parse_trusted_proxies(entries: list[str]) -> tuple[list[ipaddress.IPv4Network | ipaddress.IPv6Network], set[str]]:
    """Split TRUSTED_PROXIES entries into (CIDR networks, exact-match strings).

    Bare IP literals are kept on the exact-match side so the membership
    check stays a hash lookup. Anything that ``ip_network`` accepts as a
    CIDR (e.g. ``10.0.0.0/8``, ``2001:db8::/32``) is parsed into a network.
    Garbage entries are silently skipped — config validation belongs in
    :mod:`config`, not here.
    """
    networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
    literals: set[str] = set()
    for raw in entries:
        if not raw:
            continue
        if "/" in raw:
            try:
                networks.append(ipaddress.ip_network(raw, strict=False))
            except ValueError:
                continue
        else:
            literals.add(raw)
    return networks, literals


def _is_trusted(addr: str, networks, literals: set[str]) -> bool:
    """Return True iff ``addr`` matches a trusted literal or CIDR."""
    if addr in literals:
        return True
    if not networks:
        return False
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    return any(ip in net for net in networks)


def _get_client_ip(request: Request) -> str:
    """Extract the client IP for rate-limit bucketing.

    Algorithm:

    1. Read ``request.client.host`` as the immediate peer.
    2. If no ``X-Forwarded-For`` header, return the peer.
    3. Walk the XFF chain right-to-left, dropping hops we trust
       (TRUSTED_PROXIES — exact IPs or CIDR ranges). Return the first
       untrusted hop encountered. This is the leftmost untrusted entry,
       which matches the standard reverse-proxy convention and resists
       client-spoofed prefixes.
    4. If every XFF hop is trusted (request entirely inside the proxy
       fleet), return the immediate peer.

    Rationale: the previous implementation took the *rightmost* XFF
    entry, which is the address of the last trusted proxy and collapses
    every external caller into a single bucket. Leftmost-untrusted
    spreads the bucket across real clients while still ignoring spoofed
    headers prepended by the caller themselves.
    """
    client_host = request.client.host if request.client else "127.0.0.1"

    forwarded_for = request.headers.get("X-Forwarded-For")
    if not forwarded_for:
        return client_host

    networks, literals = _parse_trusted_proxies(config.TRUSTED_PROXIES)
    # Empty trust list → don't believe XFF at all; the immediate peer is
    # the only datum we can trust. This also keeps the default-deploy
    # behaviour (operator hasn't configured any proxies) safe.
    if not networks and not literals:
        return client_host

    # Only honour XFF when the immediate peer is itself a trusted proxy.
    # Otherwise the caller is talking to us directly and could have
    # forged any header they like.
    if not _is_trusted(client_host, networks, literals):
        return client_host

    hops = [h.strip() for h in forwarded_for.split(",") if h.strip()]
    # Walk right→left, peel off trusted hops, take the first untrusted.
    for hop in reversed(hops):
        if not _is_trusted(hop, networks, literals):
            return hop

    # Every hop was trusted — fall back to the immediate peer.
    return client_host


# Conservative global default: 60 requests/minute/IP. Picked low enough
# that an unauthenticated bot scraping the API can't trivially DoS the
# data plane, but high enough that an interactive UI session (which
# typically issues a handful of requests per user action) never bumps
# into it. Mutation routes layer stricter limits on top via
# ``@limiter.limit(...)`` decorators.
DEFAULT_LIMITS = ["60/minute"]

limiter = Limiter(key_func=_get_client_ip, default_limits=DEFAULT_LIMITS)  # type: ignore[arg-type]  # slowapi default_limits accepts list[str]; pyright strict-checks against alias


# ---------------------------------------------------------------------------
# Body-conditional budgets
# ---------------------------------------------------------------------------
# ``@limiter.limit`` decides before the handler runs and cannot see the parsed
# body — slowapi's own ``exempt_when`` hook is called with no arguments (see
# ``slowapi.wrappers.Limit.is_exempt``). That is fine for routes where every
# request costs the same, but ``POST /clusters/{conn_id}/info`` is two routes
# wearing one path: a read-only diagnostic that ``ackoctl info`` polls, and an
# opt-in write passthrough. Decorating the route would put the strict write
# budget on the reads as well.
#
# ``consume_budget`` therefore lets a handler charge a named budget once it
# knows which path the request took. Same key function as the decorator, so
# the bucket follows the same trusted-proxy rules.

# Raw asinfo write passthrough (#467). Deliberately far below the 60/minute
# global default: state-changing asinfo is an operator action, not traffic.
INFO_WRITE_LIMIT: RateLimitItem = parse("5/minute")


def consume_budget(request: Request, item: RateLimitItem, scope: str) -> bool:
    """Charge one hit against ``item`` for this request's client, in ``scope``.

    Returns ``True`` when the request is within budget and ``False`` when it
    has been exhausted — the caller raises HTTP 429. ``scope`` namespaces the
    bucket so two budgets sharing a client IP do not share a counter.

    ``limiter.enabled`` is honoured for the same reason slowapi's own
    ``_check_request_limit`` honours it: "rate limiting is off" has to mean
    every budget, or a test suite that disables the limiter still trips over
    the ones the decorator does not own.
    """
    if not limiter.enabled:
        return True
    return limiter.limiter.hit(item, scope, _get_client_ip(request))
