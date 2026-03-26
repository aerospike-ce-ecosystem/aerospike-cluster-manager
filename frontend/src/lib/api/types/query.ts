import type { AerospikeRecord, BinValue } from "./records";

// === Query ===
export type PredicateOperator =
  | "equals"
  | "between"
  | "contains"
  | "geo_within_region"
  | "geo_contains_point";

export interface QueryPredicate {
  bin: string;
  operator: PredicateOperator;
  value: BinValue;
  value2?: BinValue; // for 'between'
}

export interface QueryRequest {
  namespace: string;
  set?: string;
  predicate?: QueryPredicate;
  selectBins?: string[];
  expression?: string; // raw JSON expression
  maxRecords?: number;
  primaryKey?: string;
}

export interface QueryResponse {
  records: AerospikeRecord[];
  executionTimeMs: number;
  scannedRecords: number;
  returnedRecords: number;
}

// === Filter ===
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

export type BinDataType = "integer" | "float" | "string" | "bool" | "list" | "map" | "geo";

export interface FilterCondition {
  id: string;
  bin: string;
  operator: FilterOperator;
  value?: BinValue;
  value2?: BinValue;
  binType: BinDataType;
}

export interface FilterGroup {
  logic: "and" | "or";
  conditions: FilterCondition[];
}

export interface FilteredQueryRequest {
  namespace: string;
  set?: string;
  filters?: FilterGroup;
  predicate?: QueryPredicate;
  selectBins?: string[];
  maxRecords?: number;
  page?: number;
  pageSize?: number;
  primaryKey?: string;
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
  totalEstimated?: boolean;
}

// === Index ===
export type IndexType = "numeric" | "string" | "geo2dsphere";
export type IndexState = "ready" | "building" | "error";

export interface SecondaryIndex {
  name: string;
  namespace: string;
  set: string;
  bin: string;
  type: IndexType;
  state: IndexState;
}

export interface CreateIndexRequest {
  namespace: string;
  set: string;
  bin: string;
  name: string;
  type: IndexType;
}
