/**
 * useConnections — fetch-on-mount hook for the saved connection profiles list.
 * Returns data/error/isLoading plus a `refetch` for manual reloads.
 *
 * Subscribes to ``useDataRevisionStore.connectionsRev`` so every instance
 * refetches whenever any component bumps it after a mutation. Without that,
 * sibling consumers (sidebar dropdown, clusters page) would keep stale
 * snapshots until the next route change.
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { listConnections } from "@/lib/api/connections"
import { logFetchError } from "@/lib/api/log"
import type { ConnectionProfileResponse } from "@/lib/types/connection"
import { useDataRevisionStore } from "@/stores/data-revision-store"

export interface UseConnectionsResult {
  data: ConnectionProfileResponse[] | null
  error: Error | null
  isLoading: boolean
  refetch: () => Promise<void>
}

export function useConnections(): UseConnectionsResult {
  const [data, setData] = useState<ConnectionProfileResponse[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const rev = useDataRevisionStore((s) => s.connectionsRev)

  // Hook-level mounted guard so both the initial fetch effect AND the
  // exposed refetch can drop late resolutions after unmount. The previous
  // useEffect-local `cancelled` flag missed callers who triggered refetch
  // and then navigated away before the response landed — React would then
  // warn about setState on an unmounted component (and in strict mode, the
  // double-mount during dev surfaced the same race more reliably).
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
      const result = await listConnections()
      if (!isMountedRef.current) return
      setData(result)
    } catch (err) {
      logFetchError("connections", err)
      if (!isMountedRef.current) return
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      if (isMountedRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await listConnections()
        if (!cancelled && isMountedRef.current) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        logFetchError("connections", err)
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
  }, [rev])

  return { data, error, isLoading, refetch }
}
