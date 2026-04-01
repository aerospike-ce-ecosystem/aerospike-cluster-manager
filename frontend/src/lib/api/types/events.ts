/**
 * SSE event type definitions.
 *
 * Backend counterpart: ``backend/src/aerospike_cluster_manager_api/events/models.py``
 */

import type { ClusterMetrics } from "./metrics";
import type { ConnectionStatus } from "./connection";

// --- Event type string literals ---

export type SSEEventType =
  | "cluster.metrics"
  | "connection.health"
  | "k8s.cluster.detail"
  | "k8s.cluster.events"
  | "k8s.cluster.health";

// --- Typed event payloads ---

export interface ClusterMetricsEvent {
  event: "cluster.metrics";
  data: ClusterMetrics;
  id?: string;
  timestamp: number;
}

export interface ConnectionHealthData extends ConnectionStatus {
  connectionId: string;
}

export interface ConnectionHealthEvent {
  event: "connection.health";
  data: ConnectionHealthData;
  id?: string;
  timestamp: number;
}

export interface K8sClusterDetailEvent {
  event: "k8s.cluster.detail";
  data: Record<string, unknown>;
  id?: string;
  timestamp: number;
}

export interface K8sClusterEventsEvent {
  event: "k8s.cluster.events";
  data: { namespace: string; name: string; events: unknown[] };
  id?: string;
  timestamp: number;
}

export interface K8sClusterHealthEvent {
  event: "k8s.cluster.health";
  data: { namespace: string; name: string; health: unknown };
  id?: string;
  timestamp: number;
}

/** Discriminated union of all SSE events */
export type SSEEvent =
  | ClusterMetricsEvent
  | ConnectionHealthEvent
  | K8sClusterDetailEvent
  | K8sClusterEventsEvent
  | K8sClusterHealthEvent;

// --- SSE connection status ---

export type SSEConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "fallback";
