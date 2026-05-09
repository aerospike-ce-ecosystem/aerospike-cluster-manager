"use client"

import { ApiError } from "./client"

/**
 * Log a fetch failure with structured context.
 *
 * Goes through `console.error` so it shows up in DevTools and any
 * downstream telemetry that hooks into console output. Extracts
 * status/detail/body from `ApiError` to keep the payload terse;
 * passes the raw error through otherwise.
 *
 * SECURITY: response bodies on connection-test, password-change, and
 * OIDC-failure endpoints can echo back submitted credentials or tokens.
 * In production we therefore log only `{ status, scope, message }` and
 * keep the full `{ detail, body }` payload behind a NODE_ENV guard so
 * downstream telemetry does not persist secrets.
 */
export function logFetchError(scope: string, err: unknown): void {
  if (err instanceof ApiError) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error(`[${scope}] fetch failed`, {
        status: err.status,
        detail: err.detail,
        body: err.body,
      })
      return
    }
    // eslint-disable-next-line no-console
    console.error(`[${scope}] fetch failed`, {
      status: err.status,
      scope,
      message: err.message,
    })
    return
  }
  // eslint-disable-next-line no-console
  console.error(`[${scope}] fetch failed`, err)
}
