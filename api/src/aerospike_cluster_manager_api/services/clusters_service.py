"""Business logic for Aerospike cluster inspection and namespace configuration.

These functions are the single source of truth for the cluster read-path:

* ``list_namespaces`` / ``list_sets`` / ``get_nodes`` — primitives that drive
  the dashboard, and are also exposed verbatim by the MCP tool layer added
  in a later task.
* ``execute_info`` / ``execute_info_on_node`` — thin wrappers around the
  Aerospike info protocol so MCP tools can run arbitrary diagnostic
  commands without each redoing parameter validation.
* ``get_cluster_info`` — the full composition used by the
  ``GET /clusters/{conn_id}`` endpoint.
* ``configure_namespace`` — dynamic ``set-config`` for a runtime-tunable
  namespace.

To stay reusable from both HTTP and MCP entry points, this module **must not**
import ``fastapi`` or other HTTP-shaping libraries.  Domain failures are
signalled by plain exceptions defined here, which the router translates to
HTTP status codes and MCP tools translate to MCP error responses.
"""

from __future__ import annotations

import asyncio
import logging

import aerospike_py
from aerospike_py.types import InfoNodeResult

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.constants import (
    INFO_BUILD,
    INFO_EDITION,
    INFO_NAMESPACES,
    INFO_SERVICE,
    INFO_STATISTICS,
    NS_SUM_KEYS,
    info_namespace,
    info_sets,
)
from aerospike_cluster_manager_api.info_parser import (
    aggregate_node_kv,
    aggregate_set_records,
    parse_kv_pairs,
    parse_list,
    safe_bool,
    safe_int,
)
from aerospike_cluster_manager_api.info_verbs import assert_read_only
from aerospike_cluster_manager_api.models.cluster import (
    ClusterInfo,
    ClusterNode,
    CreateNamespaceRequest,
    NamespaceInfo,
    SetInfo,
)
from aerospike_cluster_manager_api.services.info_cache import info_cache

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Domain exceptions
# ---------------------------------------------------------------------------


class NamespaceNotFoundError(LookupError):
    """Raised when a referenced namespace does not exist on the cluster."""

    def __init__(self, namespace: str) -> None:
        super().__init__(f"Namespace '{namespace}' not found")
        self.namespace = namespace


class NodeNotFoundError(LookupError):
    """Raised when a per-node info call cannot be satisfied for the named node."""

    def __init__(self, node_name: str) -> None:
        super().__init__(f"Node '{node_name}' not found or returned no usable response")
        self.node_name = node_name


class NamespaceConfigError(ValueError):
    """Raised when ``set-config`` returns a non-OK response."""

    def __init__(self, namespace: str, response: str) -> None:
        super().__init__(f"Failed to configure namespace '{namespace}': {response}")
        self.namespace = namespace
        self.response = response


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------


async def list_namespaces(client: aerospike_py.AsyncClient) -> list[str]:
    """Return the namespace names defined on the cluster."""
    raw = await client.info_random_node(INFO_NAMESPACES)
    return parse_list(raw)


async def list_sets(client: aerospike_py.AsyncClient, namespace: str) -> list[SetInfo]:
    """Return aggregated ``SetInfo`` for ``namespace``.

    Raises ``NamespaceNotFoundError`` if ``namespace`` is not present on the
    cluster.
    """
    # TODO: drop the existence check (currently 1 extra info round-trip)
    # once the failure mode of ``info_namespace`` / ``info_sets`` against a
    # missing namespace is well-defined enough to surface a clean
    # ``NamespaceNotFoundError`` from the natural error. Today the info
    # commands return an empty/garbage payload that aggregates to "no sets",
    # which would silently swallow a typoed namespace.
    existing = await list_namespaces(client)
    if namespace not in existing:
        raise NamespaceNotFoundError(namespace)

    node_names = client.get_node_names()
    total_nodes = len(node_names)

    ns_all, sets_all = await asyncio.gather(
        client.info_all(info_namespace(namespace)),
        client.info_all(info_sets(namespace)),
    )

    ns_stats = aggregate_node_kv(ns_all, keys_to_sum=NS_SUM_KEYS)
    replication_factor = safe_int(ns_stats.get("replication-factor"), 1)

    agg_sets = aggregate_set_records(sets_all, replication_factor)
    return [
        SetInfo(
            name=s["name"],
            namespace=namespace,
            objects=s["objects"],
            tombstones=s["tombstones"],
            memoryDataBytes=s["memory_data_bytes"],
            stopWritesCount=s["stop_writes_count"],
            nodeCount=s["node_count"],
            totalNodes=total_nodes,
        )
        for s in agg_sets
    ]


async def get_nodes(client: aerospike_py.AsyncClient, conn_id: str) -> list[ClusterNode]:
    """Return per-node cluster status for ``conn_id``.

    Static info commands (``build``, ``edition``) are served from
    ``info_cache`` to avoid hammering the cluster on frequently polled
    endpoints.
    """
    # get_node_names() is synchronous — call it before the async gather
    node_names = client.get_node_names()
    info_all_stats, info_all_build, info_all_edition, info_all_service = await asyncio.gather(
        client.info_all(INFO_STATISTICS),
        info_cache.get_or_fetch(conn_id, INFO_BUILD, lambda: client.info_all(INFO_BUILD)),
        info_cache.get_or_fetch(conn_id, INFO_EDITION, lambda: client.info_all(INFO_EDITION)),
        client.info_all(INFO_SERVICE),
    )

    node_map: dict[str, dict] = {}
    for name, _err, resp in info_all_stats:
        node_map.setdefault(name, {})["stats"] = parse_kv_pairs(resp)
    for name, _err, resp in info_all_build:
        node_map.setdefault(name, {})["build"] = resp.strip()
    for name, _err, resp in info_all_edition:
        node_map.setdefault(name, {})["edition"] = resp.strip()
    for name, _err, resp in info_all_service:
        node_map.setdefault(name, {})["service"] = resp.strip()

    nodes: list[ClusterNode] = []
    for name in node_names:
        info = node_map.get(name, {})
        stats = info.get("stats", {})
        service = info.get("service", "")
        addr, port = ([*service.split(":"), "3000"])[:2] if service else ("", "3000")

        nodes.append(
            ClusterNode(
                name=name,
                address=addr,
                port=safe_int(port, 3000),
                build=info.get("build", ""),
                edition=info.get("edition", ""),
                clusterSize=safe_int(stats.get("cluster_size"), 1),
                uptime=safe_int(stats.get("uptime")),
                clientConnections=safe_int(stats.get("client_connections")),
                statistics=stats,
            )
        )
    return nodes


async def execute_info(client: aerospike_py.AsyncClient, command: str) -> list[InfoNodeResult]:
    """Run an info command on every node and return the per-node responses.

    Thin wrapper around :py:meth:`aerospike_py.AsyncClient.info_all` exposed
    as a service entry point so MCP tools and HTTP routes can share argument
    validation / logging in one place.

    Returns:
        A list of :class:`aerospike_py.types.InfoNodeResult` named tuples
        ``(node_name, error_code, response)`` — one per node in the cluster.
    """
    return await client.info_all(command)


async def execute_info_on_node(client: aerospike_py.AsyncClient, command: str, node_name: str) -> str:
    """Run an info command and return the response from ``node_name``.

    aerospike-py only exposes ``info_all`` and ``info_random_node`` — there
    is no native single-node info call.  We fan out via ``info_all`` and
    pick the response whose tuple matches ``node_name``.

    Raises ``NodeNotFoundError`` if the node does not respond, returns an
    error code, or is not part of the cluster.
    """
    results = await client.info_all(command)
    for name, err, resp in results:
        if name == node_name:
            if err:
                raise NodeNotFoundError(node_name)
            return resp
    raise NodeNotFoundError(node_name)


async def execute_info_read_only(
    client: aerospike_py.AsyncClient,
    command: str,
    node_name: str | None = None,
) -> tuple[str, str]:
    """Run a whitelisted read-only asinfo command.

    Validates the verb against :data:`info_verbs.READ_ONLY_INFO_VERBS`
    *before* hitting the wire — a bad verb raises
    :class:`info_verbs.InfoVerbNotAllowed` (mapped to
    ``code=invalid_argument`` at the MCP boundary). The whitelist is the
    single source of truth for what ``ACM_MCP_ACCESS_PROFILE=read_only``
    can call via ``execute_info_read_only``; mutation tools
    (``execute_info``, ``execute_info_on_node``) remain unrestricted under
    ``FULL`` access.

    Returns a ``(node_name, response)`` tuple. With ``node_name=None`` we
    fan out via ``info_all`` and pick the first node that returned a
    non-error response — the returned ``node_name`` is the real cluster
    node, so the LLM can re-issue follow-up calls against it. With an
    explicit ``node_name`` we filter the same fan-out to the named node
    and raise :class:`NodeNotFoundError` if it didn't respond.
    """
    assert_read_only(command)
    results = await client.info_all(command)

    if node_name is None:
        for name, err, resp in results:
            if not err:
                return (name, resp)
        raise NodeNotFoundError("(any)")

    for name, err, resp in results:
        if name == node_name:
            if err:
                raise NodeNotFoundError(node_name)
            return (name, resp)
    raise NodeNotFoundError(node_name)


# ---------------------------------------------------------------------------
# Composed read & write
# ---------------------------------------------------------------------------


async def get_cluster_info(client: aerospike_py.AsyncClient, conn_id: str) -> ClusterInfo:
    """Return the full ``ClusterInfo`` payload for ``conn_id``.

    Composition order:

    1. Per-node status via :func:`get_nodes` (Phase 1).
    2. Namespace list (Phase 2).
    3. Per-namespace ``namespace/<ns>`` and ``sets/<ns>`` info_all in
       parallel (Phase 3) — same shape as the legacy router behaviour.
    """
    nodes = await get_nodes(client, conn_id)
    total_nodes = len(nodes)

    ns_names = await list_namespaces(client)

    if ns_names:
        ns_tasks = []
        for ns_name in ns_names:
            ns_tasks.append(client.info_all(info_namespace(ns_name)))
            ns_tasks.append(client.info_all(info_sets(ns_name)))
        ns_results = await asyncio.gather(*ns_tasks)
    else:
        ns_results = []

    namespaces: list[NamespaceInfo] = []
    for i, ns_name in enumerate(ns_names):
        ns_all = ns_results[i * 2]
        sets_all = ns_results[i * 2 + 1]

        ns_stats = aggregate_node_kv(ns_all, keys_to_sum=NS_SUM_KEYS)

        replication_factor = safe_int(ns_stats.get("replication-factor"), 1)
        effective_rf = min(replication_factor, total_nodes) if total_nodes > 0 else 1

        raw_objects = safe_int(ns_stats.get("objects"))
        unique_objects = raw_objects // effective_rf if effective_rf > 0 else raw_objects

        # CE 8 uses unified data_used_bytes/data_total_bytes for both memory and device.
        # Fall back to legacy memory_used_bytes/memory-size for older versions.
        memory_used = (
            safe_int(ns_stats.get("data_used_bytes"))
            if "data_used_bytes" in ns_stats
            else safe_int(ns_stats.get("memory_used_bytes"))
        )
        memory_total = (
            safe_int(ns_stats.get("data_total_bytes"))
            if "data_total_bytes" in ns_stats
            else safe_int(ns_stats.get("memory-size"))
        )
        device_used = safe_int(ns_stats.get("device_used_bytes"))
        device_total = safe_int(ns_stats.get("device-total-bytes"))

        memory_free_pct = 0
        if memory_total > 0:
            memory_free_pct = int((1 - memory_used / memory_total) * 100)

        agg_sets = aggregate_set_records(sets_all, replication_factor)
        sets = [
            SetInfo(
                name=s["name"],
                namespace=ns_name,
                objects=s["objects"],
                tombstones=s["tombstones"],
                memoryDataBytes=s["memory_data_bytes"],
                stopWritesCount=s["stop_writes_count"],
                nodeCount=s["node_count"],
                totalNodes=total_nodes,
            )
            for s in agg_sets
        ]

        namespaces.append(
            NamespaceInfo(
                name=ns_name,
                objects=unique_objects,
                memoryUsed=memory_used,
                memoryTotal=memory_total,
                memoryFreePct=memory_free_pct,
                deviceUsed=device_used,
                deviceTotal=device_total,
                replicationFactor=replication_factor,
                stopWrites=safe_bool(ns_stats.get("stop_writes")),
                hwmBreached=safe_bool(ns_stats.get("hwm_breached")),
                highWaterMemoryPct=safe_int(ns_stats.get("high-water-memory-pct")),
                highWaterDiskPct=safe_int(ns_stats.get("high-water-disk-pct")),
                nsupPeriod=safe_int(ns_stats.get("nsup-period")),
                defaultTtl=safe_int(ns_stats.get("default-ttl")),
                allowTtlWithoutNsup=safe_bool(ns_stats.get("allow-ttl-without-nsup")),
                sets=sets,
            )
        )

    # Inject operator notes from cluster-manager metaDB. Single SQL per
    # namespace; absent notes leave SetInfo.note=None.
    await _attach_set_notes(conn_id, namespaces)
    return ClusterInfo(connectionId=conn_id, nodes=nodes, namespaces=namespaces)


async def _attach_set_notes(conn_id: str, namespaces: list[NamespaceInfo]) -> None:
    """Mutate ``namespaces`` in place to populate each ``SetInfo.note``.

    Issues one batched lookup per namespace (typically ≤2 in CE clusters), so
    the total round-trip count is bounded by the namespace count, not the
    set count. No-op when a namespace has no sets, or when the metaDB has
    not been initialised (unit-test paths that bypass ``db.init_db()``).
    """
    try:
        for ns in namespaces:
            if not ns.sets:
                continue
            notes = await db.batch_get_set_notes(conn_id, ns.name, [s.name for s in ns.sets])
            if not notes:
                continue
            for s in ns.sets:
                note = notes.get(s.name)
                if note is not None:
                    s.note = note
    except RuntimeError as exc:
        # Production startup always calls db.init_db() before serving traffic;
        # the only realistic source of this RuntimeError is a unit test that
        # exercises the cluster service without spinning up the metaDB. Log
        # at debug to keep the prod log clean while still leaving a trail.
        if "Database not initialized" not in str(exc):
            raise
        logger.debug("Skipping set-note injection: metaDB not initialized")


async def configure_namespace(client: aerospike_py.AsyncClient, body: CreateNamespaceRequest) -> str:
    """Apply runtime-tunable ``set-config`` to an existing namespace.

    Aerospike does not support dynamic namespace creation — namespaces must
    be defined in ``aerospike.conf`` and the server restarted.  This call
    only updates parameters on a namespace that already exists.

    Raises:
        NamespaceNotFoundError: ``body.name`` is not a known namespace.
        NamespaceConfigError: the cluster rejected the ``set-config`` call.

    Returns:
        A success message suitable for direct inclusion in an HTTP or MCP
        response.
    """
    existing = await list_namespaces(client)
    if body.name not in existing:
        raise NamespaceNotFoundError(body.name)

    cmd = (
        f"set-config:context=namespace;id={body.name}"
        f";memory-size={body.memorySize}"
        f";replication-factor={body.replicationFactor}"
    )
    resp = await client.info_random_node(cmd)

    if resp.strip().lower() != "ok":
        raise NamespaceConfigError(body.name, resp.strip())

    return f"Namespace '{body.name}' configured successfully"
