"""Shared helpers for database persistence layers.

Functions in this module are used by both the SQLite and PostgreSQL backends.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, Protocol, runtime_checkable

from aerospike_cluster_manager_api.models.connection import ConnectionProfile


@runtime_checkable
class DatabaseBackend(Protocol):
    """Contract that every database backend (SQLite, PostgreSQL) must satisfy."""

    async def init_db(self) -> None: ...

    async def close_db(self) -> None: ...

    async def check_health(self) -> bool: ...

    async def get_all_connections(self) -> list[ConnectionProfile]: ...

    async def get_connection(self, conn_id: str) -> ConnectionProfile | None: ...

    async def create_connection(self, conn: ConnectionProfile) -> None: ...

    async def update_connection(self, conn_id: str, data: dict) -> ConnectionProfile | None: ...

    async def delete_connection(self, conn_id: str) -> bool: ...


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
        description=merged.get("description"),
        createdAt=existing.createdAt,
        updatedAt=merged["updatedAt"],
    )
