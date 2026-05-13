"""Shared utility functions — FastAPI adapters around HTTP-free domain logic.

The genuine domain logic lives in dedicated modules so any non-HTTP caller
can reuse it without dragging FastAPI in:

* :mod:`aerospike_cluster_manager_api.pk` — primary-key resolution and
  read-with-fallback.
* :mod:`aerospike_cluster_manager_api.predicate` — predicate-tuple
  construction.

The functions in this module are thin adapters: they call the domain
helpers and translate the domain exceptions into
:class:`fastapi.HTTPException` with the correct HTTP status code.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from fastapi import HTTPException

from aerospike_cluster_manager_api.pk import (
    PkType,
)
from aerospike_cluster_manager_api.pk import (
    get_with_pk_fallback as _get_with_pk_fallback_domain,
)
from aerospike_cluster_manager_api.pk import (
    resolve_pk as _resolve_pk_domain,
)
from aerospike_cluster_manager_api.predicate import (
    UnknownPredicateOperator,
)
from aerospike_cluster_manager_api.predicate import (
    build_predicate as _build_predicate_domain,
)

if TYPE_CHECKING:
    from aerospike_cluster_manager_api.models.query import QueryPredicate


# Re-export ``PkType`` for legacy callers that import it from ``utils``.
__all__ = [
    "PkType",
    "auto_detect_pk",
    "build_predicate",
    "get_with_pk_fallback",
    "parse_host_port",
    "resolve_pk",
]


def build_predicate(pred: QueryPredicate) -> tuple[Any, ...]:
    """Convert a :class:`QueryPredicate` into an Aerospike predicate tuple.

    Thin FastAPI adapter around
    :func:`aerospike_cluster_manager_api.predicate.build_predicate`. Used
    only by HTTP routers — services should call the domain function
    directly so the HTTP coupling stays at the boundary.
    """
    try:
        return _build_predicate_domain(pred)
    except UnknownPredicateOperator as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def parse_host_port(host_str: str, default_port: int) -> tuple[str, int]:
    """Parse a host string that may contain an optional ``:port`` suffix."""
    if ":" in host_str:
        host, port_str = host_str.rsplit(":", 1)
        try:
            return (host, int(port_str))
        except ValueError:
            return (host_str, default_port)
    return (host_str, default_port)


def resolve_pk(pk: str, pk_type: PkType = "auto") -> str | int | bytes:
    """Resolve a string primary key into the typed value Aerospike expects.

    Thin FastAPI adapter around
    :func:`aerospike_cluster_manager_api.pk.resolve_pk`. Domain
    :class:`ValueError` from explicit ``int`` / ``bytes`` mismatches is
    re-raised as :class:`fastapi.HTTPException` (400) so HTTP callers
    don't have to translate it themselves. Service callers should use
    the domain helper directly.
    """
    try:
        return _resolve_pk_domain(pk, pk_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# Backward-compat alias — existing callers keep working. Prefer ``resolve_pk``.
def auto_detect_pk(pk: str) -> str | int:
    """Deprecated: use ``resolve_pk(pk, pk_type='auto')`` instead."""
    result = resolve_pk(pk, "auto")
    # auto mode never returns bytes; cast to satisfy the narrower return type.
    if isinstance(result, bytes):  # pragma: no cover — defensive, unreachable
        raise TypeError("resolve_pk(auto) unexpectedly returned bytes")
    return result


async def get_with_pk_fallback(
    client: Any,
    key_tuple: tuple[str, str, str | int | bytes],
    pk_raw: str,
    pk_type: PkType,
    policy: dict[str, Any],
) -> Any:
    """Read a record, retrying the alternate PK type if ``auto`` guessed wrong.

    Thin pass-through to
    :func:`aerospike_cluster_manager_api.pk.get_with_pk_fallback`. The
    domain function does not raise HTTP-specific exceptions, so this
    adapter is just a stable import path for legacy router callers.
    """
    return await _get_with_pk_fallback_domain(client, key_tuple, pk_raw, pk_type, policy)
