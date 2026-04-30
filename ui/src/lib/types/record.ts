/**
 * Record-related types mirrored from backend Pydantic models.
 * See: backend/src/aerospike_cluster_manager_api/models/record.py
 */

export type BinValue = unknown

export type PkType = "auto" | "string" | "int" | "bytes"

export interface GeoJSON {
  type: string
  coordinates: unknown[]
}

export interface RecordKey {
  namespace: string
  set?: string
  pk?: string
  digest?: string | null
}

export interface RecordMeta {
  generation: number
  ttl: number
  lastUpdateMs?: number | null
}

export interface AerospikeRecord {
  key: RecordKey
  meta: RecordMeta
  bins: Record<string, BinValue>
}

export interface RecordListResponse {
  records: AerospikeRecord[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  totalEstimated: boolean
}

export interface RecordWriteRequest {
  key: RecordKey
  bins: Record<string, BinValue>
  ttl?: number | null
  pkType?: PkType
}
