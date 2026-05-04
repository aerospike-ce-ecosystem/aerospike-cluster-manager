"use client"

import { ApiError } from "./client"

/**
 * Mapped API error kinds. Pages branch on this discriminator to render
 * the right UI surface per the ui/CLAUDE.md "API error → UI state mapping"
 * contract:
 *
 *   - 403 with EE_MSG ("Security is not enabled…") → security-disabled card
 *   - 403 otherwise                                 → permission-denied
 *   - 404                                           → empty state for the resource
 *   - 503                                           → banner + retry, do not hide page
 *   - everything else                               → generic banner
 */
export type ApiErrorKind =
  | { kind: "security-disabled"; message: string }
  | { kind: "permission-denied"; message: string }
  | { kind: "not-found"; message: string }
  | { kind: "unreachable"; message: string }
  | { kind: "generic"; message: string }

const SECURITY_DISABLED_MARKERS = ["security is not enabled", "ee_msg"] as const

function looksLikeSecurityDisabled(detail: string): boolean {
  const lower = detail.toLowerCase()
  return SECURITY_DISABLED_MARKERS.some((m) => lower.includes(m))
}

export function mapApiError(err: unknown): ApiErrorKind {
  if (err instanceof ApiError) {
    if (err.status === 403 && looksLikeSecurityDisabled(err.detail)) {
      return { kind: "security-disabled", message: err.detail }
    }
    switch (err.status) {
      case 403:
        return { kind: "permission-denied", message: err.detail }
      case 404:
        return { kind: "not-found", message: err.detail }
      case 503:
        return { kind: "unreachable", message: err.detail }
      default:
        return { kind: "generic", message: err.detail }
    }
  }
  return {
    kind: "generic",
    message: err instanceof Error ? err.message : String(err),
  }
}
