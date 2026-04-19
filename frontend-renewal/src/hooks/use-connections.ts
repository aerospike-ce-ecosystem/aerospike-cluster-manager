/**
 * useConnections — fetch-on-mount hook for the saved connection profiles list.
 * Returns data/error/isLoading plus a `refetch` for manual reloads.
 */

"use client"

import { useCallback, useEffect, useState } from "react"

import { listConnections } from "@/lib/api/connections"
import type { ConnectionProfileResponse } from "@/lib/types/connection"

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

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await listConnections()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await listConnections()
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
  }, [])

  return { data, error, isLoading, refetch }
}
