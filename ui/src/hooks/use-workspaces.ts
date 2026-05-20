/**
 * useWorkspaces — fetch-on-mount hook for the workspace list.
 * Returns data/error/isLoading plus a `refetch` for manual reloads.
 *
 * Subscribes to ``useDataRevisionStore.workspacesRev`` so every instance
 * refetches whenever any component bumps it after a mutation. Without that,
 * sibling consumers (sidebar dropdown, dialogs) would keep stale snapshots
 * after a workspace is created or renamed elsewhere.
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { listWorkspaces } from "@/lib/api/workspaces"
import { logFetchError } from "@/lib/api/log"
import type { WorkspaceResponse } from "@/lib/types/workspace"
import { useDataRevisionStore } from "@/stores/data-revision-store"

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
  const rev = useDataRevisionStore((s) => s.workspacesRev)

  // Hook-level mounted guard so the exposed refetch can drop late
  // resolutions after unmount — a caller that triggers refetch and then
  // navigates away would otherwise hit setState on an unmounted component.
  // Mirrors the pattern in useConnections.
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
      const result = await listWorkspaces()
      if (!isMountedRef.current) return
      setData(result)
    } catch (err) {
      logFetchError("workspaces", err)
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
        const result = await listWorkspaces()
        if (!cancelled && isMountedRef.current) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        logFetchError("workspaces", err)
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
