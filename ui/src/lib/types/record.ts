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
  /** Operator-authored memo from cluster-manager metaDB. Null when no note is attached. */
  note?: string | null
}

export interface RecordListResponse {
  records: AerospikeRecord[]
  /**
   * Object count for the set, or `null` when it could not be determined
   * (ADR-0026). `null` is an explicit "unknown" — it must NOT be rendered as
   * "no records", and it must not disable pagination. Show the loaded count
   * instead ("~N+ records").
   */
  total: number | null
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
