/**
 * Secondary index (sindex) CRUD.
 * Endpoint base: /api/indexes
 */

import type { CreateIndexRequest, SecondaryIndex } from "../types/index";
import { apiDelete, apiGet, apiPost } from "./client";

/** GET /api/indexes/{conn_id} — list all secondary indexes in the cluster. */
export function listIndexes(connId: string): Promise<SecondaryIndex[]> {
  return apiGet(`/indexes/${encodeURIComponent(connId)}`);
}

/** POST /api/indexes/{conn_id} — create a new secondary index. */
export function createIndex(
  connId: string,
  body: CreateIndexRequest,
): Promise<SecondaryIndex> {
  return apiPost(`/indexes/${encodeURIComponent(connId)}`, body);
}

/** DELETE /api/indexes/{conn_id}?name=&ns= — drop a secondary index by name. */
export function dropIndex(
  connId: string,
  params: { name: string; ns: string },
): Promise<void> {
  return apiDelete(`/indexes/${encodeURIComponent(connId)}`, { query: { ...params } });
}
