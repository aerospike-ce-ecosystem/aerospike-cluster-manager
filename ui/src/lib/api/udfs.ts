/**
 * UDF (Lua user-defined function) management.
 * Endpoint base: /api/udfs
 */

import type { UDFModule, UploadUDFRequest } from "../types/udf"
import { apiDelete, apiGet, apiPost } from "./client"

/** GET /api/udfs/{conn_id} — list registered UDF modules. */
export function listUdfs(connId: string): Promise<UDFModule[]> {
  return apiGet(`/udfs/${encodeURIComponent(connId)}`)
}

/** POST /api/udfs/{conn_id} — upload (register) a new UDF. */
export function uploadUdf(
  connId: string,
  body: UploadUDFRequest,
): Promise<UDFModule> {
  return apiPost(`/udfs/${encodeURIComponent(connId)}`, body)
}

/** DELETE /api/udfs/{conn_id}?filename= — remove a UDF module. */
export function removeUdf(connId: string, filename: string): Promise<void> {
  return apiDelete(`/udfs/${encodeURIComponent(connId)}`, {
    query: { filename },
  })
}
