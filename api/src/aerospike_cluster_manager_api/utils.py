"""Shared utility functions.

This module currently holds a single host-string parser. The
primary-key and predicate helpers that used to live here have been
removed: services call the domain modules directly —

* :mod:`aerospike_cluster_manager_api.pk` — primary-key resolution and
  read-with-fallback (used by ``records_service`` / ``query_service``).
* :mod:`aerospike_cluster_manager_api.predicate` — predicate-tuple
  construction (used by ``records_service`` / ``query_service``).

The old ``utils`` adapters (``build_predicate``, ``resolve_pk``,
``auto_detect_pk``, ``get_with_pk_fallback``, and the ``PkType``
re-export) had no callers left — every router and service imports the
domain helpers directly — so they were dead code and have been deleted.
"""

from __future__ import annotations

__all__ = ["parse_host_port"]


def parse_host_port(host_str: str, default_port: int) -> tuple[str, int]:
    """Parse a host string that may contain an optional ``:port`` suffix."""
    if ":" in host_str:
        host, port_str = host_str.rsplit(":", 1)
        try:
            return (host, int(port_str))
        except ValueError:
            return (host_str, default_port)
    return (host_str, default_port)
