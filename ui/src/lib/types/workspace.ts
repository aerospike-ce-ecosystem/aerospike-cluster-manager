/**
 * Workspace-related types mirrored from API Pydantic models.
 * See: api/src/aerospike_cluster_manager_api/models/workspace.py
 */

/** Identifier of the built-in workspace seeded by the backend migration. */
export const DEFAULT_WORKSPACE_ID = "ws-default"

export interface WorkspaceResponse {
  id: string
  name: string
  color: string
  description?: string | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateWorkspaceRequest {
  name: string
  color?: string
  description?: string | null
}

export interface UpdateWorkspaceRequest {
  name?: string
  color?: string
  description?: string | null
}
