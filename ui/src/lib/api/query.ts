/**
 * Ad-hoc query execution (predicate / full scan / PK lookup).
 * Endpoint base: /api/query
 */

import type { QueryRequest, QueryResponse } from "../types/query"
import { apiPost } from "./client"

/** POST /api/query/{conn_id} — execute a query against Aerospike. */
export function runQuery(
  connId: string,
  body: QueryRequest,
): Promise<QueryResponse> {
  return apiPost(`/query/${encodeURIComponent(connId)}`, body)
}
