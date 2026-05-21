/**
 * useGuides — fetch-on-mount hook for a workspace's operational guides.
 * Returns data/error/isLoading plus a `refetch` for manual reloads after a
 * mutation. Refetches whenever `workspaceId` changes.
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { listGuides } from "@/lib/api/guides"
import { logFetchError } from "@/lib/api/log"
import type { Guide } from "@/lib/types/guide"

export interface UseGuidesResult {
  data: Guide[] | null
  error: Error | null
  isLoading: boolean
  refetch: () => Promise<void>
}

export function useGuides(workspaceId: string): UseGuidesResult {
  const [data, setData] = useState<Guide[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Mounted guard so a refetch resolving after navigation doesn't setState
  // on an unmounted component. Mirrors useWorkspaces / useConnections.
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const fetchGuides = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await listGuides(workspaceId)
      if (!isMountedRef.current) return
      setData(result)
    } catch (err) {
      logFetchError("guides", err)
      if (!isMountedRef.current) return
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      if (isMountedRef.current) setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void fetchGuides()
  }, [fetchGuides])

  return { data, error, isLoading, refetch: fetchGuides }
}
