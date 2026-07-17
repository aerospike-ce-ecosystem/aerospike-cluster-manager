/**
 * SSE (Server-Sent Events) subscription utility.
 * Endpoint: GET /api/events/stream
 *
 * The backend streams JSON-encoded events (see routers/events.py).
 * Each message's `data` field is a JSON string that we parse before
 * delivering to the consumer.
 *
 * Auth (issue #345, ADR-0040 follow-up): native `EventSource` cannot set an
 * Authorization header, and putting the JWT in the URL leaks it into ingress
 * access logs, browser history, and Referer headers. Instead, when an access
 * token is present we first mint a short-lived, single-use opaque ticket via
 * an authenticated `POST /api/events/ticket` (Authorization header), then
 * connect with `?ticket=<opaque>`. The backend burns the ticket on first
 * use, so a URL that leaks into an access log is already worthless — and the
 * long-lived JWT never appears in any URL.
 */

import { refreshToken } from "@/lib/auth/keycloak"
import { useAuthStore } from "@/stores/auth-store"
import {
  getActiveCluster,
  type ClusterEntry,
} from "@/stores/cluster-selector-store"

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

/** Backoff envelope for the auto-reconnect loop. */
const RECONNECT_INITIAL_MS = 1_000
const RECONNECT_MAX_MS = 30_000

/** Resolve the active cluster's API origin ("" = same-origin / proxy mode). */
function resolveBaseHost(active: ClusterEntry | null): string {
  return active?.apiUrl?.replace(/\/+$/, "") ?? ""
}

/**
 * Exchange the in-memory access token for a single-use SSE stream ticket.
 * Returns `null` when the backend rejects the mint (expired token, SSE
 * disabled, ...) — callers decide whether to refresh and retry or back off.
 * Uses raw `fetch` (not apiFetch) so a failing background stream never
 * triggers apiFetch's login redirect side effect.
 */
async function mintStreamTicket(
  baseHost: string,
  token: string,
): Promise<string | null> {
  const res = await fetch(`${baseHost}${API_PREFIX}/events/ticket`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) return null
  try {
    const body = (await res.json()) as { ticket?: unknown }
    return typeof body.ticket === "string" && body.ticket.length > 0
      ? body.ticket
      : null
  } catch {
    return null
  }
}

function buildStreamUrl(
  active: ClusterEntry | null,
  types?: string[],
  ticket?: string | null,
): string {
  const params = new URLSearchParams()
  if (types && types.length > 0) params.set("types", types.join(","))
  // Multi-cluster mode: pin the stream to the active cluster.
  if (active) params.set("cluster", active.id)
  // Single-use handshake ticket — never the JWT itself (issue #345).
  if (ticket) params.set("ticket", ticket)

  const qs = params.toString()
  return `${resolveBaseHost(active)}${API_PREFIX}/events/stream${qs ? `?${qs}` : ""}`
}

/**
 * Subscribe to the backend SSE event stream. Returns a handle with a
 * `close()` method. Safe to call from the client only (EventSource is
 * browser-only; will throw in server components).
 *
 * Auth-aware reconnect: when the EventSource transitions to ``CLOSED`` (the
 * only state we can observe — ``EventSource`` does not surface HTTP status
 * codes), we treat it as a likely 401/expired-token and try to refresh the
 * access token before re-opening the stream. Every (re)open mints a fresh
 * single-use ticket — tickets are burned server-side on first connect. We
 * back off exponentially (1s → 30s) on repeated failures so a permanently-
 * broken auth doesn't melt the API into a reconnect storm.
 */
export function subscribeEvents<T = unknown>(
  options: SubscribeEventsOptions<T> = {},
): EventSubscription {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    throw new Error("subscribeEvents can only be used in the browser")
  }
  const { types, onMessage, onError, onOpen } = options

  let source: EventSource | null = null
  let closed = false
  let reconnectTimer: number | null = null
  let backoffMs = RECONNECT_INITIAL_MS

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

  const scheduleReconnect = () => {
    if (closed) return
    if (reconnectTimer !== null) return
    const delay = backoffMs
    backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS)
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      void openConnection()
    }, delay)
  }

  const openConnection = async () => {
    if (closed) return

    // Tear down any previous EventSource before starting a fresh one.
    if (source) {
      source.close()
      source = null
    }

    const active = getActiveCluster()

    // OIDC mode: exchange the access token for a single-use stream ticket.
    // The JWT itself must never be placed in the URL (issue #345).
    let ticket: string | null = null
    const token = useAuthStore.getState().accessToken
    if (token) {
      try {
        ticket = await mintStreamTicket(resolveBaseHost(active), token)
        if (!ticket && !closed) {
          // Mint rejected — most likely an expired token. Refresh once and
          // retry before falling back to the backoff loop.
          const newToken = await refreshToken()
          if (newToken && !closed) {
            ticket = await mintStreamTicket(resolveBaseHost(active), newToken)
          }
        }
      } catch {
        ticket = null
      }
      if (closed) return
      if (!ticket) {
        onError?.(new Event("error"))
        scheduleReconnect()
        return
      }
    }

    const url = buildStreamUrl(active, types, ticket)
    const next = new EventSource(url)
    source = next

    next.addEventListener("open", (ev) => {
      // Successful open resets the backoff envelope.
      backoffMs = RECONNECT_INITIAL_MS
      onOpen?.(ev)
    })

    next.addEventListener("message", messageHandler)

    next.addEventListener("error", (ev) => {
      onError?.(ev)
      // EventSource auto-reconnects on transient errors but stays in CLOSED
      // when the server hard-rejected the request (e.g. 401). In that case,
      // attempt a token refresh and re-open ourselves (which mints a fresh
      // ticket), otherwise leave the browser's reconnect to do its job.
      // NOTE: the browser's own auto-reconnect replays the same URL — with a
      // burned single-use ticket that replay is rejected and lands here as a
      // CLOSED stream, funnelling all reconnects through openConnection().
      if (next.readyState === EventSource.CLOSED) {
        next.close()
        if (closed) return
        // Attempt a one-shot token refresh; on success we immediately reopen
        // with a fresh ticket, otherwise we fall back to backoff so we don't
        // hammer the API while auth is permanently broken.
        void refreshToken()
          .then((newToken) => {
            if (closed) return
            if (newToken) {
              backoffMs = RECONNECT_INITIAL_MS
              void openConnection()
            } else {
              scheduleReconnect()
            }
          })
          .catch(() => {
            if (!closed) scheduleReconnect()
          })
      }
    })
  }

  void openConnection()

  return {
    close: () => {
      closed = true
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (source) {
        source.close()
      }
    },
    // Best-effort accessor for advanced consumers; may briefly point at a
    // closed instance during reconnect, which is fine because we never expose
    // it before the first open completes for new consumers.
    get source(): EventSource {
      if (!source) {
        throw new Error("EventSource is not yet initialised")
      }
      return source
    },
  }
}
