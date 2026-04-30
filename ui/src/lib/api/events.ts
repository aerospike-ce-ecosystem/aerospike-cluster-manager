/**
 * SSE (Server-Sent Events) subscription utility.
 * Endpoint: GET /api/events/stream
 *
 * The backend streams JSON-encoded events (see routers/events.py).
 * Each message's `data` field is a JSON string that we parse before
 * delivering to the consumer.
 */

import type { SSEEvent, SSEHandler } from "../types/events"
import { API_PREFIX } from "./client"

export interface SubscribeEventsOptions<T> {
  /** Filter: comma-separated event types to receive (matches `types` query param). */
  types?: string[]
  /** Fired for every parsed message. */
  onMessage?: SSEHandler<T>
  /** Fired whenever the connection errors (EventSource auto-reconnects by default). */
  onError?: (err: Event) => void
  /** Fired once on successful connection open. */
  onOpen?: (ev: Event) => void
}

export interface EventSubscription {
  /** Close the stream and remove listeners. */
  close(): void
  /** Underlying EventSource instance — escape hatch for advanced use. */
  readonly source: EventSource
}

/**
 * Subscribe to the backend SSE event stream. Returns a handle with a
 * `close()` method. Safe to call from the client only (EventSource is
 * browser-only; will throw in server components).
 */
export function subscribeEvents<T = unknown>(
  options: SubscribeEventsOptions<T> = {},
): EventSubscription {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    throw new Error("subscribeEvents can only be used in the browser")
  }
  const { types, onMessage, onError, onOpen } = options

  const params = new URLSearchParams()
  if (types && types.length > 0) params.set("types", types.join(","))
  const qs = params.toString()
  const url = `${API_PREFIX}/events/stream${qs ? `?${qs}` : ""}`

  const source = new EventSource(url)

  const messageHandler = (ev: MessageEvent) => {
    if (!onMessage) return
    let parsed: T
    try {
      parsed = JSON.parse(ev.data) as T
    } catch {
      // Fall back to raw string — callers may opt into that shape.
      parsed = ev.data as unknown as T
    }
    const wrapped: SSEEvent<T> = {
      event: ev.type || "message",
      data: parsed,
      id: ev.lastEventId || undefined,
    }
    onMessage(wrapped)
  }

  source.addEventListener("message", messageHandler)
  if (onOpen) source.addEventListener("open", onOpen)
  if (onError) source.addEventListener("error", onError)

  return {
    close: () => source.close(),
    source,
  }
}
