/**
 * Workspace CRUD client.
 * Endpoint base: /api/workspaces
 */

import type {
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  WorkspaceResponse,
} from "../types/workspace"
import { apiDelete, apiGet, apiPost, apiPut } from "./client"

/** GET /api/workspaces — list all workspaces. */
export function listWorkspaces(): Promise<WorkspaceResponse[]> {
  return apiGet("/workspaces")
}

/** GET /api/workspaces/{id} — fetch a single workspace. */
export function getWorkspace(id: string): Promise<WorkspaceResponse> {
  return apiGet(`/workspaces/${encodeURIComponent(id)}`)
}

/** POST /api/workspaces — create a new workspace. */
export function createWorkspace(
  body: CreateWorkspaceRequest,
): Promise<WorkspaceResponse> {
  return apiPost("/workspaces", body)
}

/** PUT /api/workspaces/{id} — update a workspace's name, color, or description. */
export function updateWorkspace(
  id: string,
  body: UpdateWorkspaceRequest,
): Promise<WorkspaceResponse> {
  return apiPut(`/workspaces/${encodeURIComponent(id)}`, body)
}

/** DELETE /api/workspaces/{id} — delete an empty, non-default workspace. */
export function deleteWorkspace(id: string): Promise<void> {
  return apiDelete(`/workspaces/${encodeURIComponent(id)}`)
}
