"use client"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { clusterSections } from "@/app/siteConfig"
import { useConnections } from "@/hooks/use-connections"
import { useK8sClusters } from "@/hooks/use-k8s-clusters"
import type { ConnectionProfileResponse } from "@/lib/types/connection"
import type { K8sClusterSummary } from "@/lib/types/k8s"
import Link from "next/link"
import { useMemo } from "react"

type Row = {
  key: string
  connId: string | null
  displayName: string
  color: string
  hosts: string[]
  port: number
  managedBy: "ACKO" | "manual"
  k8sNamespace?: string
  phase?: string
  size?: number
}

function phaseBadge(phase: string | undefined): {
  label: string
  variant: "success" | "warning" | "error" | "neutral"
  dot: string
} {
  if (!phase)
    return { label: "Unknown", variant: "neutral", dot: "bg-gray-400" }
  const p = phase.toLowerCase()
  if (p === "ready" || p === "running")
    return { label: phase, variant: "success", dot: "bg-emerald-500" }
  if (p === "error" || p === "failed")
    return { label: phase, variant: "error", dot: "bg-red-500" }
  if (p === "paused")
    return { label: phase, variant: "neutral", dot: "bg-gray-400" }
  return { label: phase, variant: "warning", dot: "bg-amber-500" }
}

function mergeRows(
  connections: ConnectionProfileResponse[] | null,
  k8s: K8sClusterSummary[] | null,
): Row[] {
  const rows: Row[] = []
  const conn = connections ?? []
  const seenConnIds = new Set<string>()

  for (const c of conn) {
    seenConnIds.add(c.id)
    const linkedK8s = k8s?.find((k) => k.connectionId === c.id)
    rows.push({
      key: `conn:${c.id}`,
      connId: c.id,
      displayName: c.name,
      color: c.color,
      hosts: c.hosts,
      port: c.port,
      managedBy: linkedK8s ? "ACKO" : "manual",
      k8sNamespace: linkedK8s?.namespace,
      phase: linkedK8s?.phase,
      size: linkedK8s?.size,
    })
  }

  // ACKO clusters that don't have a matching connection yet
  for (const k of k8s ?? []) {
    if (k.connectionId && seenConnIds.has(k.connectionId)) continue
    rows.push({
      key: `k8s:${k.namespace}/${k.name}`,
      connId: k.connectionId ?? null,
      displayName: k.name,
      color: "#4F46E5",
      hosts: [],
      port: 0,
      managedBy: "ACKO",
      k8sNamespace: k.namespace,
      phase: k.phase,
      size: k.size,
    })
  }

  return rows
}

export default function ClustersPage() {
  const conn = useConnections()
  const k8s = useK8sClusters()

  const rows = useMemo(
    () => mergeRows(conn.data, k8s.data?.items ?? null),
    [conn.data, k8s.data],
  )

  const loading = conn.isLoading || k8s.isLoading
  const combinedError = conn.error ?? k8s.error

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
            Clusters
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            Connection profiles and ACKO-managed Aerospike CE clusters.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary">Add Connection</Button>
          <Button variant="primary">Create Cluster</Button>
        </div>
      </header>

      {combinedError && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {combinedError.message}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <SkeletonGrid />
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <ClusterCard key={r.key} row={r} />
          ))}
        </section>
      )}
    </main>
  )
}

function ClusterCard({ row }: { row: Row }) {
  const status = phaseBadge(row.phase)
  const hostLabel =
    row.hosts.length > 0
      ? `${row.hosts[0]}:${row.port}`
      : (row.k8sNamespace ?? "—")

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 h-6 w-1 shrink-0 rounded-sm"
            style={{ background: row.color }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`size-2 rounded-full ${status.dot}`}
                aria-hidden="true"
              />
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">
                {status.label}
              </span>
              {row.managedBy === "ACKO" && (
                <span className="text-xs font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  · ACKO
                </span>
              )}
            </div>
            <h3 className="mt-2 truncate font-mono text-base font-semibold text-gray-900 dark:text-gray-50">
              {row.displayName}
            </h3>
            <p className="truncate font-mono text-xs text-gray-500 dark:text-gray-500">
              {hostLabel}
            </p>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
        <div>
          <dt className="text-xs text-gray-500 dark:text-gray-500">
            Managed by
          </dt>
          <dd className="font-medium text-gray-900 dark:text-gray-50">
            {row.managedBy === "ACKO" ? "ACKO" : "Manual"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500 dark:text-gray-500">Size</dt>
          <dd className="font-medium tabular-nums text-gray-900 dark:text-gray-50">
            {row.size ?? "—"}
          </dd>
        </div>
      </dl>

      <div className="flex gap-2">
        {row.connId ? (
          <Button variant="secondary" className="flex-1" asChild>
            <Link href={clusterSections.overview(row.connId)}>
              Open overview
            </Link>
          </Button>
        ) : (
          <Badge variant="warning">connection not linked</Badge>
        )}
        <Button variant="ghost">Edit</Button>
      </div>
    </Card>
  )
}

function SkeletonGrid() {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="flex flex-col gap-4">
          <div className="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-3 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-2 h-px bg-gray-200 dark:bg-gray-800" />
          <div className="h-6 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
        </Card>
      ))}
    </section>
  )
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center">
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">
        No clusters yet
      </h3>
      <p className="max-w-md text-sm text-gray-500 dark:text-gray-500">
        Add a connection profile to manage an existing cluster, or create a new
        one via ACKO.
      </p>
      <div className="flex gap-2 pt-2">
        <Button variant="secondary">Add Connection</Button>
        <Button variant="primary">Create Cluster</Button>
      </div>
    </Card>
  )
}
