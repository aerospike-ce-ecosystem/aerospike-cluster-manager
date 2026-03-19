import type { K8sClusterPhase } from "./k8s";

// === Cluster ===
export interface ClusterNode {
  name: string;
  address: string;
  port: number;
  build: string;
  edition: string;
  clusterSize: number;
  uptime: number;
  clientConnections: number;
  statistics: Record<string, string | number>;
}

export interface NamespaceInfo {
  name: string;
  objects: number;
  memoryUsed: number;
  memoryTotal: number;
  memoryFreePct: number;
  deviceUsed: number;
  deviceTotal: number;
  replicationFactor: number;
  stopWrites: boolean;
  hwmBreached: boolean;
  highWaterMemoryPct: number;
  highWaterDiskPct: number;
  nsupPeriod: number;
  defaultTtl: number;
  allowTtlWithoutNsup: boolean;
  sets: SetInfo[];
}

export interface SetInfo {
  name: string;
  namespace: string;
  objects: number;
  tombstones: number;
  memoryDataBytes: number;
  stopWritesCount: number;
  nodeCount?: number;
  totalNodes?: number;
}

export interface ClusterInfo {
  connectionId: string;
  nodes: ClusterNode[];
  namespaces: NamespaceInfo[];
}

export interface ConfigureNamespaceRequest {
  name: string;
  memorySize: number;
  replicationFactor: number;
}

// === Unified Cluster List ===
export type ClusterSource = "connection" | "k8s" | "both";

export interface UnifiedClusterRow {
  /** Unique ID: connection ID or "k8s:{namespace}/{name}" for standalone K8s clusters */
  id: string;
  /** Display name */
  name: string;
  /** Optional description text */
  description?: string;
  /** Label text (e.g., "Production") */
  label?: string;
  /** Label color hex */
  labelColor?: string;
  /** Where this row comes from */
  source: ClusterSource;
  /** Connection status */
  status: "connected" | "disconnected" | "checking" | "unknown";
  /** Number of nodes */
  nodeCount: number;
  /** Host address(es) */
  hosts: string;
  /** Total ops (cumulative counter from health summary) */
  totalOps?: number;
  /** Memory usage bytes */
  memoryUsed?: number;
  /** Memory total bytes */
  memoryTotal?: number;
  /** Disk usage bytes */
  diskUsed?: number;
  /** Disk total bytes */
  diskTotal?: number;
  /** Connection color */
  color: string;
  /** Whether managed by ACKO (has K8s cluster) */
  isAckoManaged: boolean;
  /** K8s cluster phase if applicable */
  k8sPhase?: K8sClusterPhase;
  /** K8s namespace (if managed) */
  k8sNamespace?: string;
  /** K8s cluster name (if managed) */
  k8sClusterName?: string;
  /** Connection ID (if has connection) */
  connectionId?: string;
  /** Build version string */
  build?: string;
  /** Edition string */
  edition?: string;
}
