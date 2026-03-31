from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException

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
from aerospike_cluster_manager_api.dependencies import AerospikeClient, VerifiedConnId
from aerospike_cluster_manager_api.info_parser import (
    aggregate_node_kv,
    aggregate_set_records,
    parse_kv_pairs,
    parse_list,
    safe_bool,
    safe_int,
)
from aerospike_cluster_manager_api.models.cluster import (
    ClusterInfo,
    ClusterNode,
    CreateNamespaceRequest,
    NamespaceInfo,
    SetInfo,
)
from aerospike_cluster_manager_api.models.common import MessageResponse
from aerospike_cluster_manager_api.services.info_cache import info_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.get(
    "/{conn_id}",
    summary="Get cluster info",
    description="Retrieve full cluster information including nodes, namespaces, and sets.",
)
async def get_cluster(client: AerospikeClient, conn_id: VerifiedConnId) -> ClusterInfo:
    """Retrieve full cluster information including nodes, namespaces, and sets."""
    # --- Phase 1: All node-level calls in parallel ---
    node_names, info_all_stats, info_all_build, info_all_edition, info_all_service = await asyncio.gather(
        client.get_node_names(),  # type: ignore[misc]  # async in runtime, sync in stubs
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

    # --- Phase 2: Namespace list ---
    ns_raw = await client.info_random_node(INFO_NAMESPACES)
    ns_names = parse_list(ns_raw)

    total_nodes = len(node_names)

    # --- Phase 3: All namespace info calls in parallel ---
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

        memory_used = safe_int(ns_stats.get("memory_used_bytes"))
        memory_total = safe_int(ns_stats.get("memory-size"))
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

    return ClusterInfo(connectionId=conn_id, nodes=nodes, namespaces=namespaces)


@router.post(
    "/{conn_id}/namespaces",
    status_code=200,
    response_model=MessageResponse,
    summary="Configure namespace",
    description="Update runtime-tunable parameters of an existing Aerospike namespace.",
)
async def configure_namespace(body: CreateNamespaceRequest, client: AerospikeClient) -> MessageResponse:
    """Update runtime-tunable parameters of an existing Aerospike namespace."""
    ns_raw = await client.info_random_node(INFO_NAMESPACES)
    existing = parse_list(ns_raw)
    if body.name not in existing:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Namespace '{body.name}' does not exist. "
                "Aerospike does not support dynamic namespace creation. "
                "Namespaces must be defined in aerospike.conf and require a server restart."
            ),
        )

    cmd = (
        f"set-config:context=namespace;id={body.name}"
        f";memory-size={body.memorySize}"
        f";replication-factor={body.replicationFactor}"
    )
    resp = await client.info_random_node(cmd)

    if resp.strip().lower() != "ok":
        raise HTTPException(status_code=400, detail=f"Failed to configure namespace '{body.name}': {resp.strip()}")

    return MessageResponse(message=f"Namespace '{body.name}' configured successfully")
