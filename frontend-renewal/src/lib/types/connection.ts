/**
 * Connection-related types mirrored from backend Pydantic models.
 * See: backend/src/aerospike_cluster_manager_api/models/connection.py
 */

export type ConnectionErrorType =
  | "timeout"
  | "connection_refused"
  | "cluster_error"
  | "auth_error"
  | "unknown";

export interface ConnectionStatus {
  connected: boolean;
  nodeCount: number;
  namespaceCount: number;
  build?: string | null;
  edition?: string | null;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  tendHealthy?: boolean | null;
  error?: string | null;
  errorType?: ConnectionErrorType | null;
}

export interface ConnectionProfileResponse {
  id: string;
  name: string;
  hosts: string[];
  port: number;
  clusterName?: string | null;
  username?: string | null;
  color: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionWithStatus extends ConnectionProfileResponse {
  status: ConnectionStatus;
}

export interface CreateConnectionRequest {
  name?: string;
  hosts?: string[];
  port?: number;
  clusterName?: string | null;
  username?: string | null;
  password?: string | null;
  color?: string;
  description?: string | null;
}

export interface UpdateConnectionRequest {
  name?: string;
  hosts?: string[];
  port?: number;
  clusterName?: string | null;
  username?: string | null;
  password?: string | null;
  color?: string;
  description?: string | null;
}

export interface TestConnectionRequest {
  hosts: string[];
  port?: number;
  username?: string | null;
  password?: string | null;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
}
