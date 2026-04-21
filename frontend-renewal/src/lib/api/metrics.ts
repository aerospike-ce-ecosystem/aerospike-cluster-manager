/**
 * Cluster-wide metrics (TPS / memory / device / per-namespace).
 * Endpoint base: /api/metrics
 */

import type { ClusterMetrics } from "../types/metrics";
import { apiGet } from "./client";

/** GET /api/metrics/{conn_id} — cluster metrics snapshot. */
export function getClusterMetrics(connId: string): Promise<ClusterMetrics> {
  return apiGet(`/metrics/${encodeURIComponent(connId)}`);
}
