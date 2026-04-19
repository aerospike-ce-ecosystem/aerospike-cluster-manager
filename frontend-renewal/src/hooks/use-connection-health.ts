/**
 * useConnectionHealth — subscribes to the SSE `connection.health` event
 * stream and populates the connection-store `healthStatuses` map so the
 * sidebar can render a live status dot per cluster row.
 *
 * Falls back to periodic polling (via `GET /api/connections/{id}/health`)
 * at `SIDEBAR_HEALTH_POLL_INTERVAL_MS` when the SSE stream errors out,
 * matching the original `frontend/` behaviour.
 */

"use client"

import { useEffect } from "react"

import { useEventStream } from "@/hooks/use-event-stream"
import { getConnectionHealth } from "@/lib/api/connections"
import { SIDEBAR_HEALTH_POLL_INTERVAL_MS } from "@/lib/constants"
import type {
  ConnectionProfileResponse,
  ConnectionStatus,
} from "@/lib/types/connection"
import { useConnectionStore } from "@/stores/connection-store"

/**
 * Shape of the `connection.health` SSE payload. Backend emits camelCase.
 * Mirrors the subset of `ConnectionStatus` we care about in the sidebar.
 */
interface ConnectionHealthEvent {
  connectionId: string
  connected: boolean
  nodeCount?: number
  namespaceCount?: number
  build?: string | null
  edition?: string | null
  memoryUsed?: number
  memoryTotal?: number
  diskUsed?: number
  diskTotal?: number
  tendHealthy?: boolean | null
  error?: string | null
}

export function useConnectionHealth(
  connections: ConnectionProfileResponse[] | null,
) {
  const setHealth = useConnectionStore((s) => s.setHealth)

  // SSE subscription — fires for every `connection.health` push.
  const { error: sseError } = useEventStream<ConnectionHealthEvent>({
    types: ["connection.health"],
    enabled: true,
    onMessage: (evt) => {
      if (evt.event !== "connection.health") return
      const d = evt.data
      if (!d || !d.connectionId) return
      setHealth(d.connectionId, {
        connected: Boolean(d.connected),
        nodeCount: d.nodeCount ?? 0,
        namespaceCount: d.namespaceCount ?? 0,
        build: d.build ?? null,
        edition: d.edition ?? null,
        memoryUsed: d.memoryUsed ?? 0,
        memoryTotal: d.memoryTotal ?? 0,
        diskUsed: d.diskUsed ?? 0,
        diskTotal: d.diskTotal ?? 0,
        tendHealthy: d.tendHealthy ?? null,
        error: d.error ?? null,
      })
    },
  })

  // Stable dep keys so ESLint doesn't complain about dynamic expressions in
  // the useEffect dependency array.
  const connectionIdsKey = connections
    ? connections.map((c) => c.id).join(",")
    : ""
  const sseBroken = Boolean(sseError)

  // Polling fallback. Always runs an immediate snapshot on mount (regardless
  // of SSE state) so the sidebar isn't blank before the first push arrives;
  // thereafter we only poll when SSE is actively broken.
  useEffect(() => {
    if (!connections || connections.length === 0) return

    let cancelled = false

    const pollOnce = async () => {
      await Promise.all(
        connections.map(async (c) => {
          try {
            const status: ConnectionStatus = await getConnectionHealth(c.id)
            if (!cancelled) setHealth(c.id, status)
          } catch {
            // leave existing status intact
          }
        }),
      )
    }

    void pollOnce()

    // Only run the recurring poll when SSE is known to be broken.
    if (!sseError) {
      return () => {
        cancelled = true
      }
    }

    const interval = setInterval(() => {
      void pollOnce()
    }, SIDEBAR_HEALTH_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // connections.length + ids are the only state we care about, not the
    // full array identity — stringify to avoid thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionIdsKey, sseBroken, setHealth])
}
