"""Background task that periodically collects data and publishes SSE events.

Replaces client-side polling with server-side push.  Collection intervals
mirror the polling intervals previously used by the frontend:
- Cluster metrics: every 2 s
- Connection health: every 30 s
- K8s cluster data: every 5 s (only when ``K8S_MANAGEMENT_ENABLED``)
"""

from __future__ import annotations

import asyncio
import logging
import time

from aerospike_cluster_manager_api import config, db
from aerospike_cluster_manager_api.client_manager import client_manager
from aerospike_cluster_manager_api.events.broker import broker
from aerospike_cluster_manager_api.services.metrics_service import build_cluster_metrics

logger = logging.getLogger(__name__)

METRICS_INTERVAL_S = 2
HEALTH_INTERVAL_S = 30
K8S_INTERVAL_S = 5


class EventCollector:
    """Runs background collection loops and publishes events to the broker."""

    def __init__(self) -> None:
        self._tasks: list[asyncio.Task] = []

    async def start(self) -> None:
        self._tasks.append(asyncio.create_task(self._collect_metrics_loop()))
        self._tasks.append(asyncio.create_task(self._collect_health_loop()))
        if config.K8S_MANAGEMENT_ENABLED:
            self._tasks.append(asyncio.create_task(self._collect_k8s_loop()))
        logger.info("EventCollector started (%d loops)", len(self._tasks))

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        logger.info("EventCollector stopped")

    # ------------------------------------------------------------------
    # Metrics loop
    # ------------------------------------------------------------------

    async def _collect_metrics_loop(self) -> None:
        while True:
            try:
                await self._publish_metrics()
            except asyncio.CancelledError:
                return
            except Exception:
                logger.debug("Metrics collection error", exc_info=True)
            await asyncio.sleep(METRICS_INTERVAL_S)

    async def _publish_metrics(self) -> None:
        if broker.subscriber_count == 0:
            return
        connections = await db.get_all_connections()
        for conn in connections:
            try:
                client = await client_manager.get_client(conn.id)
                metrics = await build_cluster_metrics(client, conn.id)
                await broker.publish(
                    {
                        "event": "cluster.metrics",
                        "data": metrics.model_dump(),
                        "id": f"metrics-{conn.id}-{int(time.time() * 1000)}",
                        "timestamp": int(time.time() * 1000),
                    }
                )
            except Exception:
                logger.debug("Failed to collect metrics for connection '%s'", conn.id, exc_info=True)

    # ------------------------------------------------------------------
    # Connection health loop
    # ------------------------------------------------------------------

    async def _collect_health_loop(self) -> None:
        while True:
            try:
                await self._publish_health()
            except asyncio.CancelledError:
                return
            except Exception:
                logger.debug("Health collection error", exc_info=True)
            await asyncio.sleep(HEALTH_INTERVAL_S)

    async def _publish_health(self) -> None:
        if broker.subscriber_count == 0:
            return
        from aerospike_cluster_manager_api.constants import INFO_BUILD, INFO_EDITION, INFO_NAMESPACES
        from aerospike_cluster_manager_api.info_parser import parse_list

        connections = await db.get_all_connections()
        for conn in connections:
            try:
                client = await client_manager.get_client(conn.id)
                node_names = await client.get_node_names()  # type: ignore[misc]
                ns_raw = await client.info_random_node(INFO_NAMESPACES)
                namespaces = parse_list(ns_raw)
                build = (await client.info_random_node(INFO_BUILD)).strip()
                edition = (await client.info_random_node(INFO_EDITION)).strip()
                await broker.publish(
                    {
                        "event": "connection.health",
                        "data": {
                            "connectionId": conn.id,
                            "connected": True,
                            "nodeCount": len(node_names),
                            "namespaceCount": len(namespaces),
                            "build": build,
                            "edition": edition,
                        },
                        "id": f"health-{conn.id}-{int(time.time() * 1000)}",
                        "timestamp": int(time.time() * 1000),
                    }
                )
            except Exception:
                await broker.publish(
                    {
                        "event": "connection.health",
                        "data": {
                            "connectionId": conn.id,
                            "connected": False,
                            "nodeCount": 0,
                            "namespaceCount": 0,
                        },
                        "id": f"health-{conn.id}-{int(time.time() * 1000)}",
                        "timestamp": int(time.time() * 1000),
                    }
                )

    # ------------------------------------------------------------------
    # K8s loop (only when K8S_MANAGEMENT_ENABLED)
    # ------------------------------------------------------------------

    async def _collect_k8s_loop(self) -> None:
        while True:
            try:
                await self._publish_k8s()
            except asyncio.CancelledError:
                return
            except Exception:
                logger.debug("K8s collection error", exc_info=True)
            await asyncio.sleep(K8S_INTERVAL_S)

    async def _publish_k8s(self) -> None:
        if broker.subscriber_count == 0:
            return
        try:
            from aerospike_cluster_manager_api.k8s_client import k8s_client

            clusters = await asyncio.to_thread(k8s_client.list_clusters)
            for cluster in clusters:
                ns = cluster.get("namespace", "")
                name = cluster.get("name", "")
                try:
                    detail = await asyncio.to_thread(k8s_client.get_cluster, ns, name)
                    await broker.publish(
                        {
                            "event": "k8s.cluster.detail",
                            "data": detail if isinstance(detail, dict) else detail.model_dump(),
                            "id": f"k8s-detail-{ns}-{name}-{int(time.time() * 1000)}",
                            "timestamp": int(time.time() * 1000),
                        }
                    )
                except Exception:
                    logger.debug("Failed to collect K8s detail for %s/%s", ns, name, exc_info=True)

                try:
                    events = await asyncio.to_thread(k8s_client.get_cluster_events, ns, name)
                    await broker.publish(
                        {
                            "event": "k8s.cluster.events",
                            "data": {"namespace": ns, "name": name, "events": events},
                            "id": f"k8s-events-{ns}-{name}-{int(time.time() * 1000)}",
                            "timestamp": int(time.time() * 1000),
                        }
                    )
                except Exception:
                    logger.debug("Failed to collect K8s events for %s/%s", ns, name, exc_info=True)

                try:
                    health = await asyncio.to_thread(k8s_client.get_cluster_health, ns, name)
                    await broker.publish(
                        {
                            "event": "k8s.cluster.health",
                            "data": {"namespace": ns, "name": name, "health": health},
                            "id": f"k8s-health-{ns}-{name}-{int(time.time() * 1000)}",
                            "timestamp": int(time.time() * 1000),
                        }
                    )
                except Exception:
                    logger.debug("Failed to collect K8s health for %s/%s", ns, name, exc_info=True)
        except Exception:
            logger.debug("K8s collection cycle failed", exc_info=True)


collector = EventCollector()
