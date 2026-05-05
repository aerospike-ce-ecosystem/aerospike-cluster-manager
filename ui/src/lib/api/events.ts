/**
 * SSE (Server-Sent Events) subscription utility.
 * Endpoint: GET /api/events/stream
 *
 * The backend streams JSON-encoded events (see routers/events.py).
 * Each message's `data` field is a JSON string that we parse before
 * delivering to the consumer.
 *
 * Auth: `EventSource` cannot set headers, so the access token is appended as
 * `?access_token=<jwt>` and the active cluster id as `&cluster=<id>`. The
 * backend (Stream B) reads these and applies the same JWT verification as the
 * Authorization header path.
 */

import { useAuthStore } from "@/stores/auth-store"
import { useClusterSelectorStore } from "@/stores/cluster-selector-store"

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

  // Multi-cluster + OIDC mode: append cluster id and JWT so SSE works across
  // origins without an Authorization header (EventSource limitation).
  const selector = useClusterSelectorStore.getState()
  const active =
    selector.registry?.clusters.find(
      (c) => c.id === selector.currentClusterId,
    ) ??
    selector.registry?.clusters.find(
      (c) => c.id === selector.registry?.defaultClusterId,
    ) ??
    null
  if (active) params.set("cluster", active.id)
  const token = useAuthStore.getState().accessToken
  if (token) params.set("access_token", token)

  const qs = params.toString()
  const baseHost = active?.apiUrl?.replace(/\/+$/, "") ?? ""
  const url = `${baseHost}${API_PREFIX}/events/stream${qs ? `?${qs}` : ""}`

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
