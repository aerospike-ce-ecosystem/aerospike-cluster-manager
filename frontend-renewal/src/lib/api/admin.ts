/**
 * Aerospike user / role management (Enterprise / security-enabled CE).
 * Endpoint base: /api/admin
 */

import type {
  AerospikeRole,
  AerospikeUser,
  ChangePasswordRequest,
  CreateRoleRequest,
  CreateUserRequest,
} from "../types/admin";
import { apiDelete, apiFetch, apiGet, apiPost } from "./client";

// -- Users ---------------------------------------------------------------

/** GET /api/admin/{conn_id}/users — list all users and their roles. */
export function listUsers(connId: string): Promise<AerospikeUser[]> {
  return apiGet(`/admin/${encodeURIComponent(connId)}/users`);
}

/** POST /api/admin/{conn_id}/users — create a new user with roles. */
export function createUser(
  connId: string,
  body: CreateUserRequest,
): Promise<AerospikeUser> {
  return apiPost(`/admin/${encodeURIComponent(connId)}/users`, body);
}

/** PATCH /api/admin/{conn_id}/users — change an existing user's password. */
export function changeUserPassword(
  connId: string,
  body: ChangePasswordRequest,
): Promise<{ message: string }> {
  return apiFetch(`/admin/${encodeURIComponent(connId)}/users`, {
    method: "PATCH",
    json: body,
  });
}

/** DELETE /api/admin/{conn_id}/users?username= — delete a user. */
export function deleteUser(connId: string, username: string): Promise<void> {
  return apiDelete(`/admin/${encodeURIComponent(connId)}/users`, {
    query: { username },
  });
}

// -- Roles ---------------------------------------------------------------

/** GET /api/admin/{conn_id}/roles — list all roles and their privileges. */
export function listRoles(connId: string): Promise<AerospikeRole[]> {
  return apiGet(`/admin/${encodeURIComponent(connId)}/roles`);
}

/** POST /api/admin/{conn_id}/roles — create a new role. */
export function createRole(
  connId: string,
  body: CreateRoleRequest,
): Promise<AerospikeRole> {
  return apiPost(`/admin/${encodeURIComponent(connId)}/roles`, body);
}

/** DELETE /api/admin/{conn_id}/roles?name= — delete a role by name. */
export function deleteRole(connId: string, name: string): Promise<void> {
  return apiDelete(`/admin/${encodeURIComponent(connId)}/roles`, { query: { name } });
}
