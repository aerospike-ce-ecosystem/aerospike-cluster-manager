"""Shared utility functions."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, Literal

from aerospike_py.exception import RecordNotFound
from fastapi import HTTPException

if TYPE_CHECKING:
    from aerospike_cluster_manager_api.models.query import QueryPredicate


# Explicit PK particle type selector. `auto` is a heuristic that tries the most
# likely type then falls back — see resolve_pk / get_with_pk_fallback below.
type PkType = Literal["auto", "string", "int", "bytes"]


def build_predicate(pred: QueryPredicate) -> tuple[Any, ...]:
    """Convert a QueryPredicate model into an Aerospike predicate tuple.

    Used by both routers/query.py and routers/records.py.
    """
    from aerospike_py import INDEX_TYPE_LIST, predicates

    op = pred.operator
    if op == "equals":
        return predicates.equals(pred.bin, pred.value)
    if op == "between":
        return predicates.between(pred.bin, pred.value, pred.value2)
    if op == "contains":
        return predicates.contains(pred.bin, INDEX_TYPE_LIST, pred.value)
    if op == "geo_within_region":
        geo = pred.value if isinstance(pred.value, str) else json.dumps(pred.value)
        return predicates.geo_within_geojson_region(pred.bin, geo)
    if op == "geo_contains_point":
        geo = pred.value if isinstance(pred.value, str) else json.dumps(pred.value)
        return predicates.geo_contains_geojson_point(pred.bin, geo)
    raise HTTPException(status_code=400, detail=f"Unknown predicate operator: {op}")


def parse_host_port(host_str: str, default_port: int) -> tuple[str, int]:
    """Parse a host string that may contain an optional ':port' suffix."""
    if ":" in host_str:
        host, port_str = host_str.rsplit(":", 1)
        try:
            return (host, int(port_str))
        except ValueError:
            return (host_str, default_port)
    return (host_str, default_port)


def resolve_pk(pk: str, pk_type: PkType = "auto") -> str | int | bytes:
    """Resolve a string primary key into the Aerospike key value of the requested type.

    Aerospike keys are digested as RIPEMD-160(set || particle_type_byte || key_bytes),
    so the particle type must match how the record was originally written. If
    the caller knows the type, they should pass it explicitly via ``pk_type``.

    Behavior:
        - "string": return ``pk`` as-is.
        - "int":    return ``int(pk)`` (raises ValueError if not parseable).
        - "bytes":  return ``bytes.fromhex(pk)`` (raises ValueError on invalid hex).
        - "auto":   best-effort heuristic. Treats any digit-only PK (including
                    negative) as an integer, preserving leading-zero strings. The
                    heuristic is wrong for numeric-string keys, so callers that
                    do reads should pair this with ``get_with_pk_fallback``.

    See also ``get_with_pk_fallback`` for the read-side fallback that tries the
    alternate type when ``auto`` picks wrong.
    """
    if pk_type == "string":
        return pk
    if pk_type == "int":
        try:
            return int(pk)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"pk_type=int but pk is not an integer: {pk!r}") from exc
    if pk_type == "bytes":
        try:
            return bytes.fromhex(pk)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"pk_type=bytes but pk is not valid hex: {pk!r}") from exc

    # auto: preserve the original heuristic so that true INTEGER-keyed sets
    # continue to work without requiring the caller to opt in. Read paths should
    # wrap this with get_with_pk_fallback to recover the NOT_FOUND case where
    # the heuristic guessed wrong.
    try:
        as_int = int(pk)
        if str(as_int) == pk:
            return as_int
    except ValueError:
        pass
    return pk


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
    """Read a record, retrying the alternate PK type if ``auto`` resolved wrong.

    When ``pk_type == "auto"`` and the first attempt raises ``RecordNotFound``,
    we retry with the alternate string/int particle type (whichever one the
    heuristic did *not* pick). This makes the record browser work for both
    INTEGER-keyed and STRING-keyed sets without the caller having to know
    upfront which one the record was written with.

    Explicit pk types (``string`` / ``int`` / ``bytes``) never fall back — if
    the caller asserted a type, we propagate the NOT_FOUND as-is so the caller
    knows the key is genuinely absent under that type.
    """
    try:
        return await client.get(key_tuple, policy=policy)
    except RecordNotFound:
        if pk_type != "auto":
            raise
        # Heuristic picked one type; try the opposite. If the alternate type
        # isn't applicable (e.g. non-numeric string can't become int), keep
        # propagating the original RecordNotFound — never leak ValueError.
        first = key_tuple[2]
        alt: str | int | None = None
        if isinstance(first, int):
            alt = pk_raw  # retry as raw string
        elif isinstance(first, str):
            try:
                alt = int(first)
            except ValueError:
                alt = None  # no integer alternative → fall through to re-raise
        if alt is None:
            raise
        return await client.get((key_tuple[0], key_tuple[1], alt), policy=policy)
