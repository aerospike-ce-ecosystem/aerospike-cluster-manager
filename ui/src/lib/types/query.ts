/**
 * Query & filter types mirrored from backend Pydantic models.
 * See: backend/src/aerospike_cluster_manager_api/models/query.py
 */

import type { AerospikeRecord, BinValue, PkType } from "./record"

export type QueryPredicateOperator =
  | "equals"
  | "between"
  | "contains"
  | "geo_within_region"
  | "geo_contains_point"

export interface QueryPredicate {
  bin: string
  operator: QueryPredicateOperator
  value: BinValue
  value2?: BinValue | null
}

export interface QueryRequest {
  namespace: string
  set?: string | null
  predicate?: QueryPredicate | null
  selectBins?: string[] | null
  expression?: string | null
  maxRecords?: number | null
  primaryKey?: string | null
  pkType?: PkType
}

export interface QueryResponse {
  records: AerospikeRecord[]
  executionTimeMs: number
  scannedRecords: number
  returnedRecords: number
}

export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "ge"
  | "lt"
  | "le"
  | "between"
  | "contains"
  | "not_contains"
  | "regex"
  | "exists"
  | "not_exists"
  | "is_true"
  | "is_false"
  | "geo_within"
  | "geo_contains"
  | "pk_prefix"
  | "pk_regex"

/**
 * PK match modes for the top-level pkPattern field on FilteredQueryRequest.
 * - "exact": single-record client.get short-circuit (no scan).
 * - "prefix" / "regex": full set scan + server-side regex_compare on the
 *   record's user key. Only matches records written with POLICY_KEY_SEND.
 */
export type PkMatchMode = "exact" | "prefix" | "regex"

/**
 * Sentinel bin name for FilterCondition entries that target the primary key
 * via pk_prefix / pk_regex operators. Mirrors PK_BIN_PLACEHOLDER on the API.
 */
export const PK_BIN_PLACEHOLDER = "__pk__"

export type BinDataType =
  | "integer"
  | "float"
  | "string"
  | "bool"
  | "list"
  | "map"
  | "geo"

export interface FilterCondition {
  bin: string
  operator: FilterOperator
  value?: BinValue | null
  value2?: BinValue | null
  binType?: BinDataType
}

export interface FilterGroup {
  logic?: "and" | "or"
  conditions: FilterCondition[]
}

export interface FilteredQueryRequest {
  namespace: string
  set?: string | null
  filters?: FilterGroup | null
  predicate?: QueryPredicate | null
  selectBins?: string[] | null
  maxRecords?: number | null
  page?: number
  pageSize?: number
  primaryKey?: string | null
  pkType?: PkType
  /** PK pattern; canonical replacement for primaryKey. */
  pkPattern?: string | null
  /** Match mode for pkPattern. Defaults to "exact" when omitted. */
  pkMatchMode?: PkMatchMode
}

export interface FilteredQueryResponse {
  records: AerospikeRecord[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  executionTimeMs: number
  scannedRecords: number
  returnedRecords: number
  totalEstimated: boolean
}
