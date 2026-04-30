/**
 * Secondary index types mirrored from backend Pydantic models.
 * See: backend/src/aerospike_cluster_manager_api/models/index.py
 *
 * NOTE: This file is the sindex/secondary-index types module.
 * Do not turn it into a barrel export — import each types file directly
 * to avoid ambiguity with the default module resolution.
 */

export type SecondaryIndexType = "numeric" | "string" | "geo2dsphere"
export type SecondaryIndexState = "ready" | "building" | "error"

export interface SecondaryIndex {
  name: string
  namespace: string
  set: string
  bin: string
  type: SecondaryIndexType
  state: SecondaryIndexState
}

export interface CreateIndexRequest {
  namespace: string
  set: string
  bin: string
  name: string
  type: SecondaryIndexType
}
