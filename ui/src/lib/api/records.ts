/**
 * Record CRUD + filtered scan.
 * Endpoint base: /api/records
 */

import type {
  FilteredQueryRequest,
  FilteredQueryResponse,
} from "../types/query"
import type {
  AerospikeRecord,
  PkType,
  RecordListResponse,
  RecordWriteRequest,
} from "../types/record"
import { apiDelete, apiGet, apiPost } from "./client"

export interface ListRecordsParams {
  ns: string
  set?: string
  pageSize?: number
}

/** GET /api/records/{conn_id} — list up to pageSize records from a set. */
export function listRecords(
  connId: string,
  params: ListRecordsParams,
): Promise<RecordListResponse> {
  return apiGet(`/records/${encodeURIComponent(connId)}`, {
    query: { ...params },
  })
}

export interface RecordLookupParams {
  ns: string
  set: string
  pk: string
  pk_type?: PkType
}

/** GET /api/records/{conn_id}/detail — single record by (ns, set, pk). */
export function getRecordDetail(
  connId: string,
  params: RecordLookupParams,
): Promise<AerospikeRecord> {
  return apiGet(`/records/${encodeURIComponent(connId)}/detail`, {
    query: { ...params },
  })
}

/** POST /api/records/{conn_id} — write (create or update) a record. */
export function putRecord(
  connId: string,
  body: RecordWriteRequest,
): Promise<AerospikeRecord> {
  return apiPost(`/records/${encodeURIComponent(connId)}`, body)
}

/** DELETE /api/records/{conn_id} — delete a record by (ns, set, pk). */
export function deleteRecord(
  connId: string,
  params: RecordLookupParams,
): Promise<void> {
  return apiDelete(`/records/${encodeURIComponent(connId)}`, {
    query: { ...params },
  })
}

/** POST /api/records/{conn_id}/filter — filtered + paginated scan. */
export function filterRecords(
  connId: string,
  body: FilteredQueryRequest,
): Promise<FilteredQueryResponse> {
  return apiPost(`/records/${encodeURIComponent(connId)}/filter`, body)
}
