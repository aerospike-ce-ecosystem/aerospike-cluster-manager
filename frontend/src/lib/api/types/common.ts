// === Pagination ===

/**
 * Standardized paginated response envelope.
 * Matches the backend's PaginatedResponse[T] model.
 * New endpoints should return this shape; existing endpoints (e.g. RecordListResponse)
 * keep their current shape for backward compatibility.
 */
export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number | null;
  hasMore: boolean;
}

// === Sample Data ===
export interface CreateSampleDataRequest {
  namespace: string;
  setName?: string;
  recordCount?: number;
  createIndexes?: boolean;
}

export interface CreateSampleDataResponse {
  recordsCreated: number;
  indexesCreated: string[];
  indexesSkipped: string[];
  elapsedMs: number;
}
