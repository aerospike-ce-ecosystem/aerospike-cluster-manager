/**
 * Copilot client-side error logging. Keeps the chat UI from failing silently
 * (bad runtime URL, 401/503 from the runtime gate, provider errors) — without
 * it, connection failures leave the popup stuck in "connecting…".
 */

import type { CopilotErrorEvent } from "@copilotkit/shared"

export function logCopilotError(event: CopilotErrorEvent): void {
  // Only surface genuine errors; the handler also receives lifecycle events
  // (request/response/...) when observability hooks are enabled.
  if (event.type !== "error") return
  console.error(
    `[copilot] ${event.context.source} error:`,
    event.error,
    event.context.request?.path ?? "",
  )
}
