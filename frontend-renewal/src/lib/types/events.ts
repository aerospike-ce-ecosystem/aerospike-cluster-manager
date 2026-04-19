/**
 * SSE event stream types.
 * Backend endpoint: GET /api/events/stream (see routers/events.py)
 *
 * Shape: events are a JSON string in the `data` field of the SSE message.
 * The event `event` name is free-form — backend sends domain-specific
 * event names like "connection.status", "cluster.updated", etc.
 */

export interface SSEEvent<T = unknown> {
  /** Event type name (from `event:` field). Defaults to "message". */
  event: string
  /** Parsed JSON payload from the `data:` field. */
  data: T
  /** Event id from the `id:` field, if present. */
  id?: string
}

export type SSEHandler<T = unknown> = (event: SSEEvent<T>) => void
