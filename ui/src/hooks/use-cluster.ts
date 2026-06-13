/**
 * useCluster — fetch cluster info (nodes, namespaces, sets) for a connection.
 * Re-fetches whenever connId changes. Pass `null` / `undefined` to skip.
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { getCluster } from "@/lib/api/clusters"
import { logFetchError } from "@/lib/api/log"
import type { ClusterInfo } from "@/lib/types/cluster"

export interface UseClusterResult {
  data: ClusterInfo | null
  error: Error | null
  isLoading: boolean
  refetch: () => Promise<void>
}

export function useCluster(
  connId: string | null | undefined,
): UseClusterResult {
  const [data, setData] = useState<ClusterInfo | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(!!connId)

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
    ;(async () => {
      try {
        const result = await getCluster(connId)
        if (!cancelled) {
          setData(result)
          setError(null)
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

  return { data, error, isLoading, refetch }
}
