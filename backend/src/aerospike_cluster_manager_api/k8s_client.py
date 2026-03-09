"""Kubernetes API client for managing AerospikeCluster custom resources.

Uses the official kubernetes-client with asyncio.to_thread() wrappers
to avoid blocking the event loop (same pattern as client_manager.py).
"""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)

# CRD constants
GROUP = "acko.io"
VERSION = "v1alpha1"
PLURAL = "aerospikeclusters"
TEMPLATE_PLURAL = "aerospikeclustertemplates"
# Default timeout for K8s API calls (seconds)
_K8S_API_TIMEOUT = 10
# Longer timeout for streaming operations (pod logs)
_K8S_LOG_TIMEOUT = 30


class K8sApiError(Exception):
    """Wraps kubernetes ApiException with HTTP status code and reason."""

    def __init__(self, status: int, reason: str, message: str = "") -> None:
        self.status = status
        self.reason = reason
        self.message = message
        super().__init__(f"K8s API error {status} {reason}: {message}")


class K8sClient:
    """Singleton wrapper around kubernetes CustomObjectsApi and CoreV1Api."""

    def __init__(self) -> None:
        self._custom_api = None
        self._core_api = None
        self._storage_api = None
        self._autoscaling_api = None
        self._lock = threading.Lock()
        self._initialized = False

    def _ensure_initialized(self) -> None:
        if self._initialized:
            return
        with self._lock:
            if self._initialized:
                return
            from kubernetes import client
            from kubernetes import config as k8s_config

            try:
                k8s_config.load_incluster_config()
                logger.info("Loaded in-cluster Kubernetes config")
            except k8s_config.ConfigException:
                try:
                    k8s_config.load_kube_config()
                    logger.info("Loaded kubeconfig from default location")
                except Exception as e:
                    logger.error("Failed to load any Kubernetes config: %s", e)
                    raise RuntimeError(
                        "Unable to initialize Kubernetes client — no in-cluster config or valid kubeconfig found"
                    ) from e

            self._custom_api = client.CustomObjectsApi()
            self._core_api = client.CoreV1Api()
            self._storage_api = client.StorageV1Api()
            self._autoscaling_api = client.AutoscalingV2Api()
            self._initialized = True

    # ------------------------------------------------------------------
    # Sync helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _wrap_api_exception(e: Exception) -> K8sApiError:
        """Convert a kubernetes ApiException into K8sApiError."""
        from kubernetes.client.rest import ApiException

        if isinstance(e, ApiException):
            msg = (str(e.body) if e.body else "")[:2000]
            return K8sApiError(status=e.status, reason=e.reason or "", message=msg)
        logger.error("Unexpected error in K8s operation: %s", e, exc_info=True)
        return K8sApiError(status=500, reason="InternalError", message="Internal server error")

    # ------------------------------------------------------------------
    # Generic custom-object helpers (shared by cluster and template methods)
    # ------------------------------------------------------------------

    def _list_custom_objects_sync(self, plural: str, namespace: str | None = None) -> list[dict[str, Any]]:
        self._ensure_initialized()
        try:
            if namespace:
                result = self._custom_api.list_namespaced_custom_object(
                    group=GROUP,
                    version=VERSION,
                    namespace=namespace,
                    plural=plural,
                    _request_timeout=_K8S_API_TIMEOUT,
                )
            else:
                result = self._custom_api.list_cluster_custom_object(
                    group=GROUP,
                    version=VERSION,
                    plural=plural,
                    _request_timeout=_K8S_API_TIMEOUT,
                )
            return result.get("items", [])
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _get_custom_object_sync(self, plural: str, namespace: str, name: str) -> dict[str, Any]:
        self._ensure_initialized()
        try:
            return self._custom_api.get_namespaced_custom_object(
                group=GROUP,
                version=VERSION,
                namespace=namespace,
                plural=plural,
                name=name,
                _request_timeout=_K8S_API_TIMEOUT,
            )
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _create_custom_object_sync(self, plural: str, namespace: str, body: dict[str, Any]) -> dict[str, Any]:
        self._ensure_initialized()
        try:
            return self._custom_api.create_namespaced_custom_object(
                group=GROUP,
                version=VERSION,
                namespace=namespace,
                plural=plural,
                body=body,
                _request_timeout=_K8S_API_TIMEOUT,
            )
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _patch_custom_object_sync(self, plural: str, namespace: str, name: str, body: dict[str, Any]) -> dict[str, Any]:
        self._ensure_initialized()
        try:
            return self._custom_api.patch_namespaced_custom_object(
                group=GROUP,
                version=VERSION,
                namespace=namespace,
                plural=plural,
                name=name,
                body=body,
                _request_timeout=_K8S_API_TIMEOUT,
            )
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _delete_custom_object_sync(self, plural: str, namespace: str, name: str) -> dict[str, Any]:
        self._ensure_initialized()
        try:
            return self._custom_api.delete_namespaced_custom_object(
                group=GROUP,
                version=VERSION,
                namespace=namespace,
                plural=plural,
                name=name,
                _request_timeout=_K8S_API_TIMEOUT,
            )
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    # ------------------------------------------------------------------
    # Cluster-scoped custom-object helpers (for non-namespaced CRDs)
    # ------------------------------------------------------------------

    def _list_cluster_custom_objects_sync(self, plural: str) -> list[dict[str, Any]]:
        self._ensure_initialized()
        try:
            result = self._custom_api.list_cluster_custom_object(
                group=GROUP,
                version=VERSION,
                plural=plural,
                _request_timeout=_K8S_API_TIMEOUT,
            )
            return result.get("items", [])
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _get_cluster_custom_object_sync(self, plural: str, name: str) -> dict[str, Any]:
        self._ensure_initialized()
        try:
            return self._custom_api.get_cluster_custom_object(
                group=GROUP,
                version=VERSION,
                plural=plural,
                name=name,
                _request_timeout=_K8S_API_TIMEOUT,
            )
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _create_cluster_custom_object_sync(self, plural: str, body: dict[str, Any]) -> dict[str, Any]:
        self._ensure_initialized()
        try:
            return self._custom_api.create_cluster_custom_object(
                group=GROUP,
                version=VERSION,
                plural=plural,
                body=body,
                _request_timeout=_K8S_API_TIMEOUT,
            )
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _delete_cluster_custom_object_sync(self, plural: str, name: str) -> dict[str, Any]:
        self._ensure_initialized()
        try:
            return self._custom_api.delete_cluster_custom_object(
                group=GROUP,
                version=VERSION,
                plural=plural,
                name=name,
                _request_timeout=_K8S_API_TIMEOUT,
            )
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    # ------------------------------------------------------------------
    # Cluster-specific sync helpers
    # ------------------------------------------------------------------

    def _list_clusters_sync(self, namespace: str | None = None) -> list[dict[str, Any]]:
        logger.debug("_list_clusters_sync(namespace=%s)", namespace)
        return self._list_custom_objects_sync(PLURAL, namespace)

    def _get_cluster_sync(self, namespace: str, name: str) -> dict[str, Any]:
        logger.debug("_get_cluster_sync(namespace=%s, name=%s)", namespace, name)
        return self._get_custom_object_sync(PLURAL, namespace, name)

    def _create_cluster_sync(self, namespace: str, body: dict[str, Any]) -> dict[str, Any]:
        logger.debug("_create_cluster_sync(namespace=%s)", namespace)
        return self._create_custom_object_sync(PLURAL, namespace, body)

    def _patch_cluster_sync(self, namespace: str, name: str, body: dict[str, Any]) -> dict[str, Any]:
        logger.debug("_patch_cluster_sync(namespace=%s, name=%s)", namespace, name)
        return self._patch_custom_object_sync(PLURAL, namespace, name, body)

    def _delete_cluster_sync(self, namespace: str, name: str) -> dict[str, Any]:
        logger.debug("_delete_cluster_sync(namespace=%s, name=%s)", namespace, name)
        return self._delete_custom_object_sync(PLURAL, namespace, name)

    def _list_namespaces_sync(self) -> list[str]:
        logger.debug("_list_namespaces_sync()")
        self._ensure_initialized()
        try:
            result = self._core_api.list_namespace(_request_timeout=_K8S_API_TIMEOUT)
            return [ns.metadata.name for ns in result.items]
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _create_namespace_sync(self, name: str) -> None:
        logger.debug("_create_namespace_sync(name=%s)", name)
        self._ensure_initialized()
        from kubernetes import client
        from kubernetes.client.rest import ApiException

        try:
            self._core_api.create_namespace(
                client.V1Namespace(metadata=client.V1ObjectMeta(name=name)),
                _request_timeout=_K8S_API_TIMEOUT,
            )
            logger.info("Created namespace '%s'", name)
        except ApiException as e:
            if e.status == 409:
                # Already exists — not an error
                return
            raise self._wrap_api_exception(e) from e
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _list_storage_classes_sync(self) -> list[str]:
        logger.debug("_list_storage_classes_sync()")
        self._ensure_initialized()
        try:
            result = self._storage_api.list_storage_class(_request_timeout=_K8S_API_TIMEOUT)
            return [sc.metadata.name for sc in result.items]
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _list_pods_sync(self, namespace: str, label_selector: str) -> list[dict[str, Any]]:
        logger.debug("_list_pods_sync(namespace=%s, label_selector=%s)", namespace, label_selector)
        self._ensure_initialized()
        try:
            result = self._core_api.list_namespaced_pod(
                namespace=namespace,
                label_selector=label_selector,
                _request_timeout=_K8S_API_TIMEOUT,
            )
            pods = []
            for pod in result.items:
                ready = False
                if pod.status and pod.status.conditions:
                    for cond in pod.status.conditions:
                        if cond.type == "Ready" and cond.status == "True":
                            ready = True
                            break
                pods.append(
                    {
                        "name": pod.metadata.name,
                        "podIP": pod.status.pod_ip if pod.status else None,
                        "hostIP": pod.status.host_ip if pod.status else None,
                        "isReady": ready,
                        "phase": pod.status.phase if pod.status else "Unknown",
                        "image": (
                            pod.spec.containers[0].image
                            if pod.spec and pod.spec.containers and len(pod.spec.containers) > 0
                            else None
                        ),
                    }
                )
            return pods
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    # ------------------------------------------------------------------
    # Template-specific sync helpers
    # ------------------------------------------------------------------

    def _list_templates_sync(self) -> list[dict[str, Any]]:
        logger.debug("_list_templates_sync()")
        return self._list_cluster_custom_objects_sync(TEMPLATE_PLURAL)

    def _get_template_sync(self, name: str) -> dict[str, Any]:
        logger.debug("_get_template_sync(name=%s)", name)
        return self._get_cluster_custom_object_sync(TEMPLATE_PLURAL, name)

    def _create_template_sync(self, body: dict[str, Any]) -> dict[str, Any]:
        logger.debug("_create_template_sync()")
        return self._create_cluster_custom_object_sync(TEMPLATE_PLURAL, body)

    def _delete_template_sync(self, name: str) -> dict[str, Any]:
        logger.debug("_delete_template_sync(name=%s)", name)
        return self._delete_cluster_custom_object_sync(TEMPLATE_PLURAL, name)

    def _list_secrets_sync(self, namespace: str) -> list[str]:
        logger.debug("_list_secrets_sync(namespace=%s)", namespace)
        self._ensure_initialized()
        try:
            result = self._core_api.list_namespaced_secret(
                namespace=namespace,
                field_selector="type=Opaque",
                _request_timeout=_K8S_API_TIMEOUT,
            )
            return [s.metadata.name for s in result.items]
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _list_nodes_sync(self) -> list[dict[str, Any]]:
        """List K8s nodes with zone labels."""
        logger.debug("_list_nodes_sync()")
        self._ensure_initialized()
        try:
            result = self._core_api.list_node(_request_timeout=_K8S_API_TIMEOUT)
            nodes = []
            for node in result.items:
                labels = node.metadata.labels or {}
                nodes.append(
                    {
                        "name": node.metadata.name,
                        "zone": labels.get("topology.kubernetes.io/zone", ""),
                        "region": labels.get("topology.kubernetes.io/region", ""),
                        "ready": any(c.status == "True" for c in (node.status.conditions or []) if c.type == "Ready"),
                    }
                )
            return nodes
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _list_events_sync(self, namespace: str, field_selector: str) -> list[dict[str, Any]]:
        logger.debug("_list_events_sync(namespace=%s)", namespace)
        self._ensure_initialized()
        try:
            result = self._core_api.list_namespaced_event(
                namespace=namespace,
                field_selector=field_selector,
                _request_timeout=_K8S_API_TIMEOUT,
            )
            events = []
            for event in result.items:
                events.append(
                    {
                        "type": event.type,
                        "reason": event.reason,
                        "message": event.message,
                        "count": event.count,
                        "firstTimestamp": event.first_timestamp.isoformat() if event.first_timestamp else None,
                        "lastTimestamp": event.last_timestamp.isoformat() if event.last_timestamp else None,
                        "source": event.source.component if event.source else None,
                    }
                )
            return sorted(events, key=lambda e: e.get("lastTimestamp") or "", reverse=True)
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _read_pod_log_sync(
        self, namespace: str, pod_name: str, container: str | None = None, tail_lines: int = 500
    ) -> str:
        """Read logs from a pod."""
        logger.debug("_read_pod_log_sync(namespace=%s, pod=%s)", namespace, pod_name)
        self._ensure_initialized()
        try:
            kwargs: dict[str, Any] = {
                "namespace": namespace,
                "name": pod_name,
                "tail_lines": tail_lines,
                "_request_timeout": _K8S_LOG_TIMEOUT,
            }
            if container:
                kwargs["container"] = container
            return self._core_api.read_namespaced_pod_log(**kwargs)
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    # ------------------------------------------------------------------
    # Async public API
    # ------------------------------------------------------------------

    async def list_clusters(self, namespace: str | None = None) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_clusters_sync, namespace)

    async def get_cluster(self, namespace: str, name: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._get_cluster_sync, namespace, name)

    async def create_cluster(self, namespace: str, body: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(self._create_cluster_sync, namespace, body)

    async def patch_cluster(self, namespace: str, name: str, body: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(self._patch_cluster_sync, namespace, name, body)

    async def delete_cluster(self, namespace: str, name: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._delete_cluster_sync, namespace, name)

    async def list_namespaces(self) -> list[str]:
        return await asyncio.to_thread(self._list_namespaces_sync)

    async def create_namespace(self, name: str) -> None:
        return await asyncio.to_thread(self._create_namespace_sync, name)

    async def list_storage_classes(self) -> list[str]:
        return await asyncio.to_thread(self._list_storage_classes_sync)

    async def list_pods(self, namespace: str, label_selector: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_pods_sync, namespace, label_selector)

    async def list_templates(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_templates_sync)

    async def get_template(self, name: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._get_template_sync, name)

    async def create_template(self, body: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(self._create_template_sync, body)

    async def delete_template(self, name: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._delete_template_sync, name)

    async def list_secrets(self, namespace: str) -> list[str]:
        """List Secret names in a namespace (Opaque type only)."""
        return await asyncio.to_thread(self._list_secrets_sync, namespace)

    async def list_events(self, namespace: str, field_selector: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_events_sync, namespace, field_selector)

    async def list_nodes(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_nodes_sync)

    async def read_pod_log(
        self, namespace: str, pod_name: str, container: str | None = None, tail_lines: int = 500
    ) -> str:
        return await asyncio.to_thread(self._read_pod_log_sync, namespace, pod_name, container, tail_lines)

    # ------------------------------------------------------------------
    # HPA sync helpers
    # ------------------------------------------------------------------

    def _get_hpa_sync(self, namespace: str, name: str) -> dict[str, Any]:
        """Get an HPA by namespace and name. Returns the raw API object as a dict."""
        logger.debug("_get_hpa_sync(namespace=%s, name=%s)", namespace, name)
        self._ensure_initialized()
        try:
            hpa = self._autoscaling_api.read_namespaced_horizontal_pod_autoscaler(
                name=name,
                namespace=namespace,
                _request_timeout=_K8S_API_TIMEOUT,
            )
            return hpa.to_dict()
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    @staticmethod
    def _build_hpa_object(
        cluster_name: str,
        namespace: str,
        min_replicas: int,
        max_replicas: int,
        cpu_target_percent: int | None,
        memory_target_percent: int | None,
    ) -> Any:
        """Build a V2HorizontalPodAutoscaler object (shared by create and update)."""
        from kubernetes import client

        metrics = []
        if cpu_target_percent is not None:
            metrics.append(
                client.V2MetricSpec(
                    type="Resource",
                    resource=client.V2ResourceMetricSource(
                        name="cpu",
                        target=client.V2MetricTarget(
                            type="Utilization",
                            average_utilization=cpu_target_percent,
                        ),
                    ),
                )
            )
        if memory_target_percent is not None:
            metrics.append(
                client.V2MetricSpec(
                    type="Resource",
                    resource=client.V2ResourceMetricSource(
                        name="memory",
                        target=client.V2MetricTarget(
                            type="Utilization",
                            average_utilization=memory_target_percent,
                        ),
                    ),
                )
            )

        return client.V2HorizontalPodAutoscaler(
            metadata=client.V1ObjectMeta(
                name=cluster_name,
                namespace=namespace,
                labels={
                    "app.kubernetes.io/managed-by": "aerospike-cluster-manager",
                    "app.kubernetes.io/instance": cluster_name,
                },
            ),
            spec=client.V2HorizontalPodAutoscalerSpec(
                scale_target_ref=client.V2CrossVersionObjectReference(
                    api_version=f"{GROUP}/{VERSION}",
                    kind="AerospikeCluster",
                    name=cluster_name,
                ),
                min_replicas=min_replicas,
                max_replicas=max_replicas,
                metrics=metrics,
            ),
        )

    def _create_hpa_sync(
        self,
        namespace: str,
        cluster_name: str,
        min_replicas: int,
        max_replicas: int,
        cpu_target_percent: int | None = None,
        memory_target_percent: int | None = None,
    ) -> dict[str, Any]:
        """Create an HPA targeting an AerospikeCluster."""
        logger.debug("_create_hpa_sync(namespace=%s, cluster=%s)", namespace, cluster_name)
        self._ensure_initialized()
        hpa = self._build_hpa_object(
            cluster_name, namespace, min_replicas, max_replicas, cpu_target_percent, memory_target_percent
        )
        try:
            result = self._autoscaling_api.create_namespaced_horizontal_pod_autoscaler(
                namespace=namespace,
                body=hpa,
                _request_timeout=_K8S_API_TIMEOUT,
            )
            return result.to_dict()
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _update_hpa_sync(
        self,
        namespace: str,
        cluster_name: str,
        min_replicas: int,
        max_replicas: int,
        cpu_target_percent: int | None = None,
        memory_target_percent: int | None = None,
    ) -> dict[str, Any]:
        """Update (replace) an existing HPA."""
        logger.debug("_update_hpa_sync(namespace=%s, cluster=%s)", namespace, cluster_name)
        self._ensure_initialized()
        hpa = self._build_hpa_object(
            cluster_name, namespace, min_replicas, max_replicas, cpu_target_percent, memory_target_percent
        )

        try:
            result = self._autoscaling_api.replace_namespaced_horizontal_pod_autoscaler(
                name=cluster_name,
                namespace=namespace,
                body=hpa,
                _request_timeout=_K8S_API_TIMEOUT,
            )
            return result.to_dict()
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    def _delete_hpa_sync(self, namespace: str, name: str) -> None:
        """Delete an HPA."""
        logger.debug("_delete_hpa_sync(namespace=%s, name=%s)", namespace, name)
        self._ensure_initialized()
        try:
            self._autoscaling_api.delete_namespaced_horizontal_pod_autoscaler(
                name=name,
                namespace=namespace,
                _request_timeout=_K8S_API_TIMEOUT,
            )
        except Exception as e:
            raise self._wrap_api_exception(e) from e

    # ------------------------------------------------------------------
    # HPA async public API
    # ------------------------------------------------------------------

    async def get_hpa(self, namespace: str, name: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._get_hpa_sync, namespace, name)

    async def create_hpa(
        self,
        namespace: str,
        cluster_name: str,
        min_replicas: int,
        max_replicas: int,
        cpu_target_percent: int | None = None,
        memory_target_percent: int | None = None,
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            self._create_hpa_sync,
            namespace,
            cluster_name,
            min_replicas,
            max_replicas,
            cpu_target_percent,
            memory_target_percent,
        )

    async def update_hpa(
        self,
        namespace: str,
        cluster_name: str,
        min_replicas: int,
        max_replicas: int,
        cpu_target_percent: int | None = None,
        memory_target_percent: int | None = None,
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            self._update_hpa_sync,
            namespace,
            cluster_name,
            min_replicas,
            max_replicas,
            cpu_target_percent,
            memory_target_percent,
        )

    async def delete_hpa(self, namespace: str, name: str) -> None:
        return await asyncio.to_thread(self._delete_hpa_sync, namespace, name)


k8s_client = K8sClient()
