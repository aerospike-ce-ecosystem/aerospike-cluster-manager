"""Shared primary-key helpers — HTTP-free domain logic.

This module is the single source of truth for translating a string-form
primary key (as it appears in URLs and request bodies) into the typed
value Aerospike expects, and for performing a read with a particle-type
fallback when ``pk_type='auto'`` guesses wrong.

Design rules:

* This module **must not** import ``fastapi`` or any HTTP-shaping
  libraries — the same code is reused by service-layer callers (which
  raise domain exceptions) and by any non-HTTP caller.
* Domain failures surface as ``ValueError`` subclasses defined here.
  HTTP-boundary callers (the records / query routers) catch them and
  re-raise as :class:`fastapi.HTTPException` with the right status code.

Previously these helpers were duplicated across ``services.query_service``
and ``services.records_service``, each carrying a near byte-identical copy
plus its own ``PkType`` ``Literal``. This module collapses them.
"""

from __future__ import annotations

from typing import Any, Literal

import aerospike_py
from aerospike_py import Record
from aerospike_py.exception import RecordNotFound

# Explicit PK particle type selector. ``auto`` is a heuristic that tries
# the most likely type then retries the alternate type on NOT_FOUND.
PkType = Literal["auto", "string", "int", "bytes"]


# ---------------------------------------------------------------------------
# Domain exceptions — also surfaced from services that re-export them.
# ---------------------------------------------------------------------------


class PrimaryKeyMissing(ValueError):
    """Raised when a write request omits one of namespace/set/pk."""

    def __init__(self, field: str) -> None:
        super().__init__(f"Missing required key field: {field}")
        self.field = field


class SetRequiredForPkLookup(ValueError):
    """Raised when a PK lookup is run without a ``set`` scope.

    Aerospike addresses records via ``(namespace, set, pk)`` tuples, so a
    PK lookup without a set is meaningless. Disallowed at the service
    boundary.
    """

    def __init__(self) -> None:
        super().__init__("Set is required for primary key lookup")


# ---------------------------------------------------------------------------
# Resolver
# ---------------------------------------------------------------------------


def resolve_pk(pk: str, pk_type: PkType = "auto") -> str | int | bytes:
    """Resolve a string primary key into the typed value Aerospike expects.

    Aerospike keys are digested as RIPEMD-160(set || particle_type_byte || key_bytes),
    so the particle type must match how the record was originally written.
    If the caller knows the type, they should pass it explicitly via
    ``pk_type``.

    Behavior:
        - ``"string"``: return ``pk`` as-is.
        - ``"int"``: return ``int(pk)`` (raises :class:`ValueError` if not parseable).
        - ``"bytes"``: return ``bytes.fromhex(pk)`` (raises :class:`ValueError` on invalid hex).
        - ``"auto"``: best-effort heuristic. Treats any digit-only PK
          (including negative) as an integer, preserving leading-zero strings.
          The heuristic is wrong for numeric-string keys, so callers that do
          reads should pair this with :func:`get_with_pk_fallback`.
    """
    if pk_type == "string":
        return pk
    if pk_type == "int":
        try:
            return int(pk)
        except ValueError as exc:
            raise ValueError(f"pk_type=int but pk is not an integer: {pk!r}") from exc
    if pk_type == "bytes":
        try:
            return bytes.fromhex(pk)
        except ValueError as exc:
            raise ValueError(f"pk_type=bytes but pk is not valid hex: {pk!r}") from exc

    # ``auto``: numeric-string heuristic. Preserves leading-zero strings so
    # something like "00042" stays a string rather than collapsing to 42.
    try:
        as_int = int(pk)
        if str(as_int) == pk:
            return as_int
    except ValueError:
        pass
    return pk


async def get_with_pk_fallback(
    client: aerospike_py.AsyncClient,
    key_tuple: tuple[str, str, str | int | bytes],
    pk_raw: str,
    pk_type: PkType,
    policy: dict[str, Any],
) -> Record:
    """Read a record, retrying the alternate PK type if ``auto`` resolved wrong.

    When ``pk_type == "auto"`` and the first attempt raises
    :class:`aerospike_py.exception.RecordNotFound`, retry with the
    alternate string/int particle type (whichever the heuristic did *not*
    pick). This makes the record browser work for both INTEGER-keyed and
    STRING-keyed sets without the caller having to know upfront which
    one the record was written with.

    Explicit pk types (``string`` / ``int`` / ``bytes``) never fall back —
    if the caller asserted a type, propagate the NOT_FOUND as-is so the
    caller knows the key is genuinely absent under that type.
    """
    try:
        return await client.get(key_tuple, policy=policy)
    except RecordNotFound:
        if pk_type != "auto":
            raise
        # Heuristic picked one type; try the opposite. If the alternate
        # type isn't applicable (e.g. non-numeric string can't become int),
        # keep propagating the original RecordNotFound — never leak ValueError.
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
