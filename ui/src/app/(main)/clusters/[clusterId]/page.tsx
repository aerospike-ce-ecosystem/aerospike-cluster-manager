"use client"

import { Badge } from "@/components/Badge"
import { Card } from "@/components/Card"
import { useCluster } from "@/hooks/use-cluster"
import { useK8sClusters } from "@/hooks/use-k8s-clusters"
import type { ClusterNode } from "@/lib/types/cluster"
import type { K8sClusterSummary } from "@/lib/types/k8s"
import { Button } from "@/components/Button"
import { PageHead } from "@/components/PageHead"
import { RiAlertLine } from "@remixicon/react"
import { useMemo } from "react"

type PageProps = { params: { clusterId: string } }

function nodeStatus(node: ClusterNode): {
  label: string
  variant: "success" | "warning"
  dot: string
} {
  const stats = node.statistics ?? {}
  const migrating =
    Number(stats["migrate_partitions_remaining"] ?? 0) > 0 ||
    stats["cluster_integrity"] === "false"
  if (migrating)
    return { label: "Migrating", variant: "warning", dot: "bg-amber-500" }
  return { label: "Up", variant: "success", dot: "bg-emerald-500" }
}

export default function ClusterOverview({ params }: PageProps) {
  const cluster = useCluster(params.clusterId)
  const k8s = useK8sClusters()

  const ackoInfo = useMemo<K8sClusterSummary | null>(
    () =>
      k8s.data?.items.find((c) => c.connectionId === params.clusterId) ?? null,
    [k8s.data, params.clusterId],
  )

  return (
    <main className="flex flex-col gap-8">
      <PageHead
        title={<span className="font-mono">{params.clusterId}</span>}
        sub={
          <>
            {cluster.data
              ? `${cluster.data.nodes.length} nodes · ${cluster.data.namespaces.length} namespaces`
              : cluster.isLoading
                ? "Loading cluster info…"
                : "—"}
          </>
        }
      >
        {cluster.data && cluster.data.nodes[0]?.edition && (
          <Badge variant="default">{cluster.data.nodes[0].edition}</Badge>
        )}
        {cluster.data && <Badge variant="success">Connected</Badge>}
        <Button
          variant="secondary"
          onClick={() => cluster.refetch()}
          disabled={cluster.isLoading}
        >
          Refresh
        </Button>
      </PageHead>

      {cluster.error && (
        <div className="ace-announce tone-warning" role="status">
          <span className="ico">
            <RiAlertLine className="size-4" aria-hidden="true" />
          </span>
          <div className="body">
            <div className="title">Failed to load cluster</div>
            <div className="desc">{cluster.error.message}</div>
          </div>
        </div>
      )}

      {ackoInfo && (
        <section
          aria-label="ACKO overview"
          className="bg-primary-95/50 dark:border-primary-30/40 dark:bg-primary-10/30 border-primary-95 flex flex-col gap-4 rounded-lg border p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-primary-40 dark:text-primary-80 text-xs font-medium tracking-wider uppercase">
                Managed by ACKO
              </span>
              <h2 className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-50">
                AerospikeCluster/{ackoInfo.name}
              </h2>
              <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                namespace: {ackoInfo.namespace} · phase: {ackoInfo.phase}
                {ackoInfo.age ? ` · age: ${ackoInfo.age}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" disabled title="Coming soon">
                View CR
              </Button>
              <Button variant="secondary" disabled title="Coming soon">
                Events
              </Button>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Phase" value={ackoInfo.phase} />
            <Metric label="Size" value={String(ackoInfo.size)} />
            <Metric
              label="Image"
              value={ackoInfo.image.split(":").pop() ?? ackoInfo.image}
            />
            <Metric
              label="Template drifted"
              value={ackoInfo.templateDrifted ? "yes" : "no"}
            />
          </dl>
        </section>
      )}

      <section aria-label="Nodes" className="flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-500">
              Nodes
            </span>
            <h2 className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-50">
              {cluster.data
                ? `${cluster.data.nodes.length} nodes`
                : cluster.isLoading
                  ? "—"
                  : "0"}
            </h2>
          </div>
        </div>
        <Card className="p-0">
          {cluster.isLoading ? (
            <SkeletonList rows={3} />
          ) : cluster.data && cluster.data.nodes.length > 0 ? (
            <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
              {cluster.data.nodes.map((n) => {
                const s = nodeStatus(n)
                return (
                  <li
                    key={n.name}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <span
                      className={`size-2 shrink-0 rounded-full ${s.dot}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        title={n.name}
                        className="truncate font-mono text-sm font-semibold text-gray-900 dark:text-gray-50"
                      >
                        {n.name}
                      </p>
                      <p
                        title={`${n.address}:${n.port}`}
                        className="truncate font-mono text-xs text-gray-500 dark:text-gray-500"
                      >
                        {n.address}:{n.port}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        build {n.build}
                      </p>
                      <p className="text-xs text-gray-500 tabular-nums dark:text-gray-500">
                        uptime {formatUptime(n.uptime)}
                      </p>
                    </div>
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-5 py-6 text-center text-sm text-gray-500 dark:text-gray-500">
              No nodes returned.
            </p>
          )}
        </Card>
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900 tabular-nums dark:text-gray-50">
        {value}
      </dd>
    </div>
  )
}

function SkeletonList({ rows }: { rows: number }) {
  return (
    <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-4">
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

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—"
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}
