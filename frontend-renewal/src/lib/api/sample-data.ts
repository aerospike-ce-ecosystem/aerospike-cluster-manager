/**
 * Sample data generator — POST /api/sample-data/{conn_id}
 *
 * Bulk-writes synthetic records with varied bin types (int/str/double/bool/list/map/geojson)
 * and optionally creates matching secondary indexes. Useful for populating a fresh cluster
 * or exploring the record browser without hand-crafting data.
 */

import type {
  CreateSampleDataRequest,
  CreateSampleDataResponse,
} from "../types/sample-data";
import { apiPost } from "./client";

export function createSampleData(
  connId: string,
  data: CreateSampleDataRequest,
): Promise<CreateSampleDataResponse> {
  return apiPost(`/sample-data/${encodeURIComponent(connId)}`, data, { timeoutMs: 60_000 });
}
