/**
 * Admin (users/roles) types mirrored from backend Pydantic models.
 * See: backend/src/aerospike_cluster_manager_api/models/admin.py
 */

export interface Privilege {
  code: string;
  namespace?: string | null;
  set?: string | null;
}

export interface AerospikeUser {
  username: string;
  roles: string[];
  readQuota: number;
  writeQuota: number;
  connections: number;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  roles?: string[] | null;
}

export interface ChangePasswordRequest {
  username: string;
  password: string;
}

export interface AerospikeRole {
  name: string;
  privileges: Privilege[];
  whitelist: string[];
  readQuota: number;
  writeQuota: number;
}

export interface CreateRoleRequest {
  name: string;
  privileges: Privilege[];
  whitelist?: string[] | null;
  readQuota?: number | null;
  writeQuota?: number | null;
}
