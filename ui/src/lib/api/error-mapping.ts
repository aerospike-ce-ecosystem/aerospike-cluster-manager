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
 *   - 409                                           → conflict banner (record/version mismatch)
 *   - 422                                           → validation banner, surface backend detail
 *   - 503                                           → banner + retry, do not hide page
 *   - 504                                           → timeout banner, suggest retry
 *   - everything else                               → generic banner
 */
export type ApiErrorKind =
  | { kind: "security-disabled"; message: string }
  | { kind: "permission-denied"; message: string }
  | { kind: "not-found"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "validation"; message: string }
  | { kind: "unreachable"; message: string }
  | { kind: "timeout"; message: string }
  | { kind: "generic"; message: string }

// Backend emits the exact phrase "Security is not enabled. Add a 'security
// { }' block to aerospike.conf to manage users and roles." (see
// api/src/aerospike_cluster_manager_api/constants.py :: EE_MSG). Anchor on
// that phrase verbatim. The previous heuristic matched a lone `ee_msg`
// substring, which produces false positives on legitimate 403 responses
// like "EE_MSG: not authorized to drop role" — the user would then see
// the security-disabled card instead of the real permission-denied error.
function looksLikeSecurityDisabled(detail: string): boolean {
  return detail.toLowerCase().includes("security is not enabled")
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
      case 409:
        return {
          kind: "conflict",
          message: err.detail || "Conflict — record/version mismatch",
        }
      case 422:
        // FastAPI validation + aerospike-py RustPanic land here. Prefer the
        // backend detail string verbatim; only synthesize when it is empty.
        return {
          kind: "validation",
          message: err.detail
            ? `Validation: ${err.detail}`
            : "Validation error",
        }
      case 503:
        return { kind: "unreachable", message: err.detail }
      case 504:
        return {
          kind: "timeout",
          message: err.detail || "Aerospike timeout — try again",
        }
      default:
        return { kind: "generic", message: err.detail }
    }
  }
  return {
    kind: "generic",
    message: err instanceof Error ? err.message : String(err),
  }
}
