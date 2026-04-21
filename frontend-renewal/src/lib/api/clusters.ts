/**
 * Cluster info and namespace configuration.
 * Endpoint base: /api/clusters
 */

import type { ClusterInfo, CreateNamespaceRequest } from "../types/cluster";
import { apiGet, apiPost } from "./client";

/** GET /api/clusters/{conn_id} — full cluster info (nodes, namespaces, sets). */
export function getCluster(connId: string): Promise<ClusterInfo> {
  return apiGet(`/clusters/${encodeURIComponent(connId)}`);
}

/** POST /api/clusters/{conn_id}/namespaces — configure runtime params for a namespace. */
export function configureNamespace(
  connId: string,
  body: CreateNamespaceRequest,
): Promise<{ message: string }> {
  return apiPost(`/clusters/${encodeURIComponent(connId)}/namespaces`, body);
}
