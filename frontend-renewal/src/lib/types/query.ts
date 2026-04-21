/**
 * Query & filter types mirrored from backend Pydantic models.
 * See: backend/src/aerospike_cluster_manager_api/models/query.py
 */

import type { AerospikeRecord, BinValue, PkType } from "./record";

export type QueryPredicateOperator =
  | "equals"
  | "between"
  | "contains"
  | "geo_within_region"
  | "geo_contains_point";

export interface QueryPredicate {
  bin: string;
  operator: QueryPredicateOperator;
  value: BinValue;
  value2?: BinValue | null;
}

export interface QueryRequest {
  namespace: string;
  set?: string | null;
  predicate?: QueryPredicate | null;
  selectBins?: string[] | null;
  expression?: string | null;
  maxRecords?: number | null;
  primaryKey?: string | null;
  pkType?: PkType;
}

export interface QueryResponse {
  records: AerospikeRecord[];
  executionTimeMs: number;
  scannedRecords: number;
  returnedRecords: number;
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
  | "geo_contains";

export type BinDataType =
  | "integer"
  | "float"
  | "string"
  | "bool"
  | "list"
  | "map"
  | "geo";

export interface FilterCondition {
  bin: string;
  operator: FilterOperator;
  value?: BinValue | null;
  value2?: BinValue | null;
  binType?: BinDataType;
}

export interface FilterGroup {
  logic?: "and" | "or";
  conditions: FilterCondition[];
}

export interface FilteredQueryRequest {
  namespace: string;
  set?: string | null;
  filters?: FilterGroup | null;
  predicate?: QueryPredicate | null;
  selectBins?: string[] | null;
  maxRecords?: number | null;
  page?: number;
  pageSize?: number;
  primaryKey?: string | null;
  pkType?: PkType;
}

export interface FilteredQueryResponse {
  records: AerospikeRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  executionTimeMs: number;
  scannedRecords: number;
  returnedRecords: number;
  totalEstimated: boolean;
}
