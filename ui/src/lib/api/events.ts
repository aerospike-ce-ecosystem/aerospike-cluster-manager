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

import { refreshToken } from "@/lib/auth/keycloak"
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

/** Backoff envelope for the auto-reconnect loop. */
const RECONNECT_INITIAL_MS = 1_000
const RECONNECT_MAX_MS = 30_000

function buildStreamUrl(types?: string[]): string {
  const params = new URLSearchParams()
  if (types && types.length > 0) params.set("types", types.join(","))

  // Multi-cluster + OIDC mode: append cluster id and JWT so SSE works across
  // origins without an Authorization header (EventSource limitation).
  //
  // SECURITY: the access token appears in the request URL. This means the
  // token can leak via (a) upstream ingress access logs, (b) browser dev
  // tools, (c) Referer headers if the SSE response page links elsewhere.
  // Mitigations: short token TTL, mandatory access-log masking on every
  // ingress that sits in front of the API (documented in
  // aerospike-ce-kubernetes-operator/docs/multi-cluster-keycloak.md), and
  // logging middleware on the API masks `access_token`/`id_token` query
  // params before persisting them. See ADR-0040 follow-up: the long-term
  // fix is per-stream signed nonces or transport upgrades that allow
  // header-based auth on subscriptions.
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
  const baseHost = active?.apiUrl?.replace(/\/+$/, "") ?? ""
  if (token) {
    // TODO(ADR-0040 follow-up): replace with per-stream signed nonce or
    // cookie-based auth so the token does not appear in the URL. EventSource
    // does not support custom headers in stock browsers, so this remains the
    // workaround until the broker grows a dedicated handshake endpoint.
    //
    // Until that lands, refuse to open the stream against a plain-http
    // origin: the JWT would travel as cleartext in the URL and end up in
    // every reverse-proxy access log on the path. Operators must serve the
    // API over https before SSE+OIDC can be used.
    if (active?.apiUrl && /^http:\/\//i.test(active.apiUrl)) {
      throw new Error(
        "[events.ts] refusing to open SSE stream over plain http://: " +
          "the access_token query param would leak via access logs. " +
          "Configure the cluster apiUrl to use https://. " +
          "Tracking: ADR-0040 follow-up.",
      )
    }
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[events.ts] access_token is being sent in the SSE URL query " +
          "string. Ensure the ingress masks `access_token` from access logs. " +
          "Tracking: ADR-0040 follow-up.",
      )
    }
    params.set("access_token", token)
  }

  const qs = params.toString()
  return `${baseHost}${API_PREFIX}/events/stream${qs ? `?${qs}` : ""}`
}

/**
 * Subscribe to the backend SSE event stream. Returns a handle with a
 * `close()` method. Safe to call from the client only (EventSource is
 * browser-only; will throw in server components).
 *
 * Auth-aware reconnect: when the EventSource transitions to ``CLOSED`` (the
 * only state we can observe — ``EventSource`` does not surface HTTP status
 * codes), we treat it as a likely 401/expired-token and try to refresh the
 * access token before re-opening the stream. We back off exponentially
 * (1s → 30s) on repeated failures so a permanently-broken auth doesn't melt
 * the API into a reconnect storm.
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

    const url = buildStreamUrl(types)
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
      // attempt a token refresh and re-open ourselves, otherwise leave the
      // browser's reconnect to do its job.
      if (next.readyState === EventSource.CLOSED) {
        next.close()
        if (closed) return
        // Attempt a one-shot token refresh; on success we immediately reopen
        // with the new token, otherwise we fall back to backoff so we don't
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
