/**
 * Connection profile CRUD + health + test.
 * Endpoint base: /api/connections
 */

import type {
  ConnectionProfileResponse,
  ConnectionStatus,
  CreateConnectionRequest,
  TestConnectionRequest,
  TestConnectionResponse,
  UpdateConnectionRequest,
} from "../types/connection";
import { apiDelete, apiGet, apiPost, apiPut } from "./client";

/** GET /api/connections — list all saved connection profiles. */
export function listConnections(): Promise<ConnectionProfileResponse[]> {
  return apiGet("/connections");
}

/** GET /api/connections/{conn_id} — fetch a single connection profile. */
export function getConnection(connId: string): Promise<ConnectionProfileResponse> {
  return apiGet(`/connections/${encodeURIComponent(connId)}`);
}

/** POST /api/connections — create a new connection profile. */
export function createConnection(
  body: CreateConnectionRequest,
): Promise<ConnectionProfileResponse> {
  return apiPost("/connections", body);
}

/** PUT /api/connections/{conn_id} — update an existing profile. */
export function updateConnection(
  connId: string,
  body: UpdateConnectionRequest,
): Promise<ConnectionProfileResponse> {
  return apiPut(`/connections/${encodeURIComponent(connId)}`, body);
}

/** DELETE /api/connections/{conn_id} — delete profile and close client. */
export function deleteConnection(connId: string): Promise<void> {
  return apiDelete(`/connections/${encodeURIComponent(connId)}`);
}

/** GET /api/connections/{conn_id}/health — health probe (always 200). */
export function getConnectionHealth(connId: string): Promise<ConnectionStatus> {
  return apiGet(`/connections/${encodeURIComponent(connId)}/health`);
}

/** POST /api/connections/test — test connectivity without saving. */
export function testConnection(
  body: TestConnectionRequest,
): Promise<TestConnectionResponse> {
  return apiPost("/connections/test", body);
}
