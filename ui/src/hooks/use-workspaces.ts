/**
 * useWorkspaces — fetch-on-mount hook for the workspace list.
 * Returns data/error/isLoading plus a `refetch` for manual reloads.
 */

"use client"

import { useCallback, useEffect, useState } from "react"

import { listWorkspaces } from "@/lib/api/workspaces"
import { logFetchError } from "@/lib/api/log"
import type { WorkspaceResponse } from "@/lib/types/workspace"

export interface UseWorkspacesResult {
  data: WorkspaceResponse[] | null
  error: Error | null
  isLoading: boolean
  refetch: () => Promise<void>
}

export function useWorkspaces(): UseWorkspacesResult {
  const [data, setData] = useState<WorkspaceResponse[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await listWorkspaces()
      setData(result)
    } catch (err) {
      logFetchError("workspaces", err)
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await listWorkspaces()
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        logFetchError("workspaces", err)
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
