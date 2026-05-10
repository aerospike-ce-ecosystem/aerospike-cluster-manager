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
 * Single-flight hydration promise. The first `hydrateClusterRegistry()` call
 * primes this; every concurrent / subsequent `getHydrationPromise()` caller
 * awaits the same promise so apiFetch never races the boot-time hydrate
 * (otherwise the first few requests fall back to the relative-path origin
 * before the registry lands, then the post-hydration re-fetch triggers a
 * 401 the silent-refresh path can't distinguish from a real auth failure).
 */
let hydrationPromise: Promise<void> | null = null
let resolveHydration: (() => void) | null = null

function ensurePendingPromise(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = new Promise<void>((resolve) => {
    resolveHydration = resolve
  })
  return hydrationPromise
}

function settleHydration(): void {
  if (resolveHydration) {
    const r = resolveHydration
    resolveHydration = null
    r()
  } else if (!hydrationPromise) {
    hydrationPromise = Promise.resolve()
  }
}

/**
 * Fetch the cluster registry from the static JSON mount and hydrate the store.
 * Idempotent on success; on failure, the cached single-flight promise is
 * cleared so a follow-up `hydrateClusterRegistry()` call (e.g. from a retry
 * banner) primes a fresh pending promise that future apiFetch callers can
 * actually wait on. Without that reset, the first failure would leave a
 * settled promise behind and apiFetch would skip waiting on the in-flight
 * retry, racing the relative-path fallback into the same boot-time 401
 * loop the single-flight was supposed to prevent.
 */
export async function hydrateClusterRegistry(
  fetcher: typeof fetch = fetch,
): Promise<ClusterRegistry> {
  ensurePendingPromise()
  try {
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
    settleHydration()
    return data
  } catch (err) {
    // Drain the pending promise so the next caller sees a deterministic
    // resolved state (rather than a stuck pending one), then null out the
    // cache so the *next* hydrateClusterRegistry call primes a brand new
    // single-flight promise. Order matters: settle first so already-awaiting
    // apiFetch callers unblock, then null out so the retry creates a fresh
    // promise the next batch of callers can await.
    settleHydration()
    hydrationPromise = null
    resolveHydration = null
    throw err
  }
}

/**
 * Returns a single-flight promise that resolves once
 * `hydrateClusterRegistry()` has settled (success OR error). If hydration
 * has not been kicked off yet, resolves immediately so legacy single-cluster
 * deployments — which never call `hydrateClusterRegistry` — do not deadlock.
 *
 * apiFetch awaits this before resolving the base URL so initial requests
 * cannot fall back to the relative-path origin and then race the
 * post-hydration re-fetch into a spurious 401.
 */
export function getHydrationPromise(): Promise<void> {
  return hydrationPromise ?? Promise.resolve()
}

/**
 * Test-only escape hatch: drop the cached single-flight promise so the next
 * `hydrateClusterRegistry()` primes a fresh one. Used by unit tests that
 * swap the store between scenarios.
 */
export function __resetHydrationPromiseForTests(): void {
  hydrationPromise = null
  resolveHydration = null
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
