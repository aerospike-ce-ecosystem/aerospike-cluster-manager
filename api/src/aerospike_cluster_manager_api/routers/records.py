from __future__ import annotations

import logging
from typing import Literal

from aerospike_py import Record
from aerospike_py.exception import RecordNotFound
from fastapi import APIRouter, HTTPException, Path, Query, Request
from starlette.responses import Response

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.converters import record_to_model
from aerospike_cluster_manager_api.dependencies import AerospikeClient, VerifiedConnId
from aerospike_cluster_manager_api.models.note import StoredPkType
from aerospike_cluster_manager_api.models.query import FilteredQueryRequest, FilteredQueryResponse
from aerospike_cluster_manager_api.models.record import (
    AerospikeRecord,
    RecordListResponse,
    RecordWriteRequest,
)
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.services import records_service
from aerospike_cluster_manager_api.services.records_service import (
    InvalidPkPattern,
    PrimaryKeyMissing,
    SetRequiredForPkLookup,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/records", tags=["records"])


def _raw_pk_to_stored(pk: object) -> tuple[str, StoredPkType] | None:
    """Map an aerospike-py raw key value to (pk_text, pk_type).

    Returns ``None`` when the key has no userKey (digest-only record), since
    1차 release doesn't support notes for those.
    """
    if isinstance(pk, bool):
        # ``bool`` is a subclass of ``int`` in Python — guard explicitly so
        # True/False keys are not mis-tagged as INTEGER.
        return None
    if isinstance(pk, int):
        return (str(pk), "int")
    if isinstance(pk, bytes | bytearray):
        return (bytes(pk).hex(), "bytes")
    if isinstance(pk, str) and pk:
        return (pk, "string")
    return None


def _extract_pk_pair(rec: Record) -> tuple[str, StoredPkType] | None:
    """Pull (pk_text, pk_type) from a raw aerospike-py Record's key tuple."""
    key = rec.key
    if key is None or len(key) <= 2:
        return None
    return _raw_pk_to_stored(key[2])


async def _attach_record_notes(
    conn_id: str,
    namespace: str,
    set_name: str,
    raw_records: list[Record],
    models: list[AerospikeRecord],
) -> None:
    """Populate ``models[i].note`` from cluster-manager metaDB.

    Single batch SQL keyed by the (pk_text, pk_type) pairs extracted from the
    raw aerospike-py records. Records without a userKey are skipped silently
    (they cannot have notes in 1차 release). When the metaDB has not been
    initialised (unit-test paths), the call is a no-op.
    """
    if not set_name or not raw_records:
        return
    pairs: list[tuple[str, StoredPkType]] = []
    pair_for_index: list[tuple[str, StoredPkType] | None] = []
    for raw in raw_records:
        pair = _extract_pk_pair(raw)
        pair_for_index.append(pair)
        if pair is not None:
            pairs.append(pair)
    if not pairs:
        return
    try:
        notes = await db.batch_get_record_notes(conn_id, namespace, set_name, pairs)
    except db.DBNotInitialized:
        logger.warning(
            "Skipping record-note injection for conn_id=%s ns=%s set=%s: metaDB not initialized",
            conn_id,
            namespace,
            set_name,
        )
        return
    if not notes:
        return
    for model, pair in zip(models, pair_for_index, strict=True):
        if pair is not None and pair in notes:
            model.note = notes[pair]


async def _get_record_note_text(
    conn_id: str,
    namespace: str,
    set_name: str,
    pk_text: str,
    pk_type: StoredPkType,
) -> str | None:
    """Single-record note text fetch with the metaDB-not-initialised guard.

    Returns ``None`` either when no note exists or when the metaDB layer
    has not been initialised (unit-test paths). Other exceptions
    propagate — only the dedicated ``DBNotInitialized`` sentinel is
    swallowed.
    """
    try:
        rec = await db.get_record_note(conn_id, namespace, set_name, pk_text, pk_type)
    except db.DBNotInitialized:
        logger.warning(
            "Skipping record-note lookup for conn_id=%s ns=%s set=%s pk=%s: metaDB not initialized",
            conn_id,
            namespace,
            set_name,
            pk_text,
        )
        return None
    return rec.note if rec else None


@router.get(
    "/{conn_id}",
    summary="List records",
    description="Retrieve records from a namespace and set with a server-side limit.",
)
async def get_records(
    client: AerospikeClient,
    conn_id: VerifiedConnId,
    ns: str = Query(..., min_length=1),
    set: str = "",
    pageSize: int = Query(25, ge=1, le=500),
) -> RecordListResponse:
    """Retrieve records from a namespace and set (limited by pageSize).

    Note: if any record in the scan stream contains a particle type the native
    client cannot decode (e.g. PYTHON_BLOB / JAVA_BLOB written by a legacy
    language-specific client — see aerospike-py issue #280), the underlying
    aerospike-core stream is broken at that record and the whole request
    surfaces as HTTP 422 (``RustPanicError``). Per-record skipping is not
    available without an aerospike-core fork.
    """
    result = await records_service.list_records(client, ns, set, page_size=pageSize)
    models = [record_to_model(r) for r in result.records]
    await _attach_record_notes(conn_id, ns, set, result.records, models)
    return RecordListResponse(
        records=models,
        total=result.total,
        page=result.page,
        pageSize=result.page_size,
        hasMore=result.has_more,
        totalEstimated=result.total_estimated,
    )


@router.get(
    "/{conn_id}/detail",
    summary="Get record detail",
    description="Retrieve a single record identified by namespace, set, and primary key.",
)
async def get_record_detail(
    client: AerospikeClient,
    conn_id: VerifiedConnId,
    ns: str = Query(..., min_length=1),
    set: str = Query(...),
    pk: str = Query(..., min_length=1),
    pk_type: Literal["auto", "string", "int", "bytes"] = Query("auto"),
) -> AerospikeRecord:
    """Retrieve a single record identified by namespace, set, and primary key.

    When ``pk_type='auto'`` (default), the lookup falls back to the alternate
    particle type on NOT_FOUND — fixing the case where a numeric-string key
    (e.g. ``"23404907"``) was stored as STRING but would otherwise be probed
    as INTEGER. Pass an explicit ``pk_type`` to disable the fallback.
    """
    try:
        raw_result = await records_service.get_record(client, ns, set, pk, pk_type)
    except ValueError as exc:
        # Explicit pk_type with unparseable pk → 400.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RecordNotFound as exc:
        raise HTTPException(
            status_code=404,
            detail="Record not found (tried both string and integer key types)",
        ) from exc
    model = record_to_model(raw_result)
    # Use the resolved (post-auto-fallback) particle type from the raw key —
    # not the request's ``pk_type`` query param, which may be 'auto'. This
    # keeps the note lookup consistent with how the record was actually
    # stored.
    pair = _extract_pk_pair(raw_result)
    if pair is not None:
        model.note = await _get_record_note_text(conn_id, ns, set, pair[0], pair[1])
    return model


@router.post(
    "/{conn_id}",
    status_code=201,
    summary="Create or update record",
    description="Write a record to Aerospike with the specified key, bins, and optional TTL.",
)
@limiter.limit("30/minute")
async def put_record(
    request: Request,
    body: RecordWriteRequest,
    client: AerospikeClient,
    conn_id: VerifiedConnId,
) -> AerospikeRecord:
    """Write a record to Aerospike with the specified key, bins, and optional TTL.

    The key's particle type comes from ``body.key.pk_type`` ("auto" by default).
    Writes do not fall back: the resolved type is what gets persisted on disk,
    so callers that care should pass an explicit ``pk_type`` to avoid creating
    a record under a particle type that subsequent reads can't find.
    """
    # ``conn_id`` is unused inside the body — its only job is to trigger
    # the workspace ACL via :data:`VerifiedConnId` before the destructive
    # call reaches the service layer. Keep the parameter present so the
    # dependency runs.
    _ = conn_id
    try:
        result = await records_service.put_record(client, body)
    except PrimaryKeyMissing as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return record_to_model(result)


@router.delete(
    "/{conn_id}",
    status_code=204,
    summary="Delete record",
    description="Delete a record identified by namespace, set, and primary key.",
)
@limiter.limit("30/minute")
async def delete_record(
    request: Request,
    client: AerospikeClient,
    ns: str = Query(..., min_length=1),
    set: str = Query(..., min_length=1),
    pk: str = Query(..., min_length=1),
    pk_type: Literal["auto", "string", "int", "bytes"] = Query("auto"),
) -> Response:
    """Delete a record identified by namespace, set, and primary key.

    Deletes do not fall back to the alternate type even in ``auto`` mode: a
    delete that targets the wrong particle type would silently no-op (the
    record at the *other* type stays put), and a fallback could mask that
    fact. Pass an explicit ``pk_type`` to be sure of which record gets removed.

    DELETE is idempotent — if the underlying record is already gone we still
    return 204. Letting ``RecordNotFound`` propagate would translate to 404
    via the global handler and break common UI / CLI retry patterns where the
    same DELETE is replayed after a network blip.
    """
    try:
        await records_service.delete_record(client, ns, set, pk, pk_type)
    except RecordNotFound:
        # Idempotent: the record is already absent, which is the desired
        # post-condition of DELETE.
        pass
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(status_code=204)


@router.delete(
    "/{conn_id}/{namespace}/{set_name}/{pk}/bins/{bin_name}",
    status_code=204,
    summary="Delete a bin from a record",
    description="Remove a single bin from an existing record (sets it to nil server-side).",
)
@limiter.limit("30/minute")
async def delete_record_bin(
    request: Request,
    client: AerospikeClient,
    conn_id: VerifiedConnId,
    namespace: str = Path(..., min_length=1, max_length=31),
    set_name: str = Path(..., min_length=1, max_length=63),
    pk: str = Path(..., min_length=1, max_length=1024),
    bin_name: str = Path(..., min_length=1, max_length=15),
    pk_type: Literal["auto", "string", "int", "bytes"] = Query("auto"),
) -> Response:
    """Remove a single bin from an existing record.

    Exposed as ``DELETE /records/{conn_id}/{namespace}/{set_name}/{pk}/bins/{bin_name}``;
    ackoctl drives bin deletion through this REST surface. Removing the
    last bin causes the whole record to disappear server-side — that's
    standard Aerospike behaviour, not something this endpoint papers over.

    ``pk_type`` semantics match :func:`update_record_note` and
    :func:`delete_record_note`: ``auto`` (default) lets the heuristic
    decide between INTEGER and STRING; pass an explicit value for
    digit-only string keys to avoid misclassification. Unlike record
    reads, bin delete does not fall back to the alternate type — passing
    the wrong ``pk_type`` would silently no-op (RecordNotFound), so be
    explicit when in doubt.

    Returns 204 on success, 404 when the record (or its bin) is absent.
    Conn id ``conn_id`` is gated by the workspace ACL via
    :data:`VerifiedConnId`.
    """
    # ``conn_id`` is unused inside the body — its only job is to trigger
    # the workspace ACL via :data:`VerifiedConnId` before the destructive
    # call reaches the service layer. Keep the parameter present so the
    # dependency runs.
    _ = conn_id
    try:
        await records_service.delete_bin(client, namespace, set_name, pk, bin_name, pk_type)
    except RecordNotFound as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Record '{namespace}/{set_name}/{pk}' not found",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(status_code=204)


@router.post(
    "/{conn_id}/filter",
    summary="Filtered record scan",
    description="Scan records with optional expression filters and pagination.",
)
@limiter.limit("30/minute")
async def get_filtered_records(
    request: Request,
    body: FilteredQueryRequest,
    client: AerospikeClient,
    conn_id: VerifiedConnId,
) -> FilteredQueryResponse:
    """Scan records with optional expression filters and pagination."""
    try:
        result = await records_service.filter_records(client, body)
    # ``InvalidPkPattern`` subclasses ``ValueError`` — keep it first so its
    # dedicated message wins over the generic ValueError handler below.
    except InvalidPkPattern as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SetRequiredForPkLookup as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (ValueError, TypeError) as exc:
        # Malformed filter conditions (e.g. binType=integer with a non-numeric
        # value, BETWEEN missing value2) make build_expression/build_predicate
        # raise ValueError/TypeError. Map them to 400 instead of a generic 500,
        # mirroring routers/query.py's ValueError→400 handling.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    models = [record_to_model(r) for r in result.records]
    # Filter scans always carry a set scope (SetRequiredForPkLookup is
    # raised above when not), so note injection has the (ns, set) it needs.
    if body.set:
        await _attach_record_notes(conn_id, body.namespace, body.set, result.records, models)
    return FilteredQueryResponse(
        records=models,
        total=result.total,
        page=result.page,
        pageSize=result.page_size,
        hasMore=result.has_more,
        executionTimeMs=result.execution_time_ms,
        scannedRecords=result.scanned_records,
        returnedRecords=result.returned_records,
        totalEstimated=result.total_estimated,
    )
