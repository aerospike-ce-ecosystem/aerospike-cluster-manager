/**
 * Connection-related types mirrored from API Pydantic models.
 * See: api/src/aerospike_cluster_manager_api/models/connection.py
 */

/**
 * Why a health check reported `connected: false`.
 *
 * Deliberately coarse (#470). The health route is reachable unauthenticated in
 * the default configuration, so the older set — `timeout`,
 * `connection_refused`, `cluster_error`, `unknown` — let a caller distinguish a
 * closed port from a filtered one from a live non-Aerospike listener, i.e. it
 * was a port scanner. Those four collapse into `unreachable`.
 */
export type ConnectionErrorType =
  | "not_found"
  | "unreachable"
  | "auth_error"
  | "blocked_target"

export interface ConnectionStatus {
  connected: boolean
  nodeCount: number
  namespaceCount: number
  build?: string | null
  edition?: string | null
  memoryUsed: number
  memoryTotal: number
  diskUsed: number
  diskTotal: number
  tendHealthy?: boolean | null
  error?: string | null
  errorType?: ConnectionErrorType | null
}

export interface ConnectionProfileResponse {
  id: string
  name: string
  hosts: string[]
  port: number
  clusterName?: string | null
  username?: string | null
  color: string
  note?: string | null
  /** Always contains an ``env`` key after backend normalization (defaults to ``default``). */
  labels: Record<string, string>
  /** Workspace this connection belongs to. Defaults to ``ws-default`` server-side. */
  workspaceId: string
  createdAt: string
  updatedAt: string
}

export interface ConnectionWithStatus extends ConnectionProfileResponse {
  status: ConnectionStatus
}

export interface CreateConnectionRequest {
  name?: string
  hosts?: string[]
  port?: number
  clusterName?: string | null
  username?: string | null
  password?: string | null
  color?: string
  note?: string | null
  labels?: Record<string, string> | null
  /** When omitted, the backend assigns the connection to the default workspace. */
  workspaceId?: string | null
}

export interface UpdateConnectionRequest {
  name?: string
  hosts?: string[]
  port?: number
  clusterName?: string | null
  username?: string | null
  password?: string | null
  color?: string
  note?: string | null
  labels?: Record<string, string> | null
  /** Set to move the connection into a different workspace. */
  workspaceId?: string | null
}

export interface TestConnectionRequest {
  hosts: string[]
  port?: number
  username?: string | null
  password?: string | null
}

export interface TestConnectionResponse {
  success: boolean
  message: string
}
