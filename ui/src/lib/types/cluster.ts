/**
 * Cluster-related types mirrored from backend Pydantic models.
 * See: backend/src/aerospike_cluster_manager_api/models/cluster.py
 */

export interface ClusterNode {
  name: string
  address: string
  port: number
  build: string
  edition: string
  clusterSize: number
  uptime: number
  clientConnections: number
  statistics: Record<string, string | number>
}

export interface SetInfo {
  name: string
  namespace: string
  objects: number
  tombstones: number
  memoryDataBytes: number
  stopWritesCount: number
  nodeCount: number
  totalNodes: number
}

export interface NamespaceInfo {
  name: string
  objects: number
  memoryUsed: number
  memoryTotal: number
  memoryFreePct: number
  deviceUsed: number
  deviceTotal: number
  replicationFactor: number
  stopWrites: boolean
  hwmBreached: boolean
  highWaterMemoryPct: number
  highWaterDiskPct: number
  nsupPeriod: number
  defaultTtl: number
  allowTtlWithoutNsup: boolean
  sets: SetInfo[]
}

export interface ClusterInfo {
  connectionId: string
  nodes: ClusterNode[]
  namespaces: NamespaceInfo[]
}

export interface CreateNamespaceRequest {
  name: string
  memorySize?: number
  replicationFactor?: number
}
