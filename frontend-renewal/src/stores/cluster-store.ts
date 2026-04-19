/**
 * Cluster store — per-connection ClusterInfo cache.
 * Mirrors the old `frontend/` version but without the legacy namespace UI state.
 */

import { create } from "zustand"

import { getCluster } from "@/lib/api/clusters"
import type { ClusterInfo } from "@/lib/types/cluster"

interface ClusterStore {
  /** Cluster info keyed by connection id. */
  clusters: Record<string, ClusterInfo>
  loadingIds: Record<string, boolean>
  errors: Record<string, string | null>

  fetchCluster: (connId: string) => Promise<ClusterInfo | null>
  invalidate: (connId: string) => void
  reset: () => void
}

export const useClusterStore = create<ClusterStore>((set, get) => ({
  clusters: {},
  loadingIds: {},
  errors: {},

  fetchCluster: async (connId) => {
    set({
      loadingIds: { ...get().loadingIds, [connId]: true },
      errors: { ...get().errors, [connId]: null },
    })
    try {
      const info = await getCluster(connId)
      set({
        clusters: { ...get().clusters, [connId]: info },
        loadingIds: { ...get().loadingIds, [connId]: false },
      })
      return info
    } catch (err) {
      set({
        loadingIds: { ...get().loadingIds, [connId]: false },
        errors: {
          ...get().errors,
          [connId]:
            err instanceof Error ? err.message : "Failed to load cluster",
        },
      })
      return null
    }
  },

  invalidate: (connId) => {
    const { [connId]: _removed, ...rest } = get().clusters
    set({ clusters: rest })
  },

  reset: () => set({ clusters: {}, loadingIds: {}, errors: {} }),
}))
