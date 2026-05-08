"""MCP tools for Aerospike connection profile management.

This module exposes 8 connection tools that wrap the existing service
layer (:mod:`aerospike_cluster_manager_api.services.connections_service`)
and the live-client pool (:mod:`aerospike_cluster_manager_api.client_manager`):

* ``create_connection`` — create a new profile (mutation)
* ``get_connection`` — fetch one profile by id
* ``update_connection`` — partial update of a profile (mutation)
* ``delete_connection`` — delete a profile and close its live client (mutation)
* ``list_connections`` — list all profiles, optionally filtered by workspace
* ``connect`` — open / re-use a live ``AsyncClient`` and return a status snapshot
* ``disconnect`` — close and evict the live client for a connection
* ``test_connection`` — probe Aerospike connectivity without persisting

Design notes:

* Tools accept simple Python types (``str``, ``int``, ``list``, ``dict``)
  so the MCP SDK can derive a JSON Schema directly from the type hints.
* Field names are snake_case at the MCP boundary (idiomatic Python /
  MCP). Where the underlying pydantic request model uses camelCase
  (e.g. ``workspaceId``), the tool translates at construction time.
* Returns are always JSON-serialisable. Pydantic responses are
  ``model_dump()``-ed; the SDK does not always know how to serialise
  pydantic instances.
* The ``@tool`` decorator already wraps every body in the access-profile
  gate and ``map_aerospike_errors`` — do **not** apply them again here.
"""

from __future__ import annotations

import logging
from typing import Any

from aerospike_cluster_manager_api.client_manager import client_manager
from aerospike_cluster_manager_api.constants import INFO_NAMESPACES
from aerospike_cluster_manager_api.info_parser import parse_list
from aerospike_cluster_manager_api.mcp.registry import tool
from aerospike_cluster_manager_api.models.connection import (
    CreateConnectionRequest,
    TestConnectionRequest,
    UpdateConnectionRequest,
)
from aerospike_cluster_manager_api.services import connections_service
from aerospike_cluster_manager_api.services.connections_service import (
    ConnectionNotFoundError,
)

logger = logging.getLogger(__name__)


@tool(category="connection", mutation=True)
async def create_connection(
    name: str,
    hosts: list[str],
    port: int = 3000,
    username: str | None = None,
    password: str | None = None,
    color: str = "#0097D3",
    note: str | None = None,
    labels: dict[str, str] | None = None,
    workspace_id: str | None = None,
    cluster_name: str | None = None,
) -> dict[str, Any]:
    """Create a new Aerospike connection profile.

    Returns the persisted profile (without the password). Falls back to
    the built-in default workspace when ``workspace_id`` is omitted.
    ``cluster_name`` is the optional cluster identifier used by the
    Aerospike client tend (``cluster-name`` policy) — leave unset to
    discover the cluster name dynamically. ``note`` is a free-text
    operator memo (formerly ``description``).

    Mutation: requires ``ACM_MCP_ACCESS_PROFILE=full``; returns
    ``code=access_denied`` under READ_ONLY.
    """
    payload = CreateConnectionRequest(
        name=name,
        hosts=hosts,
        port=port,
        username=username,
        password=password,
        color=color,
        note=note,
        labels=labels,
        workspaceId=workspace_id,
        clusterName=cluster_name,
    )
    result = await connections_service.create_connection(payload)
    return result.model_dump()


@tool(category="connection", mutation=False)
async def get_connection(conn_id: str) -> dict[str, Any]:
    """Fetch a connection profile by id."""
    result = await connections_service.get_connection(conn_id)
    return result.model_dump()


@tool(category="connection", mutation=True)
async def update_connection(
    conn_id: str,
    name: str | None = None,
    hosts: list[str] | None = None,
    port: int | None = None,
    username: str | None = None,
    password: str | None = None,
    color: str | None = None,
    note: str | None = None,
    labels: dict[str, str] | None = None,
    workspace_id: str | None = None,
    cluster_name: str | None = None,
) -> dict[str, Any]:
    """Apply a partial update to a connection profile.

    Only fields explicitly supplied (non-``None``) are updated.
    ``cluster_name`` is the optional cluster identifier (``cluster-name``
    tend policy); pass it to update or set it. ``note`` is a free-text
    operator memo (formerly ``description``).

    Mutation: requires ``ACM_MCP_ACCESS_PROFILE=full``; returns
    ``code=access_denied`` under READ_ONLY.
    """
    update_kwargs: dict[str, Any] = {}
    if name is not None:
        update_kwargs["name"] = name
    if hosts is not None:
        update_kwargs["hosts"] = hosts
    if port is not None:
        update_kwargs["port"] = port
    if username is not None:
        update_kwargs["username"] = username
    if password is not None:
        update_kwargs["password"] = password
    if color is not None:
        update_kwargs["color"] = color
    if note is not None:
        update_kwargs["note"] = note
    if labels is not None:
        update_kwargs["labels"] = labels
    if workspace_id is not None:
        update_kwargs["workspaceId"] = workspace_id
    if cluster_name is not None:
        update_kwargs["clusterName"] = cluster_name

    payload = UpdateConnectionRequest(**update_kwargs)
    result = await connections_service.update_connection(conn_id, payload)
    return result.model_dump()


@tool(category="connection", mutation=True)
async def delete_connection(conn_id: str) -> dict[str, Any]:
    """Delete a connection profile and close its cached client.

    Idempotent — deleting a missing connection is a no-op.

    Mutation: requires ``ACM_MCP_ACCESS_PROFILE=full``; returns
    ``code=access_denied`` under READ_ONLY.
    """
    await connections_service.delete_connection(conn_id)
    return {"deleted": True, "conn_id": conn_id}


@tool(category="connection", mutation=False)
async def list_connections(workspace_id: str | None = None) -> list[dict[str, Any]]:
    """List all connection profiles, optionally filtered by workspace id."""
    results = await connections_service.list_connections(workspace_id)
    return [item.model_dump() for item in results]


@tool(category="connection", mutation=False)
async def connect(conn_id: str) -> dict[str, Any]:
    """Establish (or re-use) a live ``AsyncClient`` for the connection.

    Returns a small status snapshot so the model can confirm the cluster
    is reachable: number of nodes seen by the client and the namespace
    list visible from a random node.

    Side effect: modifies the shared ``client_manager`` cache. Concurrent
    or read-only MCP clients sharing the same workspace see the impact
    even though this tool is declared ``mutation=False``.
    """
    try:
        client = await client_manager.get_client(conn_id)
    except ValueError as e:
        # client_manager raises ValueError when the profile is missing.
        # Re-raise as the canonical service-layer error so the registry's
        # error map produces a stable code — matches get_connection's wire
        # shape rather than leaking a generic ValueError.
        raise ConnectionNotFoundError(conn_id) from e

    node_names = client.get_node_names()
    ns_raw = await client.info_random_node(INFO_NAMESPACES)
    namespaces = parse_list(ns_raw)
    return {
        "connected": True,
        "conn_id": conn_id,
        "node_count": len(node_names),
        "namespaces": namespaces,
    }


@tool(category="connection", mutation=False)
async def disconnect(conn_id: str) -> dict[str, Any]:
    """Close and evict the live client for the given connection.

    No-op when no live client is currently cached.

    Side effect: modifies the shared ``client_manager`` cache. Concurrent
    or read-only MCP clients sharing the same workspace see the impact
    even though this tool is declared ``mutation=False``.
    """
    await client_manager.close_client(conn_id)
    return {"disconnected": True, "conn_id": conn_id}


@tool(category="connection", mutation=False)
async def test_connection(
    hosts: list[str],
    port: int = 3000,
    username: str | None = None,
    password: str | None = None,
) -> dict[str, Any]:
    """Probe Aerospike connectivity without persisting a profile.

    Returns ``{"success": bool, "message": str}`` — never raises;
    the underlying service layer captures any error as ``success=False``.
    Failure messages are normalised to a generic ``"connection test
    failed"`` so we don't leak host/port or driver internals to the model;
    the original exception text is logged structurally for operators.
    """
    payload = TestConnectionRequest(hosts=hosts, port=port, username=username, password=password)
    result = await connections_service.test_connection(payload)
    if not result.success:
        # M2 hardening: surface a generic message to the LLM, but keep
        # the operator-visible detail in the structured log so an SRE
        # debugging a flapping cluster still has the underlying error.
        logger.warning(
            "MCP test_connection failure: hosts=%s port=%s detail=%s",
            hosts,
            port,
            result.message,
        )
        return {"success": False, "message": "connection test failed"}
    return {"success": True, "message": result.message}
