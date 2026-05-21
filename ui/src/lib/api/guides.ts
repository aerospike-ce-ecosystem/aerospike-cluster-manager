/**
 * Operational guide CRUD.
 * Endpoint base: /api/guides
 *
 * Guides are workspace-scoped Markdown policy documents — one data-plane and
 * one control-plane guide per workspace. See the backend `routers/guides.py`.
 */

import type { Guide, GuideType, UpsertGuideRequest } from "../types/guide"
import { apiDelete, apiGet, apiPut } from "./client"

interface GuidesListResponse {
  guides: Guide[]
}

const enc = encodeURIComponent

/** GET /api/guides/{workspaceId} — list the guides registered for a workspace. */
export async function listGuides(workspaceId: string): Promise<Guide[]> {
  const resp = await apiGet<GuidesListResponse>(`/guides/${enc(workspaceId)}`)
  return resp.guides
}

/**
 * GET /api/guides/{workspaceId}/{guideType} — fetch one guide.
 * Throws `ApiError` with status 404 when the guide is not registered yet.
 */
export function getGuide(
  workspaceId: string,
  guideType: GuideType,
): Promise<Guide> {
  return apiGet<Guide>(`/guides/${enc(workspaceId)}/${enc(guideType)}`)
}

/**
 * PUT /api/guides/{workspaceId}/{guideType} — register (first write) or
 * update (subsequent writes) a guide. Returns the persisted row.
 */
export function upsertGuide(
  workspaceId: string,
  guideType: GuideType,
  body: UpsertGuideRequest,
): Promise<Guide> {
  return apiPut<Guide>(`/guides/${enc(workspaceId)}/${enc(guideType)}`, body)
}

/** DELETE /api/guides/{workspaceId}/{guideType} — remove a guide (idempotent). */
export function deleteGuide(
  workspaceId: string,
  guideType: GuideType,
): Promise<void> {
  return apiDelete(`/guides/${enc(workspaceId)}/${enc(guideType)}`)
}
