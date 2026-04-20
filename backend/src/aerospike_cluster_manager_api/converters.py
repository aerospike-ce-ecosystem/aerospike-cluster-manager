"""Convert Aerospike Record objects to Pydantic models."""

from __future__ import annotations

from typing import Any

from aerospike_py import Record

from aerospike_cluster_manager_api.models.record import AerospikeRecord, RecordKey, RecordMeta


def record_to_model(rec: Record) -> AerospikeRecord:
    """Convert an aerospike-py :class:`Record` to :class:`AerospikeRecord`.

    ``Record`` is a NamedTuple with ``key``, ``meta``, and ``bins`` attributes.
    ``key``: ``(namespace, set, pk, digest_bytes)``
    ``meta``: ``{"gen": int, "ttl": int}``
    ``bins``: ``{bin_name: value, ...}``
    """
    key_tuple = rec.key if rec.key is not None else ()
    meta = rec.meta
    bins: dict[str, Any] = rec.bins or {}

    ns: str = key_tuple[0] if len(key_tuple) > 0 else ""
    set_name: str = key_tuple[1] if len(key_tuple) > 1 else ""
    pk: Any = key_tuple[2] if len(key_tuple) > 2 else ""
    digest: bytes | None = key_tuple[3] if len(key_tuple) > 3 else None

    digest_hex = digest.hex() if isinstance(digest, bytes | bytearray) else None

    # meta can be a RecordMetadata NamedTuple (gen, ttl, optional last_update_time) or a dict
    last_update_ms: int | None = None
    if meta is not None and hasattr(meta, "gen"):
        gen = meta.gen
        ttl = meta.ttl
        # aerospike-py may expose last_update_time or last_update_ms depending on version/read policy
        raw_lut = getattr(meta, "last_update_time", None) or getattr(meta, "last_update_ms", None)
        if isinstance(raw_lut, int) and raw_lut > 0:
            last_update_ms = raw_lut
    elif isinstance(meta, dict):
        gen = meta.get("gen", 0)
        ttl = meta.get("ttl", 0)
        raw_lut = meta.get("last_update_time") or meta.get("last_update_ms")
        if isinstance(raw_lut, int) and raw_lut > 0:
            last_update_ms = raw_lut
    else:
        gen = 0
        ttl = 0

    return AerospikeRecord(
        key=RecordKey(
            namespace=ns,
            set=set_name or "",
            pk=str(pk) if pk is not None else "",
            digest=digest_hex,
        ),
        meta=RecordMeta(
            generation=gen,
            ttl=ttl,
            lastUpdateMs=last_update_ms,
        ),
        bins=bins,
    )
