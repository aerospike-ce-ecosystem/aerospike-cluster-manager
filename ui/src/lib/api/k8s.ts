/**
 * Kubernetes (ACKO) cluster + template management.
 * Endpoint base: /api/k8s
 *
 * All endpoints are guarded server-side by `K8S_MANAGEMENT_ENABLED` — when
 * disabled the backend returns 404 and the UI should hide K8s features.
 */

import type {
  CloneClusterRequest,
  ClusterHealthResponse,
  ConfigDriftResponse,
  CreateK8sClusterRequest,
  CreateK8sTemplateRequest,
  HPAConfig,
  HPAResponse,
  ImportClusterRequest,
  K8sClusterDetail,
  K8sClusterEvent,
  K8sClusterListResponse,
  K8sClusterSummary,
  K8sNodeInfo,
  K8sTemplateDetail,
  K8sTemplateSummary,
  MigrationStatusResponse,
  NodeBlocklistRequest,
  OperationRequest,
  PVCInfo,
  PodLogsResponse,
  ReconciliationHealthResponse,
  ReconciliationStatus,
  ScaleK8sClusterRequest,
  UpdateK8sClusterRequest,
  UpdateK8sTemplateRequest,
} from "../types/k8s"
import { apiDelete, apiFetch, apiGet, apiPost } from "./client"

// ---------------------------------------------------------------------------
// Cluster listing, detail, lifecycle
// ---------------------------------------------------------------------------

export interface ListK8sClustersParams {
  namespace?: string
  limit?: number
  continueToken?: string
  labelSelector?: string
}

/** GET /api/k8s/clusters — paginated list of AerospikeCluster CRs. */
export function listK8sClusters(
  params: ListK8sClustersParams = {},
): Promise<K8sClusterListResponse> {
  return apiGet("/k8s/clusters", { query: { ...params } })
}

/** GET /api/k8s/clusters/{namespace}/{name} — full cluster detail (spec, status, pods). */
export function getK8sCluster(
  namespace: string,
  name: string,
): Promise<K8sClusterDetail> {
  return apiGet(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
  )
}

/** POST /api/k8s/clusters — create a new AerospikeCluster. */
export function createK8sCluster(
  body: CreateK8sClusterRequest,
): Promise<K8sClusterSummary> {
  return apiPost("/k8s/clusters", body)
}

/** PATCH /api/k8s/clusters/{namespace}/{name} — partial update. */
export function updateK8sCluster(
  namespace: string,
  name: string,
  body: UpdateK8sClusterRequest,
): Promise<K8sClusterSummary> {
  return apiFetch(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
    { method: "PATCH", json: body },
  )
}

/** DELETE /api/k8s/clusters/{namespace}/{name} — delete cluster. */
export function deleteK8sCluster(
  namespace: string,
  name: string,
): Promise<{ message: string }> {
  return apiDelete(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
  )
}

/** POST /api/k8s/clusters/{namespace}/{name}/scale — change cluster size. */
export function scaleK8sCluster(
  namespace: string,
  name: string,
  body: ScaleK8sClusterRequest,
): Promise<K8sClusterSummary> {
  return apiPost(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/scale`,
    body,
  )
}

/** POST /api/k8s/clusters/import — import a CR from raw JSON/YAML. */
export function importK8sCluster(
  body: ImportClusterRequest,
): Promise<K8sClusterSummary> {
  return apiPost("/k8s/clusters/import", body)
}

/** POST /api/k8s/clusters/{namespace}/{name}/clone — clone an existing cluster. */
export function cloneK8sCluster(
  namespace: string,
  name: string,
  body: CloneClusterRequest,
): Promise<K8sClusterSummary> {
  return apiPost(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/clone`,
    body,
  )
}

/** PATCH /api/k8s/clusters/{namespace}/{name}/node-blocklist — update blocked K8s nodes. */
export function updateNodeBlocklist(
  namespace: string,
  name: string,
  body: NodeBlocklistRequest,
): Promise<K8sClusterSummary> {
  return apiFetch(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/node-blocklist`,
    { method: "PATCH", json: body },
  )
}

/** POST /api/k8s/clusters/{namespace}/{name}/force-reconcile — annotate to force reconcile. */
export function forceReconcileK8sCluster(
  namespace: string,
  name: string,
): Promise<K8sClusterSummary> {
  return apiPost(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/force-reconcile`,
  )
}

/** POST /api/k8s/clusters/{namespace}/{name}/reset-circuit-breaker — clear error counters. */
export function resetCircuitBreaker(
  namespace: string,
  name: string,
): Promise<{ message: string; namespace: string; name: string }> {
  return apiPost(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/reset-circuit-breaker`,
  )
}

/** POST /api/k8s/clusters/{namespace}/{name}/resync-template — resync template snapshot. */
export function resyncTemplate(
  namespace: string,
  name: string,
): Promise<K8sClusterSummary> {
  return apiPost(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/resync-template`,
  )
}

// ---------------------------------------------------------------------------
// Cluster status / health / drift
// ---------------------------------------------------------------------------

/** GET /api/k8s/clusters/{namespace}/{name}/health — cluster health summary. */
export function getK8sClusterHealth(
  namespace: string,
  name: string,
): Promise<ClusterHealthResponse> {
  return apiGet(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/health`,
  )
}

/** GET /api/k8s/clusters/{namespace}/{name}/config-drift — desired vs applied config diff. */
export function getK8sClusterConfigDrift(
  namespace: string,
  name: string,
): Promise<ConfigDriftResponse> {
  return apiGet(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/config-drift`,
  )
}

/** GET /api/k8s/clusters/{namespace}/{name}/reconciliation-status — circuit breaker state. */
export function getReconciliationStatus(
  namespace: string,
  name: string,
): Promise<ReconciliationStatus> {
  return apiGet(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/reconciliation-status`,
  )
}

/** GET /api/k8s/clusters/{namespace}/{name}/reconciliation-health — phase + error health. */
export function getReconciliationHealth(
  namespace: string,
  name: string,
): Promise<ReconciliationHealthResponse> {
  return apiGet(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/reconciliation-health`,
  )
}

/** GET /api/k8s/clusters/{namespace}/{name}/migration-status — per-pod migration progress. */
export function getMigrationStatus(
  namespace: string,
  name: string,
): Promise<MigrationStatusResponse> {
  return apiGet(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/migration-status`,
  )
}

// ---------------------------------------------------------------------------
// Pods / logs / YAML / PVCs
// ---------------------------------------------------------------------------

export interface GetPodLogsParams {
  tail?: number
  container?: string
}

/** GET /api/k8s/clusters/{namespace}/{name}/pods/{pod}/logs — tail pod logs. */
export function getK8sPodLogs(
  namespace: string,
  name: string,
  pod: string,
  params: GetPodLogsParams = {},
): Promise<PodLogsResponse> {
  return apiGet(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/pods/${encodeURIComponent(pod)}/logs`,
    { query: { ...params } },
  )
}

/** GET /api/k8s/clusters/{namespace}/{name}/yaml — export cleaned CR as JSON object. */
export function getK8sClusterYaml(
  namespace: string,
  name: string,
): Promise<{ yaml: Record<string, unknown> }> {
  return apiGet(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  )
}

/** GET /api/k8s/clusters/{namespace}/{name}/pvcs — list PVCs belonging to the cluster. */
export function listK8sClusterPvcs(
  namespace: string,
  name: string,
): Promise<PVCInfo[]> {
  return apiGet(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/pvcs`,
  )
}

/** DELETE /api/k8s/clusters/{namespace}/{name}/pvcs/{pvc} — delete an orphan PVC. */
export function deleteK8sClusterPvc(
  namespace: string,
  name: string,
  pvcName: string,
): Promise<{ message: string; namespace: string }> {
  return apiDelete(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/pvcs/${encodeURIComponent(pvcName)}`,
  )
}

// ---------------------------------------------------------------------------
// Events / operations
// ---------------------------------------------------------------------------

export interface ListK8sEventsParams {
  limit?: number
  category?: string
}

/** GET /api/k8s/clusters/{namespace}/{name}/events — K8s events for the cluster. */
export function listK8sClusterEvents(
  namespace: string,
  name: string,
  params: ListK8sEventsParams = {},
): Promise<K8sClusterEvent[]> {
  return apiGet(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/events`,
    { query: { ...params } },
  )
}

/** POST /api/k8s/clusters/{namespace}/{name}/operations — trigger WarmRestart / PodRestart. */
export function triggerK8sOperation(
  namespace: string,
  name: string,
  body: OperationRequest,
): Promise<K8sClusterSummary> {
  return apiPost(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/operations`,
    body,
  )
}

/** DELETE /api/k8s/clusters/{namespace}/{name}/operations — clear stuck operations. */
export function clearK8sOperations(
  namespace: string,
  name: string,
): Promise<K8sClusterSummary> {
  return apiDelete(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/operations`,
  )
}

// ---------------------------------------------------------------------------
// HPA
// ---------------------------------------------------------------------------

/** GET /api/k8s/clusters/{namespace}/{name}/hpa — current HPA config + status. */
export function getK8sClusterHpa(
  namespace: string,
  name: string,
): Promise<HPAResponse> {
  return apiGet(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/hpa`,
  )
}

/** POST /api/k8s/clusters/{namespace}/{name}/hpa — create or update HPA. */
export function upsertK8sClusterHpa(
  namespace: string,
  name: string,
  body: HPAConfig,
): Promise<HPAResponse> {
  return apiPost(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/hpa`,
    body,
  )
}

/** DELETE /api/k8s/clusters/{namespace}/{name}/hpa — remove HPA. */
export function deleteK8sClusterHpa(
  namespace: string,
  name: string,
): Promise<{ message: string }> {
  return apiDelete(
    `/k8s/clusters/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/hpa`,
  )
}

// ---------------------------------------------------------------------------
// Templates (cluster-scoped — no namespace in the path)
// ---------------------------------------------------------------------------

/** GET /api/k8s/templates — list AerospikeClusterTemplate CRs. */
export function listK8sTemplates(): Promise<K8sTemplateSummary[]> {
  return apiGet("/k8s/templates")
}

/** GET /api/k8s/templates/{name} — full template detail. */
export function getK8sTemplate(name: string): Promise<K8sTemplateDetail> {
  return apiGet(`/k8s/templates/${encodeURIComponent(name)}`)
}

/** POST /api/k8s/templates — create a template. */
export function createK8sTemplate(
  body: CreateK8sTemplateRequest,
): Promise<K8sTemplateSummary> {
  return apiPost("/k8s/templates", body)
}

/** PATCH /api/k8s/templates/{name} — partial update. */
export function updateK8sTemplate(
  name: string,
  body: UpdateK8sTemplateRequest,
): Promise<K8sTemplateSummary> {
  return apiFetch(`/k8s/templates/${encodeURIComponent(name)}`, {
    method: "PATCH",
    json: body,
  })
}

/** DELETE /api/k8s/templates/{name} — delete template (fails if referenced). */
export function deleteK8sTemplate(name: string): Promise<{ message: string }> {
  return apiDelete(`/k8s/templates/${encodeURIComponent(name)}`)
}

// ---------------------------------------------------------------------------
// Infrastructure lookups
// ---------------------------------------------------------------------------

/** GET /api/k8s/namespaces — list all K8s namespaces. */
export function listK8sNamespaces(): Promise<string[]> {
  return apiGet("/k8s/namespaces")
}

/** GET /api/k8s/nodes — list K8s nodes with zone/region labels. */
export function listK8sNodes(): Promise<K8sNodeInfo[]> {
  return apiGet("/k8s/nodes")
}

/** GET /api/k8s/storageclasses — list available StorageClass names. */
export function listK8sStorageClasses(): Promise<string[]> {
  return apiGet("/k8s/storageclasses")
}

/** GET /api/k8s/secrets?namespace= — list Secret names in the namespace. */
export function listK8sSecrets(namespace = "aerospike"): Promise<string[]> {
  return apiGet("/k8s/secrets", { query: { namespace } })
}
