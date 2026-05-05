/**
 * Cluster selector store.
 *
 * Holds the multi-cluster registry hydrated from `/cluster-registry.json`
 * (Stream A's ConfigMap mount → web pod's public dir) and the user's
 * currently selected cluster id. The selected id is persisted to localStorage
 * so the choice survives reloads, but the registry itself is fetched fresh
 * on every boot.
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface ClusterEntry {
  id: string
  displayName: string
  apiUrl: string
  labels?: Record<string, string>
}

export interface ClusterRegistry {
  defaultClusterId: string
  clusters: ClusterEntry[]
}

interface ClusterSelectorStore {
  /** Hydrated from /cluster-registry.json on boot. Null until then. */
  registry: ClusterRegistry | null
  /** May reference a cluster id not (or no longer) in the registry. Use
   *  `getActiveCluster()` to get the safely-resolved entry. */
  currentClusterId: string | null
  /** Boot-time fetch error, surfaced to the UI for a retry banner. */
  registryError: string | null

  setRegistry: (registry: ClusterRegistry) => void
  setRegistryError: (error: string | null) => void
  setCurrentClusterId: (id: string) => void
}

const REGISTRY_PATH = "/cluster-registry.json"

export const useClusterSelectorStore = create<ClusterSelectorStore>()(
  persist(
    (set) => ({
      registry: null,
      currentClusterId: null,
      registryError: null,

      setRegistry: (registry) =>
        set((state) => {
          // If persisted id no longer exists in registry, fall back to default.
          const ids = new Set(registry.clusters.map((c) => c.id))
          const valid =
            state.currentClusterId && ids.has(state.currentClusterId)
              ? state.currentClusterId
              : registry.defaultClusterId
          return { registry, currentClusterId: valid, registryError: null }
        }),
      setRegistryError: (registryError) => set({ registryError }),
      setCurrentClusterId: (currentClusterId) => set({ currentClusterId }),
    }),
    {
      name: "acm-cluster-selector",
      version: 1,
      // Only persist the user's choice — registry must be re-fetched fresh.
      partialize: (state) => ({ currentClusterId: state.currentClusterId }),
    },
  ),
)

/**
 * Fetch the cluster registry from the static JSON mount and hydrate the store.
 * Idempotent — call from the root provider on mount.
 */
export async function hydrateClusterRegistry(
  fetcher: typeof fetch = fetch,
): Promise<ClusterRegistry> {
  const res = await fetcher(REGISTRY_PATH, {
    cache: "no-store",
    credentials: "omit",
  })
  if (!res.ok) {
    const msg = `Failed to load ${REGISTRY_PATH}: ${res.status} ${res.statusText}`
    useClusterSelectorStore.getState().setRegistryError(msg)
    throw new Error(msg)
  }
  const data = (await res.json()) as ClusterRegistry
  if (
    !data ||
    !Array.isArray(data.clusters) ||
    typeof data.defaultClusterId !== "string"
  ) {
    const msg = `${REGISTRY_PATH} has invalid shape`
    useClusterSelectorStore.getState().setRegistryError(msg)
    throw new Error(msg)
  }
  useClusterSelectorStore.getState().setRegistry(data)
  return data
}

/**
 * Resolve the currently active cluster, falling back to the default if the
 * persisted id is missing or stale.
 */
export function getActiveCluster(): ClusterEntry | null {
  const { registry, currentClusterId } = useClusterSelectorStore.getState()
  if (!registry) return null
  return (
    registry.clusters.find((c) => c.id === currentClusterId) ??
    registry.clusters.find((c) => c.id === registry.defaultClusterId) ??
    registry.clusters[0] ??
    null
  )
}

export function getActiveApiUrl(): string | null {
  return getActiveCluster()?.apiUrl ?? null
}
