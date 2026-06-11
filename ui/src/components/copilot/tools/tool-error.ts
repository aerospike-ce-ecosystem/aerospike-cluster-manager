/**
 * Structured failure shape returned by copilot tool handlers (handlers never
 * throw — a thrown error kills the agent run).
 *
 * Shared by read-tools (handler side) and render-tools (renderer side) so
 * both discriminate failures identically. The guard requires BOTH keys:
 * some successful API payloads carry their own `error` field (e.g.
 * ConnectionStatus reports a connection failure as data), and matching on
 * `error` alone would misclassify them.
 */

export interface ToolError {
  error: string
  status?: number
  retryable: boolean
}

export function isToolError(value: unknown): value is ToolError {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as ToolError).error === "string" &&
    typeof (value as ToolError).retryable === "boolean"
  )
}
