"""Utilities for parsing Aerospike info protocol responses."""

from __future__ import annotations

from collections.abc import Sequence


def parse_kv_pairs(response: str, sep: str = ";") -> dict[str, str]:
    """Parse ``"key=val;key2=val2"`` into a dict."""
    result: dict[str, str] = {}
    if not response:
        return result
    for part in response.strip().split(sep):
        if "=" in part:
            k, v = part.split("=", 1)
            result[k.strip()] = v.strip()
    return result


def parse_list(response: str, sep: str = ";") -> list[str]:
    """Parse ``"item1;item2;item3"`` into a list."""
    if not response or not response.strip():
        return []
    return [item.strip() for item in response.strip().split(sep) if item.strip()]


def parse_records(response: str, record_sep: str = ";", field_sep: str = ":") -> list[dict[str, str]]:
    """Parse multi-record info response into a list of dicts.

    Each record is separated by *record_sep*, and fields within a record
    are ``key=value`` pairs separated by *field_sep*.
    """
    records: list[dict[str, str]] = []
    if not response or not response.strip():
        return records
    for record_str in response.strip().split(record_sep):
        if not record_str.strip():
            continue
        record: dict[str, str] = {}
        for field in record_str.strip().split(field_sep):
            if "=" in field:
                k, v = field.split("=", 1)
                record[k.strip()] = v.strip()
        if record:
            records.append(record)
    return records


def safe_int(value: str | None, default: int = 0) -> int:
    """Convert string to int safely."""
    if value is None:
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def safe_bool(value: str | None) -> bool:
    """Convert ``"true"``/``"false"`` string to bool."""
    if value is None:
        return False
    return value.strip().lower() == "true"


# ---------------------------------------------------------------------------
# Multi-node aggregation helpers
# ---------------------------------------------------------------------------


def aggregate_node_kv(
    info_all_results: Sequence[tuple[str, int | None, str]],
    keys_to_sum: set[str] | frozenset[str] = frozenset(),
    keys_to_min: set[str] | frozenset[str] = frozenset(),
) -> dict[str, str]:
    """Aggregate ``info_all()`` kv-pair responses from multiple nodes.

    * Keys in *keys_to_sum* are summed as integers across nodes.
    * Keys in *keys_to_min* take the minimum value across nodes.
    * All other keys use the first node's value.

    Error responses (``err is not None``) are silently skipped.
    """
    merged: dict[str, str] = {}
    sum_accum: dict[str, int] = {}
    min_accum: dict[str, int] = {}

    for _name, err, resp in info_all_results:
        if err:
            continue
        kv = parse_kv_pairs(resp)
        if not merged:
            merged.update(kv)
        for k, v in kv.items():
            if k in keys_to_sum:
                sum_accum[k] = sum_accum.get(k, 0) + safe_int(v)
            elif k in keys_to_min:
                cur = safe_int(v)
                min_accum[k] = min(min_accum.get(k, cur), cur)

    for k, total in sum_accum.items():
        merged[k] = str(total)
    for k, val in min_accum.items():
        merged[k] = str(val)

    return merged


def aggregate_set_records(
    info_all_results: Sequence[tuple[str, int | None, str]],
    replication_factor: int = 1,
) -> list[dict]:
    """Aggregate set info from all nodes into deduplicated set records.

    Groups by set name, sums ``objects``, ``tombstones``, ``memory_data_bytes``.
    ``objects`` is divided by ``effective_rf = min(rf, responding_node_count)``
    to approximate the unique record count.

    Returns a list of dicts with keys: ``name``, ``objects``, ``tombstones``,
    ``memory_data_bytes``, ``stop_writes_count``, ``node_count``.
    """
    set_data: dict[str, dict] = {}
    responding_nodes = 0

    for _name, err, resp in info_all_results:
        if err:
            continue
        responding_nodes += 1
        for rec in parse_records(resp):
            set_name = rec.get("set", rec.get("set_name", ""))
            if not set_name:
                continue
            if set_name not in set_data:
                set_data[set_name] = {
                    "objects": 0,
                    "tombstones": 0,
                    "memory_data_bytes": 0,
                    "stop_writes_count": 0,
                    "node_count": 0,
                }
            entry = set_data[set_name]
            entry["objects"] += safe_int(rec.get("objects"))
            entry["tombstones"] += safe_int(rec.get("tombstones"))
            entry["memory_data_bytes"] += safe_int(rec.get("memory_data_bytes"))
            entry["stop_writes_count"] = max(
                entry["stop_writes_count"],
                safe_int(rec.get("stop-writes-count", rec.get("stop_writes_count"))),
            )
            entry["node_count"] += 1

    effective_rf = min(replication_factor, responding_nodes) if responding_nodes > 0 else 1

    result = []
    for name, data in set_data.items():
        unique_objects = data["objects"] // effective_rf if effective_rf > 0 else data["objects"]
        result.append(
            {
                "name": name,
                "objects": unique_objects,
                "tombstones": data["tombstones"] // effective_rf if effective_rf > 0 else data["tombstones"],
                "memory_data_bytes": data["memory_data_bytes"],
                "stop_writes_count": data["stop_writes_count"],
                "node_count": data["node_count"],
            }
        )

    return result
