"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/Dropdown"
import { cx, focusRing } from "@/lib/utils"
import {
  type ClusterEntry,
  useClusterSelectorStore,
} from "@/stores/cluster-selector-store"
import { RiCheckLine, RiExpandUpDownLine, RiServerLine } from "@remixicon/react"
import * as React from "react"

type HealthState = "ok" | "fail" | "checking"

const HEALTH_TIMEOUT_MS = 5_000

function dotClasses(state: HealthState): string {
  switch (state) {
    case "ok":
      return "bg-emerald-500"
    case "fail":
      return "bg-red-500"
    case "checking":
    default:
      return "bg-amber-400"
  }
}

function dotLabel(state: HealthState): string {
  switch (state) {
    case "ok":
      return "Healthy"
    case "fail":
      return "Unreachable"
    case "checking":
    default:
      return "Checking"
  }
}

/**
 * Ping `${apiUrl}/api/health` with a 5s timeout via AbortController. The
 * health endpoint is unauthenticated, so we deliberately don't attach a
 * token — works pre-login and avoids extra refresh churn.
 */
async function pingHealth(
  apiUrl: string,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/health`, {
      cache: "no-store",
      credentials: "omit",
      signal,
    })
    return res.ok
  } catch {
    return false
  }
}

function useClusterHealth(clusters: ClusterEntry[]): Record<string, HealthState> {
  const [state, setState] = React.useState<Record<string, HealthState>>({})

  React.useEffect(() => {
    if (clusters.length === 0) return

    setState(
      Object.fromEntries(clusters.map((c) => [c.id, "checking" as const])),
    )

    const controllers = clusters.map(() => new AbortController())
    const timers = controllers.map((ctrl) =>
      setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS),
    )

    let cancelled = false
    Promise.all(
      clusters.map((c, i) =>
        pingHealth(c.apiUrl, controllers[i].signal).then((ok) => ({
          id: c.id,
          ok,
        })),
      ),
    ).then((results) => {
      if (cancelled) return
      setState((prev) => {
        const next = { ...prev }
        for (const r of results) next[r.id] = r.ok ? "ok" : "fail"
        return next
      })
    })

    return () => {
      cancelled = true
      controllers.forEach((c) => c.abort())
      timers.forEach((t) => clearTimeout(t))
    }
  }, [clusters])

  return state
}

export function ClusterSelector() {
  const registry = useClusterSelectorStore((s) => s.registry)
  const currentClusterId = useClusterSelectorStore((s) => s.currentClusterId)
  const setCurrentClusterId = useClusterSelectorStore(
    (s) => s.setCurrentClusterId,
  )

  const clusters = registry?.clusters ?? []
  const health = useClusterHealth(clusters)

  // Don't render in legacy single-cluster mode (no registry → /cluster-registry.json absent).
  if (!registry || clusters.length === 0) return null

  const current =
    clusters.find((c) => c.id === currentClusterId) ??
    clusters.find((c) => c.id === registry.defaultClusterId) ??
    clusters[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch cluster"
          className={cx(
            "flex w-full items-center gap-3 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-left transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900",
            focusRing,
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-900">
            <RiServerLine
              className="size-4 text-gray-500 dark:text-gray-400"
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
              {current?.displayName ?? "Select cluster"}
            </p>
            <p className="flex items-center gap-1 truncate text-xs text-gray-500 dark:text-gray-400">
              <span
                aria-hidden="true"
                className={cx(
                  "inline-block size-2 shrink-0 rounded-full",
                  dotClasses(current ? health[current.id] ?? "checking" : "checking"),
                )}
              />
              {current?.labels?.env ?? "Cluster"}
            </p>
          </div>
          <RiExpandUpDownLine
            className="size-4 shrink-0 text-gray-400"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>
          Clusters ({clusters.length})
        </DropdownMenuLabel>
        {clusters.map((c) => {
          const selected = c.id === current?.id
          const state = health[c.id] ?? "checking"
          return (
            <DropdownMenuItem
              key={c.id}
              onSelect={() => setCurrentClusterId(c.id)}
              className="flex items-center gap-2"
            >
              <span
                aria-label={dotLabel(state)}
                title={dotLabel(state)}
                className={cx(
                  "inline-block size-2 shrink-0 rounded-full",
                  dotClasses(state),
                )}
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {c.displayName}
              </span>
              {selected && (
                <RiCheckLine
                  className="size-4 shrink-0 text-indigo-600 dark:text-indigo-400"
                  aria-hidden="true"
                />
              )}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs text-gray-400 dark:text-gray-600">
          Multi-cluster registry
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ClusterSelector
