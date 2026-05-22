"""Business logic for Aerospike record CRUD and scan operations.

These functions are the single source of truth for the records read/write
path. The HTTP router (``routers/records.py``) wraps them in HTTPException
translation, FastAPI dependencies, and ``record_to_model`` conversion to
the wire-format ``AerospikeRecord``.

To stay reusable from any caller, this module **must not** import ``fastapi``
or other HTTP-shaping libraries. Domain failures are signalled by plain
exceptions defined here, which the router translates to HTTP status codes.

CDT (lists, maps, geojson) bin values are returned as the raw aerospike-py
``Record`` NamedTuple — JSON-safe serialization is intentionally deferred to
the dedicated serializer layer (Phase 1 task A.10), so this module never
mutates bin contents.
"""

from __future__ import annotations

import logging
import time
from typing import Any, NamedTuple

import aerospike_py
from aerospike_py import Record, exp
from aerospike_py.exception import (
    AerospikeError,
    AerospikeTimeoutError,
    BackpressureError,
    ClusterError,
    RecordNotFound,
)
from aerospike_py.types import WriteMeta

from aerospike_cluster_manager_api.constants import (
    MAX_QUERY_RECORDS,
    POLICY_QUERY,
    POLICY_READ,
    POLICY_WRITE,
    info_namespace,
    info_sets,
)
from aerospike_cluster_manager_api.expression_builder import (
    InvalidFilterValueError,
    InvalidPkPatternError,
    build_expression,
    build_pk_filter_expression,
)
from aerospike_cluster_manager_api.info_parser import (
    aggregate_node_kv,
    aggregate_set_records,
    safe_int,
)
from aerospike_cluster_manager_api.models.query import FilteredQueryRequest
from aerospike_cluster_manager_api.models.record import RecordWriteRequest
from aerospike_cluster_manager_api.pk import (
    PkType,
    PrimaryKeyMissing,
    SetRequiredForPkLookup,
    get_with_pk_fallback,
    resolve_pk,
)
from aerospike_cluster_manager_api.predicate import build_predicate

logger = logging.getLogger(__name__)


# ``PkType``, ``PrimaryKeyMissing``, and ``SetRequiredForPkLookup`` are
# re-exported from this module for backward compatibility (tests still
# import them from here). Their canonical home is
# :mod:`aerospike_cluster_manager_api.pk`.
__all__ = [
    "FilterRecordsResult",
    "InvalidFilterValueError",
    "InvalidPkPattern",
    "ListRecordsResult",
    "PkType",
    "PrimaryKeyMissing",
    "SetRequiredForPkLookup",
    "create_record",
    "delete_bin",
    "delete_record",
    "filter_records",
    "get_record",
    "list_records",
    "put_record",
    "record_exists",
    "truncate_set",
    "update_record",
]


# ---------------------------------------------------------------------------
# Domain exceptions
# ---------------------------------------------------------------------------


class InvalidPkPattern(ValueError):
    """Raised when a PK pattern (prefix/regex) cannot be compiled."""

    def __init__(self, message: str) -> None:
        super().__init__(message)


# ---------------------------------------------------------------------------
# Result containers
# ---------------------------------------------------------------------------


class ListRecordsResult(NamedTuple):
    """Outcome of a paginated list/scan call.

    ``records`` is a list of raw aerospike-py ``Record`` NamedTuples. The
    router converts each one via ``converters.record_to_model`` before
    returning to clients; CDT-safe serialization is left to a dedicated
    serializer layer.
    """

    records: list[Record]
    total: int
    page: int
    page_size: int
    has_more: bool
    total_estimated: bool


class FilterRecordsResult(NamedTuple):
    """Outcome of a paginated filter/scan call.

    ``scanned_records`` and ``returned_records`` are lower bounds when
    ``total_estimated`` is True (the server-side filter scan does not
    expose an exact count without a separate count-only query).
    """

    records: list[Record]
    total: int
    page: int
    page_size: int
    has_more: bool
    execution_time_ms: int
    scanned_records: int
    returned_records: int
    total_estimated: bool


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _get_set_object_count(client: aerospike_py.AsyncClient, ns: str, set_name: str) -> int:
    """Approximate object count for a set via the namespace/sets info commands.

    Fetches the namespace replication-factor first to de-duplicate counts
    across nodes, matching the same approach used in ``clusters_service``.

    Connectivity / timeout / backpressure errors (``ClusterError``,
    ``AerospikeTimeoutError``, ``BackpressureError``) are re-raised so the
    global exception handlers in :mod:`main` can map them to 503/504. The
    callers (:func:`list_records`, :func:`run_filtered_query`) deliberately
    propagate those same classes — swallowing them here would make a
    transient timeout report ``total=0`` on a non-empty set. Only narrow,
    best-effort failures (other ``AerospikeError`` / ``OSError``) fall back
    to 0.
    """
    if not set_name:
        return 0
    try:
        ns_all = await client.info_all(info_namespace(ns))
        ns_stats = aggregate_node_kv(ns_all)
        replication_factor = safe_int(ns_stats.get("replication-factor"), 1)

        sets_all = await client.info_all(info_sets(ns))
        agg = aggregate_set_records(sets_all, replication_factor)
        for s in agg:
            if s["name"] == set_name:
                return s["objects"]
    except (ClusterError, AerospikeTimeoutError, BackpressureError):
        # Infrastructure failure — must surface as 503/504, not a fake 0.
        raise
    except (AerospikeError, OSError):
        logger.debug("Failed to get set object count for %s.%s", ns, set_name, exc_info=True)
    return 0


# ---------------------------------------------------------------------------
# Service entry points — single record CRUD
# ---------------------------------------------------------------------------


async def get_record(
    client: aerospike_py.AsyncClient,
    namespace: str,
    set_name: str,
    pk: str,
    pk_type: PkType = "auto",
) -> Record:
    """Fetch a single record by ``(namespace, set, pk)``.

    Resolves ``pk`` via the requested ``pk_type``. When ``pk_type='auto'``
    and the initial probe returns NOT_FOUND, retries with the alternate
    particle type — fixing the case where a numeric-string key (e.g. ``"42"``)
    was stored as STRING but auto resolves to INTEGER.

    Raises:
        RecordNotFound: the record does not exist (after auto fallback).
        ValueError: ``pk_type`` was explicit but ``pk`` could not be parsed.
    """
    resolved = resolve_pk(pk, pk_type)
    return await get_with_pk_fallback(client, (namespace, set_name, resolved), pk, pk_type, POLICY_READ)


async def delete_record(
    client: aerospike_py.AsyncClient,
    namespace: str,
    set_name: str,
    pk: str,
    pk_type: PkType = "auto",
) -> None:
    """Delete a record by ``(namespace, set, pk)``.

    Deletes do not fall back to the alternate type even in ``auto`` mode: a
    delete that targets the wrong particle type would silently no-op (the
    record at the *other* type stays put), and a fallback could mask that
    fact. Pass an explicit ``pk_type`` to be sure of which record gets removed.

    Raises:
        RecordNotFound: aerospike-py may surface this when the key does not
            exist; callers may treat it as a 404 or a 204 depending on the
            HTTP semantics they want.
        ValueError: ``pk_type`` was explicit but ``pk`` could not be parsed.
    """
    resolved = resolve_pk(pk, pk_type)
    await client.remove((namespace, set_name, resolved))


async def record_exists(
    client: aerospike_py.AsyncClient,
    namespace: str,
    set_name: str,
    pk: str,
    pk_type: PkType = "auto",
) -> bool:
    """Return True iff a record at ``(namespace, set, pk)`` exists.

    Wraps :meth:`aerospike_py.AsyncClient.exists` — that call returns an
    ``ExistsResult`` with ``meta=None`` when the record is absent (no
    exception). We also catch :class:`RecordNotFound` defensively in case a
    future client revision swaps to the exception form.

    Raises:
        ValueError: ``pk_type`` was explicit but ``pk`` could not be parsed.
    """
    resolved = resolve_pk(pk, pk_type)
    try:
        result = await client.exists((namespace, set_name, resolved), policy=POLICY_READ)
    except RecordNotFound:
        return False
    return result.meta is not None


async def create_record(
    client: aerospike_py.AsyncClient,
    namespace: str,
    set_name: str,
    pk: str,
    bins: dict[str, Any],
    pk_type: PkType = "auto",
) -> None:
    """Create a record, failing if one already exists at the same key.

    Uses the ``POLICY_EXISTS_CREATE_ONLY`` write policy so a collision raises
    :class:`aerospike_py.RecordExistsError` (which the HTTP router translates
    to a 409 response).

    Raises:
        RecordExistsError: a record already exists at ``(namespace, set, pk)``.
        ValueError: ``pk_type`` was explicit but ``pk`` could not be parsed.
    """
    resolved = resolve_pk(pk, pk_type)
    policy = {**POLICY_WRITE, "exists": aerospike_py.POLICY_EXISTS_CREATE_ONLY}
    await client.put((namespace, set_name, resolved), bins, policy=policy)


async def update_record(
    client: aerospike_py.AsyncClient,
    namespace: str,
    set_name: str,
    pk: str,
    bins: dict[str, Any],
    pk_type: PkType = "auto",
) -> None:
    """Update an existing record, failing if it does not already exist.

    Uses ``POLICY_EXISTS_UPDATE_ONLY`` so a missing record raises
    :class:`aerospike_py.RecordNotFound` (translated by the HTTP router
    to a 404 response). The plain ``UPDATE`` policy would *create* the
    record on a miss — :func:`create_record` is the explicit create path;
    this primitive is strictly an update.

    Raises:
        RecordNotFound: no record exists at ``(namespace, set, pk)``.
        ValueError: ``pk_type`` was explicit but ``pk`` could not be parsed.
    """
    resolved = resolve_pk(pk, pk_type)
    policy = {**POLICY_WRITE, "exists": aerospike_py.POLICY_EXISTS_UPDATE_ONLY}
    await client.put((namespace, set_name, resolved), bins, policy=policy)


async def delete_bin(
    client: aerospike_py.AsyncClient,
    namespace: str,
    set_name: str,
    pk: str,
    bin_name: str,
    pk_type: PkType = "auto",
) -> None:
    """Remove a single bin from an existing record.

    Wraps :meth:`aerospike_py.AsyncClient.remove_bin`, which sets the named
    bin(s) to nil on the server. Removing the last bin from a record makes
    the whole record disappear server-side — that's standard Aerospike
    behaviour and not something we paper over here.

    Raises:
        RecordNotFound: the record does not exist.
        ValueError: ``pk_type`` was explicit but ``pk`` could not be parsed.
    """
    resolved = resolve_pk(pk, pk_type)
    await client.remove_bin((namespace, set_name, resolved), [bin_name])


async def truncate_set(
    client: aerospike_py.AsyncClient,
    namespace: str,
    set_name: str,
    before_lut: int | None = None,
) -> None:
    """Truncate every record in ``namespace.set_name`` (optionally up to a LUT).

    ``before_lut`` is the cutoff in nanoseconds since CITRUS epoch (the
    aerospike-py ``truncate`` API's ``nanos`` parameter). ``None`` means
    "truncate everything currently in the set". A positive value targets
    only records whose last-update-time is below that threshold.

    Explicit ``before_lut=0`` is rejected: the underlying info command
    treats ``lut=0`` as "no cutoff" (i.e. truncate-all), which would
    silently turn a buggy caller passing literal zero into a full
    truncation. Forcing ``ValueError`` makes the contract explicit —
    callers that genuinely want a full truncate must pass ``None``.

    Internally this becomes the ``truncate-namespace:namespace=...;set=...
    [;lut=...]`` info command — aerospike-py's :meth:`AsyncClient.truncate`
    issues it for us so we don't have to format the wire string by hand.
    """
    if before_lut is not None and before_lut <= 0:
        raise ValueError(
            "before_lut must be a positive nanosecond value; pass before_lut=None to truncate every record in the set"
        )
    nanos = before_lut if before_lut is not None else 0
    await client.truncate(namespace, set_name, nanos)


async def put_record(client: aerospike_py.AsyncClient, body: RecordWriteRequest) -> Record:
    """Write a record (create or update) and return the persisted state.

    The key's particle type comes from ``body.pk_type`` (``"auto"`` by default).
    Writes do not fall back: the resolved type is what gets persisted on disk,
    so callers that care should pass an explicit ``pk_type`` to avoid creating
    a record under a particle type that subsequent reads can't find.

    Returns:
        The freshly read-back ``Record`` so the response can carry the
        server-assigned generation/ttl.

    Raises:
        PrimaryKeyMissing: ``body.key`` omits namespace, set, or pk.
        ValueError: explicit ``pk_type`` rejected the resolved value, or
            ``body.bins`` is empty (a write needs at least one bin).
    """
    k = body.key
    if not k.namespace:
        raise PrimaryKeyMissing("namespace")
    if not k.set:
        raise PrimaryKeyMissing("set")
    if not k.pk:
        raise PrimaryKeyMissing("pk")
    # ``RecordWriteRequest.bins`` is ``dict[str, BinValue]`` with no
    # min-length constraint, so pydantic accepts ``bins={}``. An Aerospike
    # write with zero bins is not a meaningful create/update — aerospike-py
    # surfaces it as a server-side parameter error that would otherwise
    # escape as an opaque HTTP 500. Reject it here so the router maps it to
    # a clear 400 instead.
    if not body.bins:
        raise ValueError("at least one bin is required to write a record")

    key_tuple = (k.namespace, k.set, resolve_pk(k.pk, body.pk_type))

    meta: WriteMeta | None = None
    if body.ttl is not None:
        meta = WriteMeta(ttl=body.ttl)

    await client.put(key_tuple, body.bins, meta=meta, policy=POLICY_WRITE)
    return await client.get(key_tuple, policy=POLICY_READ)


# ---------------------------------------------------------------------------
# Service entry points — list / filter scans
# ---------------------------------------------------------------------------


async def list_records(
    client: aerospike_py.AsyncClient,
    namespace: str,
    set_name: str,
    page_size: int,
) -> ListRecordsResult:
    """Scan a set and return up to ``page_size`` records.

    Empty / sparse namespaces can make the underlying scan raise
    (aerospike-py issue #259). Treat those as "no records" and return an
    empty page rather than propagate. ``RustPanicError`` (#280) is *not*
    caught here — that's a real per-stream blocker handled by its dedicated
    422 exception handler at the HTTP layer.

    Connectivity / timeout / backpressure errors (``ClusterError``,
    ``AerospikeTimeoutError``, ``BackpressureError``) are intentionally
    re-raised so the global exception handlers in :mod:`main` can surface
    them as 503/504 instead of being silently swallowed into an empty
    HTTP 200 — a dead cluster must not look like an empty set.
    """
    set_total = await _get_set_object_count(client, namespace, set_name)

    limit = min(page_size, MAX_QUERY_RECORDS)
    policy: dict[str, Any] = {**POLICY_QUERY, "max_records": limit}
    q = client.query(namespace, set_name)
    try:
        raw_results: list[Record] = await q.results(policy)
    except AerospikeError as exc:
        # Connectivity / timeout / backpressure must propagate — the global
        # handlers map these to 503/504. Only narrow scan/query errors get
        # converted to an empty page (issue #259 workaround).
        if isinstance(exc, ClusterError | AerospikeTimeoutError | BackpressureError):
            raise
        logger.exception("Query failed for ns=%s set=%s; returning empty page", namespace, set_name)
        raw_results = []

    # When the scan returned a full page, there is more data regardless of
    # set_total. set_total is an independent info-command estimate that can
    # lag the actual scan on an eventually-consistent set, which would
    # otherwise make has_more falsely False on a full page.
    has_more = True if len(raw_results) >= limit else set_total > len(raw_results)

    return ListRecordsResult(
        records=raw_results,
        total=set_total,
        page=1,
        page_size=page_size,
        has_more=has_more,
        total_estimated=True,
    )


async def filter_records(client: aerospike_py.AsyncClient, body: FilteredQueryRequest) -> FilterRecordsResult:
    """Scan with optional PK pattern + bin filters and return a page.

    PK lookup short-circuits to ``client.get`` when ``pk_match_mode='exact'``
    so a pure-key fetch never triggers a scan. ``prefix`` and ``regex`` modes
    compile the PK pattern into an expression and run a server-side scan.

    Raises:
        SetRequiredForPkLookup: PK pattern provided without a set scope.
        InvalidPkPattern: regex/prefix could not be compiled.
    """
    start_time = time.monotonic()

    pk_target = body.pk_pattern or body.primary_key

    if pk_target and not body.set:
        raise SetRequiredForPkLookup()

    # PK exact short-circuit. Falls back to alternate particle type on
    # NOT_FOUND when pk_type='auto'. Prefix/regex skip this branch.
    if pk_target and body.pk_match_mode == "exact":
        # The ``pk_target and not body.set`` branch above already raises
        # SetRequiredForPkLookup, so ``body.set`` is guaranteed non-empty
        # here. Re-check explicitly (rather than ``assert``) so the
        # invariant survives ``python -O``, where ``assert`` is stripped.
        if body.set is None:
            raise SetRequiredForPkLookup()
        resolved = resolve_pk(pk_target, body.pk_type)
        try:
            raw_record = await get_with_pk_fallback(
                client,
                (body.namespace, body.set, resolved),
                pk_target,
                body.pk_type,
                POLICY_READ,
            )
            raw_results: list[Record] = [raw_record]
        except RecordNotFound:
            raw_results = []

        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        return FilterRecordsResult(
            records=raw_results,
            total=len(raw_results),
            page=1,
            page_size=body.page_size,
            has_more=False,
            execution_time_ms=elapsed_ms,
            scanned_records=len(raw_results),
            returned_records=len(raw_results),
            total_estimated=False,
        )

    # Build expressions BEFORE constructing the query so a bad pattern
    # surfaces as InvalidPkPattern without ever touching the client.query
    # path (and lets the router translate to HTTP 400).
    pk_expr: dict | None = None
    try:
        if pk_target is not None:
            if body.pk_match_mode == "prefix":
                pk_expr = build_pk_filter_expression(pk_target, "prefix")
            elif body.pk_match_mode == "regex":
                pk_expr = build_pk_filter_expression(pk_target, "regex")
    except InvalidPkPatternError as e:
        raise InvalidPkPattern(str(e)) from e

    bin_expr = build_expression(body.filters) if body.filters else None

    # Build query
    q = client.query(body.namespace, body.set or "")

    if body.predicate:
        # build_predicate raises ``UnknownPredicateOperator`` (a ``ValueError``)
        # for unknown operators — the HTTP router catches it via
        # ``utils.build_predicate``'s adapter.
        q.where(build_predicate(body.predicate))

    if body.select_bins:
        q.select(*body.select_bins)

    # Build policy with server-side max_records limit to prevent OOM.
    #
    # For paginated filter queries we fetch ONE extra record beyond the page
    # size so we can detect "is there at least one more record" without an
    # extra round trip. The fetched +1 record is dropped before responding.
    has_filters = body.filters is not None or body.predicate is not None or pk_expr is not None
    fetch_limit = min(
        body.max_records or MAX_QUERY_RECORDS,
        MAX_QUERY_RECORDS,
        body.page_size + 1,
    )

    policy: dict[str, Any] = {**POLICY_QUERY, "max_records": fetch_limit}
    if bin_expr is not None and pk_expr is not None:
        policy["filter_expression"] = exp.and_(pk_expr, bin_expr)
    elif pk_expr is not None:
        policy["filter_expression"] = pk_expr
    elif bin_expr is not None:
        policy["filter_expression"] = bin_expr

    try:
        raw_results = await q.results(policy)
    except AerospikeError as exc:
        # Connectivity / timeout / backpressure must propagate so the global
        # handlers in :mod:`main` can surface them as 503/504. Without this
        # gate a dead cluster looks like an empty result page (HTTP 200) and
        # silently masks the outage from the UI.
        if isinstance(exc, ClusterError | AerospikeTimeoutError | BackpressureError):
            raise
        # Empty/sparse-namespace failure mode (aerospike-py #259). Log at
        # exception level so operators can still find the underlying cause
        # in logs — pattern + filter context goes in the message so user-
        # supplied PK patterns are reproducible.
        logger.exception(
            "Filtered query failed for ns=%s set=%s pk_mode=%s pk_pattern=%r has_filters=%s; returning empty page",
            body.namespace,
            body.set,
            body.pk_match_mode,
            pk_target,
            body.filters is not None,
        )
        raw_results = []

    elapsed_ms = int((time.monotonic() - start_time) * 1000)
    fetched = len(raw_results)
    has_more = fetched > body.page_size
    if has_more:
        raw_results = raw_results[: body.page_size]
    returned = len(raw_results)

    # Determine total / scanned counts. With server-side max_records the
    # returned count is capped — it does not reflect the true number of
    # records scanned by the Aerospike server. For unfiltered scans we use
    # the info command to get the real set size.
    if has_filters:
        set_total = returned + (1 if has_more else 0)  # lower bound
        scanned = returned  # lower bound; actual server-side scan may be higher
        total_estimated = True
    else:
        set_total = await _get_set_object_count(client, body.namespace, body.set or "")
        scanned = set_total  # info-based: represents all objects in the set
        total_estimated = True

    return FilterRecordsResult(
        records=raw_results,
        total=set_total,
        page=1,
        page_size=body.page_size,
        has_more=has_more,
        execution_time_ms=elapsed_ms,
        scanned_records=scanned,
        returned_records=returned,
        total_estimated=total_estimated,
    )
