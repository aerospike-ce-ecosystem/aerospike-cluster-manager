/**
 * useCluster — fetch cluster info (nodes, namespaces, sets) for a connection.
 * Re-fetches whenever connId changes. Pass `null` / `undefined` to skip.
 *
 * Also polls on an interval (#474). The SSE push channel is inert in the
 * default configuration — the collector's publish bodies are gated on
 * `CM_SSE_BROADCAST_PER_CONNECTION`, which defaults false — and nothing polled
 * in its place, so the cluster overview showed the values captured at page
 * load and gave no hint they were stale. For a tool whose job is watching
 * cluster health, silently frozen numbers are worse than an error.
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { getCluster } from "@/lib/api/clusters"
import { logFetchError } from "@/lib/api/log"
import type { ClusterInfo } from "@/lib/types/cluster"

/** How often to re-read cluster info while the tab is visible. */
export const CLUSTER_POLL_INTERVAL_MS = 5_000

export interface UseClusterResult {
  data: ClusterInfo | null
  error: Error | null
  isLoading: boolean
  refetch: () => Promise<void>
  /** Timestamp of the last successful read, for a "last updated" hint. */
  lastUpdatedAt: number | null
}

export function useCluster(
  connId: string | null | undefined,
  {
    pollIntervalMs = CLUSTER_POLL_INTERVAL_MS,
  }: { pollIntervalMs?: number } = {},
): UseClusterResult {
  const [data, setData] = useState<ClusterInfo | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(!!connId)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)

  // Mounted guard so a refetch resolving after unmount doesn't setState.
  // Mirrors useGuides / useConnections.
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const refetch = useCallback(async () => {
    if (!connId) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await getCluster(connId)
      if (!isMountedRef.current) return
      setData(result)
      setLastUpdatedAt(Date.now())
    } catch (err) {
      logFetchError("cluster", err)
      if (!isMountedRef.current) return
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      if (isMountedRef.current) setIsLoading(false)
    }
  }, [connId])

  useEffect(() => {
    if (!connId) {
      setData(null)
      setError(null)
      setIsLoading(false)
      setLastUpdatedAt(null)
      return
    }
    let cancelled = false
    // Wipe the previous cluster's data so pages can't render it under the
    // new cluster's URL while loading — or permanently, if the new fetch
    // fails. refetch() intentionally keeps stale data on failure; switching
    // clusters must not.
    setData(null)
    setError(null)
    setIsLoading(true)
    setLastUpdatedAt(null)
    ;(async () => {
      try {
        const result = await getCluster(connId)
        if (!cancelled) {
          setData(result)
          setError(null)
          setLastUpdatedAt(Date.now())
        }
      } catch (err) {
        logFetchError("cluster", err)
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [connId])

  // Poll while the tab is visible.
  //
  // Three deliberate choices:
  //  * `document.hidden` gates it — a background tab must not keep asking. The
  //    visibilitychange listener also fires an immediate read on return, so
  //    coming back to the tab does not show a stale value for up to an
  //    interval.
  //  * A poll never sets `isLoading`. That flag drives the Refresh button's
  //    disabled state and page-level spinners; flickering them every 5s would
  //    be worse than the staleness this fixes.
  //  * A failed poll does NOT clear `data` or set `error`. One dropped request
  //    should not replace a working dashboard with an error page; the next
  //    tick usually recovers, and `lastUpdatedAt` is what tells the operator
  //    the numbers have stopped advancing.
  useEffect(() => {
    if (!connId || pollIntervalMs <= 0) return

    let inFlight = false
    const tick = async () => {
      if (inFlight) return
      if (typeof document !== "undefined" && document.hidden) return
      inFlight = true
      try {
        const result = await getCluster(connId)
        if (isMountedRef.current) {
          setData(result)
          setLastUpdatedAt(Date.now())
        }
      } catch (err) {
        logFetchError("cluster", err)
      } finally {
        inFlight = false
      }
    }
    const timer = setInterval(() => void tick(), pollIntervalMs)
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) void tick()
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible)
    }
    return () => {
      clearInterval(timer)
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible)
      }
    }
  }, [connId, pollIntervalMs])

  return { data, error, isLoading, refetch, lastUpdatedAt }
}
