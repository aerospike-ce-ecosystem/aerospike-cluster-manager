/**
 * useK8sClusters — fetch the paginated list of AerospikeCluster CRs.
 * Pass optional params to filter (namespace / label selector / limit / continueToken).
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { listK8sClusters, type ListK8sClustersParams } from "@/lib/api/k8s"
import { logFetchError } from "@/lib/api/log"
import type { K8sClusterListResponse } from "@/lib/types/k8s"

export interface UseK8sClustersResult {
  data: K8sClusterListResponse | null
  error: Error | null
  isLoading: boolean
  refetch: () => Promise<void>
}

export function useK8sClusters(
  params?: ListK8sClustersParams,
): UseK8sClustersResult {
  const [data, setData] = useState<K8sClusterListResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Stabilise the params object across renders — callers can pass an inline
  // literal without causing infinite re-fetches.
  const paramsRef = useRef<ListK8sClustersParams | undefined>(params)
  const paramsKey = JSON.stringify(params ?? {})
  paramsRef.current = params

  // Hook-level mounted guard so the exposed refetch can drop late
  // resolutions after unmount. Mirrors the pattern in useConnections.
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await listK8sClusters(paramsRef.current)
      if (!isMountedRef.current) return
      setData(result)
    } catch (err) {
      logFetchError("k8s-clusters", err)
      if (!isMountedRef.current) return
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      if (isMountedRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    // Use the params parsed from paramsKey — the exact value the effect
    // depends on — rather than paramsRef.current, which under React 18
    // batching can be ahead of or behind paramsKey and cause a stale fetch.
    const effectParams = JSON.parse(paramsKey) as ListK8sClustersParams
    ;(async () => {
      try {
        const result = await listK8sClusters(effectParams)
        if (!cancelled && isMountedRef.current) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        logFetchError("k8s-clusters", err)
        if (!cancelled && isMountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      } finally {
        if (!cancelled && isMountedRef.current) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [paramsKey])

  return { data, error, isLoading, refetch }
}
