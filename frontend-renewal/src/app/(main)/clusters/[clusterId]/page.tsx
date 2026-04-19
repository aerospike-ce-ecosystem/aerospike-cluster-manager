"use client"

import {
  RiArrowRightSLine,
  RiDatabase2Line,
  RiHardDriveLine,
  RiPauseCircleLine,
  RiPlayCircleLine,
  RiRefreshLine,
  RiServerLine,
  RiStackLine,
} from "@remixicon/react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { LineChart } from "@/components/LineChart"
import { InlineAlert } from "@/components/common/InlineAlert"
import { PageHeader } from "@/components/common/PageHeader"
import { StatCard } from "@/components/common/StatCard"
import { clusterSections } from "@/app/siteConfig"
import { useCluster } from "@/hooks/use-cluster"
import { useK8sClusters } from "@/hooks/use-k8s-clusters"
import { ApiError } from "@/lib/api/client"
import { getClusterMetrics } from "@/lib/api/metrics"
import { cx } from "@/lib/utils"
import type { ClusterNode, NamespaceInfo } from "@/lib/types/cluster"
import type { ClusterMetrics, MetricPoint } from "@/lib/types/metrics"
import type { K8sClusterSummary } from "@/lib/types/k8s"
import { useToastStore } from "@/stores/toast-store"

// NOTE(stream-b): inline formatters until Stream E merges shared helpers.
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KiB", "MiB", "GiB", "TiB"]
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—"
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—"
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail || err.message
  if (err instanceof Error) return err.message
  return String(err)
}

// Convert backend MetricPoint[] (ts ms + value) into recharts-ready data rows
// keyed by category. We expect read/write TPS as parallel series.
function toTimeSeries(
  reads: MetricPoint[] | undefined,
  writes: MetricPoint[] | undefined,
): Array<{ time: string; Reads: number; Writes: number }> {
  const map = new Map<number, { Reads: number; Writes: number }>()
  for (const p of reads ?? []) {
    const row = map.get(p.timestamp) ?? { Reads: 0, Writes: 0 }
    row.Reads = p.value
    map.set(p.timestamp, row)
  }
  for (const p of writes ?? []) {
    const row = map.get(p.timestamp) ?? { Reads: 0, Writes: 0 }
    row.Writes = p.value
    map.set(p.timestamp, row)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([ts, row]) => ({
      time: new Date(ts).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
      Reads: row.Reads,
      Writes: row.Writes,
    }))
}

function toConnectionsSeries(
  history: MetricPoint[] | undefined,
): Array<{ time: string; Connections: number }> {
  return (history ?? []).map((p) => ({
    time: new Date(p.timestamp).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }),
    Connections: p.value,
  }))
}

function nodeStatusBadge(node: ClusterNode): {
  label: string
  variant: "success" | "warning"
} {
  const stats = node.statistics ?? {}
  const migrating =
    Number(stats["migrate_partitions_remaining"] ?? 0) > 0 ||
    stats["cluster_integrity"] === "false"
  if (migrating) return { label: "Migrating", variant: "warning" }
  return { label: "Up", variant: "success" }
}

type PageProps = { params: { clusterId: string } }

export default function ClusterOverview({ params }: PageProps) {
  const { clusterId } = params

  const cluster = useCluster(clusterId)
  const k8s = useK8sClusters()

  const ackoInfo = useMemo<K8sClusterSummary | null>(
    () => k8s.data?.items.find((c) => c.connectionId === clusterId) ?? null,
    [k8s.data, clusterId],
  )

  // Metrics — optional. If the backend doesn't yet expose /metrics, we just
  // hide the charts section rather than render empty placeholders.
  const [metrics, setMetrics] = useState<ClusterMetrics | null>(null)
  const [metricsError, setMetricsError] = useState<string | null>(null)

  const loadMetrics = useCallback(async () => {
    try {
      const data = await getClusterMetrics(clusterId)
      setMetrics(data)
      setMetricsError(null)
    } catch (err) {
      // Silently degrade — charts are not critical for overview usability.
      setMetrics(null)
      setMetricsError(errorMessage(err))
    }
  }, [clusterId])

  useEffect(() => {
    void loadMetrics()
  }, [loadMetrics])

  const toast = useToastStore((s) => s.addToast)

  // -- Aggregates ----------------------------------------------------------

  const totals = useMemo(() => {
    if (!cluster.data) return null
    const totalObjects = cluster.data.namespaces.reduce(
      (s, ns) => s + ns.objects,
      0,
    )
    const totalMemUsed = cluster.data.namespaces.reduce(
      (s, ns) => s + ns.memoryUsed,
      0,
    )
    const totalMemTotal = cluster.data.namespaces.reduce(
      (s, ns) => s + ns.memoryTotal,
      0,
    )
    const memPct =
      totalMemTotal > 0 ? Math.round((totalMemUsed / totalMemTotal) * 100) : 0
    return { totalObjects, totalMemUsed, totalMemTotal, memPct }
  }, [cluster.data])

  // -- Render --------------------------------------------------------------

  const firstNode = cluster.data?.nodes[0]

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description={
          cluster.data ? (
            <span className="font-mono text-xs">
              {firstNode?.edition ?? "Aerospike"} · Build{" "}
              {firstNode?.build ?? "—"}
            </span>
          ) : cluster.isLoading ? (
            "Loading cluster info…"
          ) : (
            "—"
          )
        }
        actions={
          <>
            {cluster.data && firstNode?.edition && (
              <Badge variant="default">{firstNode.edition}</Badge>
            )}
            {cluster.data && <Badge variant="success">Connected</Badge>}
            <Button
              variant="secondary"
              onClick={() =>
                void cluster.refetch().then(() => void loadMetrics())
              }
              isLoading={cluster.isLoading}
            >
              <RiRefreshLine className="mr-2 size-4" aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
      />

      {cluster.error && <InlineAlert message={errorMessage(cluster.error)} />}

      {ackoInfo && (
        <AckoPanel info={ackoInfo} onToast={(m) => toast("info", m)} />
      )}

      {/* Metric summary */}
      {cluster.data && totals && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Active nodes"
            value={String(cluster.data.nodes.length)}
            icon={RiServerLine}
            trend="up"
            subtitle={
              cluster.data.nodes.length > 0
                ? `${cluster.data.nodes.length} healthy`
                : undefined
            }
          />
          <StatCard
            label="Namespaces"
            value={String(cluster.data.namespaces.length)}
            icon={RiDatabase2Line}
            trend="neutral"
          />
          <StatCard
            label="Total objects"
            value={formatNumber(totals.totalObjects)}
            icon={RiStackLine}
            trend="neutral"
          />
          <StatCard
            label="Memory usage"
            value={`${totals.memPct}%`}
            icon={RiHardDriveLine}
            trend={totals.memPct > 80 ? "down" : "neutral"}
            subtitle={`${formatBytes(totals.totalMemUsed)} / ${formatBytes(totals.totalMemTotal)}`}
          />
        </div>
      )}

      {/* Charts: TPS + connections, only when metrics are available */}
      {metrics && !metricsError && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                Read / write TPS
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Transactions per second
              </p>
            </div>
            <LineChart
              className="h-56"
              data={toTimeSeries(metrics.readTps, metrics.writeTps)}
              index="time"
              categories={["Reads", "Writes"]}
              showLegend
              showGridLines
              yAxisWidth={48}
            />
          </Card>
          <Card className="p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                Client connections
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Active client connections over time
              </p>
            </div>
            <LineChart
              className="h-56"
              data={toConnectionsSeries(metrics.connectionHistory)}
              index="time"
              categories={["Connections"]}
              showLegend={false}
              showGridLines
              yAxisWidth={48}
            />
          </Card>
        </div>
      )}

      {/* Namespaces + nodes side-by-side on lg */}
      <div className="flex flex-col gap-4 lg:flex-row">
        <section aria-label="Namespaces" className="min-w-0 flex-[3]">
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                Namespaces
              </h2>
              {cluster.data && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {cluster.data.namespaces.length} / 2 max (CE)
                </span>
              )}
            </div>
            {cluster.isLoading ? (
              <SkeletonList rows={2} />
            ) : cluster.data && cluster.data.namespaces.length > 0 ? (
              cluster.data.namespaces.map((ns) => (
                <NamespaceRow key={ns.name} ns={ns} connId={clusterId} />
              ))
            ) : (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No namespaces configured.
              </p>
            )}
          </Card>
        </section>

        <section aria-label="Nodes" className="min-w-0 flex-1">
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                Nodes
              </h2>
              {cluster.data && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {cluster.data.nodes.length}
                </span>
              )}
            </div>
            {cluster.isLoading ? (
              <SkeletonList rows={3} />
            ) : cluster.data && cluster.data.nodes.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {cluster.data.nodes.map((n) => {
                  const s = nodeStatusBadge(n)
                  return (
                    <li
                      key={n.name}
                      className="flex flex-col gap-1 rounded-md border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-900/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs font-semibold text-gray-900 dark:text-gray-50">
                          {n.name}
                        </span>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </div>
                      <span className="truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">
                        {n.address}:{n.port}
                      </span>
                      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="tabular-nums">
                          uptime {formatUptime(n.uptime)}
                        </span>
                        <span className="tabular-nums">
                          {n.clientConnections} conns
                        </span>
                        <span className="tabular-nums">build {n.build}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No nodes returned.
              </p>
            )}
          </Card>
        </section>
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// ACKO panel — shown when cluster is managed by an AerospikeCluster CR
// ---------------------------------------------------------------------------

interface AckoPanelProps {
  info: K8sClusterSummary
  onToast: (message: string) => void
}

function AckoPanel({ info, onToast }: AckoPanelProps) {
  const isPaused = info.phase === "Paused"

  // FIXME(stream-b): wire pause/resume to /api/k8s endpoints once the renewal
  // k8s store lands; for now surface the intent with a toast so the UI affords
  // the action and Stream C can hook real mutations in.
  const handleToggle = () => {
    onToast(
      isPaused
        ? `Requesting reconciliation resume for ${info.namespace}/${info.name}`
        : `Requesting reconciliation pause for ${info.namespace}/${info.name}`,
    )
  }

  return (
    <section
      aria-label="ACKO overview"
      className="flex flex-col gap-4 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-medium uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            Managed by ACKO
          </span>
          <h2 className="mt-1 truncate text-base font-semibold text-gray-900 dark:text-gray-50">
            AerospikeCluster/{info.name}
          </h2>
          <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
            namespace: {info.namespace} · phase: {info.phase}
            {info.age ? ` · age: ${info.age}` : ""}
          </p>
          {info.autoConnectWarning && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠ {info.autoConnectWarning}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleToggle}>
            {isPaused ? (
              <>
                <RiPlayCircleLine className="mr-2 size-4" aria-hidden="true" />
                Resume
              </>
            ) : (
              <>
                <RiPauseCircleLine className="mr-2 size-4" aria-hidden="true" />
                Pause
              </>
            )}
          </Button>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <AckoMetric label="Phase" value={info.phase} />
        <AckoMetric label="Size" value={String(info.size)} />
        <AckoMetric
          label="Image"
          value={info.image.split(":").pop() ?? info.image}
        />
        <AckoMetric
          label="Template drifted"
          value={info.templateDrifted ? "yes" : "no"}
        />
      </dl>
      {info.failedReconcileCount != null && info.failedReconcileCount > 0 && (
        <p className="text-xs text-red-700 dark:text-red-400">
          Reconcile errors: {info.failedReconcileCount}
        </p>
      )}
    </section>
  )
}

function AckoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="truncate font-mono text-sm font-medium text-gray-900 dark:text-gray-50">
        {value}
      </dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Namespace card (+ set chips)
// ---------------------------------------------------------------------------

function NamespaceRow({ ns, connId }: { ns: NamespaceInfo; connId: string }) {
  const memPct =
    ns.memoryTotal > 0 ? Math.round((ns.memoryUsed / ns.memoryTotal) * 100) : 0
  const isWarning = ns.stopWrites || ns.hwmBreached

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50/40 dark:border-gray-800 dark:bg-gray-900/40">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cx(
              "h-8 w-1 shrink-0 rounded-full",
              isWarning
                ? "bg-gradient-to-b from-red-500 to-red-500/60"
                : "bg-gradient-to-b from-indigo-500 to-indigo-500/60",
            )}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
                {ns.name}
              </span>
              {ns.stopWrites ? (
                <Badge variant="error">Stop writes</Badge>
              ) : ns.hwmBreached ? (
                <Badge variant="warning">HWM breached</Badge>
              ) : (
                <Badge variant="success">Healthy</Badge>
              )}
            </div>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {ns.sets.length} set{ns.sets.length !== 1 ? "s" : ""} · RF{" "}
              {ns.replicationFactor}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 pl-4 sm:ml-auto sm:flex sm:pl-0">
          <Cell label="Objects" value={formatNumber(ns.objects)} />
          <Cell
            label="Memory"
            value={`${formatBytes(ns.memoryUsed)} / ${formatBytes(ns.memoryTotal)}`}
          />
          <Cell
            label="HWM"
            value={`${ns.highWaterMemoryPct}%`}
            tone={ns.highWaterMemoryPct > 70 ? "warn" : "ok"}
          />
          <Cell
            label="Default TTL"
            value={ns.defaultTtl === 0 ? "none" : `${ns.defaultTtl}s`}
          />
        </dl>

        <div className="hidden w-16 shrink-0 sm:block">
          <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div
              className={cx(
                "h-full rounded-full",
                memPct > 80 ? "bg-red-500" : "bg-indigo-500",
              )}
              style={{ width: `${Math.max(memPct, 1)}%` }}
              aria-hidden="true"
            />
          </div>
          <span className="mt-1 block text-right text-[10px] text-gray-500 dark:text-gray-400">
            {memPct}%
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-200 px-4 py-2 dark:border-gray-800">
        {ns.sets.length === 0 ? (
          <span className="text-xs italic text-gray-500 dark:text-gray-400">
            No sets
          </span>
        ) : (
          ns.sets.map((set) => (
            <Link
              key={set.name}
              href={clusterSections.set(connId, ns.name, set.name)}
              className="group flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs transition-colors hover:border-indigo-300 hover:bg-indigo-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
            >
              <span className="font-medium text-gray-900 dark:text-gray-50">
                {set.name}
              </span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {formatNumber(set.objects)}
              </span>
              <RiArrowRightSLine
                className="size-3 text-gray-300 transition-colors group-hover:text-indigo-500 dark:text-gray-600"
                aria-hidden="true"
              />
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

function Cell({
  label,
  value,
  tone = "ok",
}: {
  label: string
  value: string
  tone?: "ok" | "warn"
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <span
        className={cx(
          "font-mono text-xs font-semibold",
          tone === "warn"
            ? "text-amber-600 dark:text-amber-400"
            : "text-gray-900 dark:text-gray-50",
        )}
      >
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared skeleton
// ---------------------------------------------------------------------------

function SkeletonList({ rows }: { rows: number }) {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50/60 p-3 dark:border-gray-900 dark:bg-gray-900/40"
        >
          <span className="size-2 rounded-full bg-gray-200 dark:bg-gray-800" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-3 w-28 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
          </div>
        </li>
      ))}
    </ul>
  )
}
