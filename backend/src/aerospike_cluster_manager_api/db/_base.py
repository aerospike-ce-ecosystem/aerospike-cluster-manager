"""Shared helpers for database persistence layers.

Functions in this module are used by both the SQLite and PostgreSQL backends.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from aerospike_cluster_manager_api.models.connection import ConnectionProfile


def row_to_profile(row: Any) -> ConnectionProfile:
    """Convert a database row (dict-like) to a ConnectionProfile model.

    Works with both ``sqlite3.Row`` and ``asyncpg.Record`` since both
    support ``row["column_name"]`` access.
    """
    hosts = row["hosts"]
    if isinstance(hosts, str):
        try:
            hosts = json.loads(hosts)
        except json.JSONDecodeError:
            hosts = [hosts]
    return ConnectionProfile(
        id=row["id"],
        name=row["name"],
        hosts=hosts,
        port=row["port"],
        clusterName=row["cluster_name"],
        username=row["username"],
        password=row["password"],
        color=row["color"],
        label=row["label"],
        label_color=row["label_color"],
        description=row["description"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def build_merged_profile(
    existing: ConnectionProfile,
    data: dict[str, Any],
    conn_id: str,
) -> ConnectionProfile:
    """Merge update data into an existing profile and return a new model.

    Sets ``updatedAt`` to the current UTC timestamp.
    """
    merged = existing.model_dump()
    merged.update(data)
    merged["updatedAt"] = datetime.now(UTC).isoformat()
    return ConnectionProfile(
        id=conn_id,
        name=merged["name"],
        hosts=merged["hosts"],
        port=merged["port"],
        clusterName=merged.get("clusterName"),
        username=merged.get("username"),
        password=merged.get("password"),
        color=merged["color"],
        label=merged.get("label"),
        label_color=merged.get("label_color"),
        description=merged.get("description"),
        createdAt=existing.createdAt,
        updatedAt=merged["updatedAt"],
    )
