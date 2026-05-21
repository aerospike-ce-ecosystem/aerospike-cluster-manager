/**
 * Operational guide types mirrored from backend Pydantic models.
 * See: api/src/aerospike_cluster_manager_api/models/guide.py
 */

/** Guide kind. Matches the backend Literal and the `ackoctl guide` argument. */
export type GuideType = "data-plane" | "control-plane"

export interface Guide {
  workspaceId: string
  guideType: GuideType
  title: string
  content: string
  createdAt: string
  updatedAt: string
  updatedBy?: string | null
}

export interface UpsertGuideRequest {
  title: string
  content: string
}

/** Ordered list of the guide kinds — drives the page layout. */
export const GUIDE_TYPES: readonly GuideType[] = [
  "data-plane",
  "control-plane",
] as const

/** Human-facing label for each guide kind. */
export const GUIDE_TYPE_LABEL: Record<GuideType, string> = {
  "data-plane": "Data-plane guide",
  "control-plane": "Control-plane guide",
}

/** One-line description shown under the title on the guides page. */
export const GUIDE_TYPE_DESCRIPTION: Record<GuideType, string> = {
  "data-plane":
    "Org/team policy for dynamic Aerospike data CRUD — TTL ceilings, note templates, naming rules.",
  "control-plane":
    "Org/team policy for Aerospike cluster lifecycle — test/stage/prod creation rules and approvals.",
}

/** Backend content cap (64 KB) — mirrors MAX_GUIDE_CONTENT_LENGTH. */
export const MAX_GUIDE_CONTENT_LENGTH = 65536
/** Backend title cap — mirrors MAX_GUIDE_TITLE_LENGTH. */
export const MAX_GUIDE_TITLE_LENGTH = 200
