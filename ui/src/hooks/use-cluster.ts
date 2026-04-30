/**
 * useCluster — fetch cluster info (nodes, namespaces, sets) for a connection.
 * Re-fetches whenever connId changes. Pass `null` / `undefined` to skip.
 */

"use client"

import { useCallback, useEffect, useState } from "react"

import { getCluster } from "@/lib/api/clusters"
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

  const refetch = useCallback(async () => {
    if (!connId) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await getCluster(connId)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
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
    setIsLoading(true)
    ;(async () => {
      try {
        const result = await getCluster(connId)
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      } catch (err) {
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
