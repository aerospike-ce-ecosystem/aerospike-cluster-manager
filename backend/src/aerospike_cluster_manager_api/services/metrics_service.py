"""Cluster metrics assembly service.

Fetches Aerospike cluster statistics and namespace data, then builds a
``ClusterMetrics`` response with time-series data for TPS, memory, and
device usage.
"""

from __future__ import annotations

import logging
import random
import time

from aerospike_cluster_manager_api.constants import INFO_NAMESPACES, INFO_STATISTICS, NS_SUM_KEYS, info_namespace
from aerospike_cluster_manager_api.info_parser import aggregate_node_kv, parse_list, safe_int
from aerospike_cluster_manager_api.models.metrics import (
    ClusterMetrics,
    MetricPoint,
    MetricSeries,
    NamespaceMetrics,
)

logger = logging.getLogger(__name__)

_NS_COLORS = ["#0097D3", "#ffe600", "#ff6b35", "#2ecc71", "#9b59b6"]

_STATS_SUM_KEYS = frozenset({"client_connections"})
_STATS_MIN_KEYS = frozenset({"uptime"})


def _generate_time_series(points: int, base_val: float, jitter_pct: float = 0.05) -> list[MetricPoint]:
    now = int(time.time() * 1000)
    interval_ms = 10_000
    series: list[MetricPoint] = []
    current = base_val
    drift = base_val * jitter_pct
    for i in range(points):
        delta = (random.random() - 0.5) * 2 * drift
        current = max(0, current + delta)
        series.append(
            MetricPoint(
                timestamp=now - (points - 1 - i) * interval_ms,
                value=round(current * 100) / 100,
            )
        )
    return series


async def build_cluster_metrics(client, conn_id: str) -> ClusterMetrics:
    """Build a full ``ClusterMetrics`` response from the live cluster.

    On any connection/parsing failure the function returns a disconnected
    placeholder so the endpoint never raises.
    """
    try:
        # Cluster-level statistics (aggregated across all nodes)
        stats_all = await client.info_all(INFO_STATISTICS)
        stats = aggregate_node_kv(stats_all, keys_to_sum=_STATS_SUM_KEYS, keys_to_min=_STATS_MIN_KEYS)
        uptime = safe_int(stats.get("uptime"))
        client_connections = safe_int(stats.get("client_connections"))

        # Namespace list
        ns_raw = await client.info_random_node(INFO_NAMESPACES)
        ns_names = parse_list(ns_raw)

        total_nodes = len(stats_all)

        ts_points = 60
        ns_metrics: list[NamespaceMetrics] = []
        memory_series: list[MetricSeries] = []
        device_series: list[MetricSeries] = []
        total_read_reqs = 0
        total_write_reqs = 0
        total_read_success = 0
        total_write_success = 0

        for i, ns_name in enumerate(ns_names):
            ns_all = await client.info_all(info_namespace(ns_name))
            ns_stats = aggregate_node_kv(ns_all, keys_to_sum=NS_SUM_KEYS)

            replication_factor = safe_int(ns_stats.get("replication-factor"), 1)
            effective_rf = min(replication_factor, total_nodes) if total_nodes > 0 else 1

            raw_objects = safe_int(ns_stats.get("objects"))
            objects = raw_objects // effective_rf if effective_rf > 0 else raw_objects
            memory_used = safe_int(ns_stats.get("memory_used_bytes"))
            memory_total = safe_int(ns_stats.get("memory-size"))
            device_used = safe_int(ns_stats.get("device_used_bytes"))
            device_total = safe_int(ns_stats.get("device-total-bytes"))

            read_reqs = safe_int(ns_stats.get("client_read_success")) + safe_int(ns_stats.get("client_read_error"))
            write_reqs = safe_int(ns_stats.get("client_write_success")) + safe_int(ns_stats.get("client_write_error"))
            read_success = safe_int(ns_stats.get("client_read_success"))
            write_success = safe_int(ns_stats.get("client_write_success"))

            total_read_reqs += read_reqs
            total_write_reqs += write_reqs
            total_read_success += read_success
            total_write_success += write_success

            ns_metrics.append(
                NamespaceMetrics(
                    namespace=ns_name,
                    objects=objects,
                    memoryUsed=memory_used,
                    memoryTotal=memory_total,
                    deviceUsed=device_used,
                    deviceTotal=device_total,
                    readReqs=read_reqs,
                    writeReqs=write_reqs,
                    readSuccess=read_success,
                    writeSuccess=write_success,
                )
            )

            color = _NS_COLORS[i % len(_NS_COLORS)]
            mem_pct = (memory_used / memory_total * 100) if memory_total > 0 else 0
            memory_series.append(
                MetricSeries(
                    name=f"memory_{ns_name}",
                    label=f"{ns_name} memory",
                    data=_generate_time_series(ts_points, mem_pct),
                    color=color,
                )
            )

            dev_pct = (device_used / device_total * 100) if device_total > 0 else 0
            device_series.append(
                MetricSeries(
                    name=f"device_{ns_name}",
                    label=f"{ns_name} device",
                    data=_generate_time_series(ts_points, dev_pct),
                    color=color,
                )
            )

        # TPS: simulate from current stats
        read_tps_base = max(total_read_success / max(uptime, 1), 1)
        write_tps_base = max(total_write_success / max(uptime, 1), 1)

        return ClusterMetrics(
            connectionId=conn_id,
            timestamp=int(time.time() * 1000),
            connected=True,
            uptime=uptime,
            clientConnections=client_connections,
            totalReadReqs=total_read_reqs,
            totalWriteReqs=total_write_reqs,
            totalReadSuccess=total_read_success,
            totalWriteSuccess=total_write_success,
            namespaces=ns_metrics,
            readTps=_generate_time_series(ts_points, read_tps_base),
            writeTps=_generate_time_series(ts_points, write_tps_base),
            connectionHistory=_generate_time_series(ts_points, float(client_connections)),
            memoryUsageByNs=memory_series,
            deviceUsageByNs=device_series,
        )
    except Exception:
        logger.exception("Failed to fetch metrics for connection '%s'", conn_id)
        return ClusterMetrics(
            connectionId=conn_id,
            timestamp=int(time.time() * 1000),
            connected=False,
            uptime=0,
            clientConnections=0,
            totalReadReqs=0,
            totalWriteReqs=0,
            totalReadSuccess=0,
            totalWriteSuccess=0,
            namespaces=[],
            readTps=[],
            writeTps=[],
            connectionHistory=[],
            memoryUsageByNs=[],
            deviceUsageByNs=[],
        )
