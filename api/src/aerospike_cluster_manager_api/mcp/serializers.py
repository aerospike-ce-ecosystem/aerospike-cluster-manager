"""JSON-safe serialisation for aerospike-py records and bin values.

Sibling to :mod:`aerospike_cluster_manager_api.converters` — that module
returns a Pydantic ``AerospikeRecord`` shaped for the REST wire format
(camelCase fields, ``digest`` as hex). The MCP protocol embeds tool results
as JSON inside ``text``/``json`` content blocks, so the serializers here
emit a slightly different envelope tuned for AI clients:

* ``key``: ``{"namespace", "set", "user_key" | (omitted), "digest"}`` —
  ``user_key`` is omitted when the source record only carries a digest;
  ``digest`` is always base64 (round-trip safe across wire formats and
  more compact than hex).
* ``meta``: ``{"generation", "expiration", ...}`` — ``ttl`` from
  aerospike-py is renamed to ``expiration`` to match the more standard
  naming. Any extra fields surfaced by ``RecordMetadata`` (e.g.
  ``last_update_time``) flow through unchanged.
* ``bins``: ``{bin_name: serialised_value}`` — recursed via
  :func:`serialize_value`.

Bytes convention
----------------
Aerospike CDT supports raw ``bytes`` particles. JSON has no native byte
type, and emitting bytes as a bare string would collide with regular
string bins. We wrap them in a marker dict::

    {"_aerospike_bytes_b64": "<base64>"}

This is also used for ``user_key`` when it is bytes. The marker key is
exported as :data:`BYTES_MARKER_KEY` so downstream callers (MCP clients,
tests) can recognise and round-trip the value safely.

Module dependencies are intentionally limited to the standard library +
``aerospike_py``; no FastAPI or Pydantic so the same module is reusable
from MCP tool handlers without dragging in HTTP framework symbols.
"""

from __future__ import annotations

import base64
from collections.abc import Iterable, Mapping
from typing import Any

from aerospike_py import Record

# Public marker key for bytes values. Pinned via test so any change here is
# a breaking change for downstream consumers.
BYTES_MARKER_KEY = "_aerospike_bytes_b64"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def serialize_value(value: Any) -> Any:
    """Convert *value* into a JSON-safe Python primitive.

    Recursively handles lists, tuples, and dicts (including the GeoJSON
    dict shape ``{"type": ..., "coordinates": [...]}`` which is just a
    regular dict in aerospike-py). ``bytes`` and ``bytearray`` are
    wrapped in the marker dict described in the module docstring.

    Map keys that are not strings are coerced via :func:`str` so the
    result is :func:`json.dumps`-compatible; this matches what the
    Aerospike server itself does for non-string map keys when surfaced
    over the REST API.
    """
    # bool must come before int because ``isinstance(True, int)`` is True.
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (int, float, str)):
        return value
    if isinstance(value, (bytes, bytearray)):
        return _encode_bytes(value)
    if isinstance(value, Mapping):
        return {str(k): serialize_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [serialize_value(v) for v in value]
    # Anything else (e.g. an unexpected NamedTuple) is forced through
    # ``str`` rather than crashing — being lossy beats blocking a tool call.
    return str(value)


def serialize_bins(bins: Mapping[str, Any]) -> dict[str, Any]:
    """Convert a ``{bin_name: value}`` mapping into JSON-safe form.

    Bin names are always strings on the wire; the value side runs through
    :func:`serialize_value` so nested CDTs (lists/maps) and bytes are
    handled correctly.
    """
    return {str(name): serialize_value(value) for name, value in bins.items()}


def serialize_record(record: Record) -> dict[str, Any]:
    """Convert an aerospike-py :class:`Record` into a JSON-safe dict.

    The output shape is::

        {
          "key":  {"namespace": str, "set": str,
                   "user_key": <serialised>,    # omitted if None
                   "digest":   <base64> | None},
          "meta": {"generation": int, "expiration": int, ...},
          "bins": {bin_name: serialised_value, ...},
        }

    ``meta`` accepts both the modern :class:`RecordMetadata` NamedTuple
    and the legacy ``dict`` shape. Any extra fields on the source meta
    (e.g. ``last_update_time``) pass through unchanged so AI clients can
    surface them when present.
    """
    return {
        "key": _serialize_key(record.key),
        "meta": _serialize_meta(record.meta),
        "bins": serialize_bins(record.bins or {}),
    }


def serialize_records(records: Iterable[Record]) -> list[dict[str, Any]]:
    """Apply :func:`serialize_record` to each record in *records*."""
    return [serialize_record(rec) for rec in records]


# ---------------------------------------------------------------------------
# K8s helpers (Phase 2 -- #305)
# ---------------------------------------------------------------------------
#
# The K8s MCP tools return existing Pydantic models (``K8sClusterSummary``,
# ``K8sPodStatus``, ``K8sClusterEvent``) that the REST routers also emit.
# These helpers are thin wrappers around ``model_dump(by_alias=True)`` so the
# wire shape (camelCase keys: ``connectionId``, ``isReady``, ``podIP``)
# matches the OpenAPI doc -- what the LLM sees through MCP equals what it
# would see calling the REST API directly.


def k8s_cluster_summary(model: Any) -> dict[str, Any]:
    """Convert a ``K8sClusterSummary`` instance to a JSON-safe dict."""
    return model.model_dump(by_alias=True)


def k8s_pod(model: Any) -> dict[str, Any]:
    """Convert a ``K8sPodStatus`` instance to a JSON-safe dict."""
    return model.model_dump(by_alias=True)


def k8s_event(model: Any) -> dict[str, Any]:
    """Convert a ``K8sClusterEvent`` instance to a JSON-safe dict."""
    return model.model_dump(by_alias=True)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _encode_bytes(value: bytes | bytearray) -> dict[str, str]:
    """Wrap *value* in the documented base64 marker dict."""
    return {BYTES_MARKER_KEY: base64.b64encode(bytes(value)).decode("ascii")}


def _serialize_key(key: Any) -> dict[str, Any]:
    """Serialise the aerospike-py key tuple ``(ns, set, user_key, digest)``.

    Mirrors :func:`converters._serialise_key` but emits the MCP shape:
    ``user_key`` is included only when present, and ``digest`` is base64
    rather than hex. Tolerates partial tuples (any of the trailing fields
    may be absent or ``None``) so the function does not raise on edge
    cases like digest-only or namespace-only records returned by certain
    info commands.
    """
    if key is None:
        key = ()

    namespace = key[0] if len(key) > 0 else ""
    set_name = key[1] if len(key) > 1 else ""
    raw_user_key = key[2] if len(key) > 2 else None
    raw_digest = key[3] if len(key) > 3 else None

    result: dict[str, Any] = {
        "namespace": namespace if namespace is not None else "",
        "set": set_name if set_name is not None else "",
        "digest": _encode_digest(raw_digest),
    }
    if raw_user_key is not None:
        result["user_key"] = serialize_value(raw_user_key)
    return result


def _encode_digest(digest: Any) -> str | None:
    """Encode a digest value as base64, or None if it isn't bytes."""
    if isinstance(digest, (bytes, bytearray)):
        return base64.b64encode(bytes(digest)).decode("ascii")
    return None


def _serialize_meta(meta: Any) -> dict[str, Any]:
    """Normalise meta into ``{"generation", "expiration", ...}``.

    aerospike-py exposes meta as a :class:`RecordMetadata` NamedTuple
    (``gen``, ``ttl``) on the read path; certain legacy/test code uses a
    plain dict. We accept both and pass any extra fields through so the
    MCP client gets every piece of metadata the server returned.
    """
    if meta is None:
        return {"generation": 0, "expiration": 0}

    if isinstance(meta, Mapping):
        result: dict[str, Any] = {
            "generation": int(meta.get("gen", 0) or 0),
            "expiration": int(meta.get("ttl", 0) or 0),
        }
        for key, value in meta.items():
            if key in ("gen", "ttl"):
                continue
            result[str(key)] = serialize_value(value)
        return result

    # NamedTuple-like (e.g. RecordMetadata)
    if hasattr(meta, "_asdict"):
        as_dict = meta._asdict()
        result = {
            "generation": int(as_dict.pop("gen", 0) or 0),
            "expiration": int(as_dict.pop("ttl", 0) or 0),
        }
        for key, value in as_dict.items():
            result[str(key)] = serialize_value(value)
        return result

    # Bare object with gen/ttl attributes — best effort.
    gen = getattr(meta, "gen", 0)
    ttl = getattr(meta, "ttl", 0)
    return {"generation": int(gen or 0), "expiration": int(ttl or 0)}
