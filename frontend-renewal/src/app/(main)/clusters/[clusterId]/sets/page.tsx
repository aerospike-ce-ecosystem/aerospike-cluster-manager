"use client"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Input } from "@/components/Input"
import { CreateSampleDataDialog } from "@/components/dialogs/CreateSampleDataDialog"
import { CreateSetDialog } from "@/components/dialogs/CreateSetDialog"
import { clusterSections } from "@/app/siteConfig"
import { useCluster } from "@/hooks/use-cluster"
import type { NamespaceInfo, SetInfo } from "@/lib/types/cluster"
import { cx } from "@/lib/utils"
import { RiAddLine, RiArrowRightSLine } from "@remixicon/react"
import Link from "next/link"
import { useMemo, useState } from "react"

type PageProps = { params: { clusterId: string } }

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(2)} GB`
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(1)} KB`
  return `${bytes} B`
}

function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`
  return n.toLocaleString()
}

type Severity = "ok" | "warning" | "error"

function nsSeverity(ns: NamespaceInfo): Severity {
  if (ns.stopWrites) return "error"
  if (ns.hwmBreached) return "warning"
  return "ok"
}

function nsStatusLabel(ns: NamespaceInfo): string {
  if (ns.stopWrites) return "Stop writes"
  if (ns.hwmBreached) return "HWM breached"
  return "Healthy"
}

export default function SetsPage({ params }: PageProps) {
  const cluster = useCluster(params.clusterId)
  const [filter, setFilter] = useState("")
  const [sampleOpen, setSampleOpen] = useState(false)
  const [createSetNs, setCreateSetNs] = useState<string | null>(null)

  const namespaces = useMemo(() => cluster.data?.namespaces ?? [], [cluster.data])
  const nsNames = useMemo(() => namespaces.map((n) => n.name), [namespaces])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return namespaces
    return namespaces
      .map((ns) => ({
        ...ns,
        sets: ns.sets.filter((s) => s.name.toLowerCase().includes(q)),
      }))
      .filter((ns) => ns.name.toLowerCase().includes(q) || ns.sets.length > 0)
  }, [namespaces, filter])

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">
            Sets
          </span>
          <h1 className="mt-1 text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
            Namespaces &amp; sets
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            Browse per-namespace sets. Click a set to open the record browser.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 dark:text-gray-500">
            {namespaces.length} / 2 max <span className="font-medium">(CE)</span>
          </span>
          <Button
            variant="secondary"
            onClick={() => setSampleOpen(true)}
            disabled={nsNames.length === 0}
          >
            Sample data
          </Button>
        </div>
      </header>

      <Input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by namespace or set name..."
        className="sm:w-80"
      />

      {cluster.error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {cluster.error.message}
        </div>
      )}

      {cluster.isLoading && namespaces.length === 0 ? (
        <NamespaceSkeleton />
      ) : filtered.length === 0 ? (
        <Card className="py-10 text-center text-sm text-gray-500 dark:text-gray-500">
          No namespaces to show.
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((ns) => (
            <NamespaceCard
              key={ns.name}
              ns={ns}
              clusterId={params.clusterId}
              onCreateSet={() => setCreateSetNs(ns.name)}
            />
          ))}
        </div>
      )}

      <CreateSampleDataDialog
        open={sampleOpen}
        onOpenChange={setSampleOpen}
        connId={params.clusterId}
        namespaces={nsNames}
        onSuccess={() => cluster.refetch?.()}
      />
      <CreateSetDialog
        open={createSetNs !== null}
        onOpenChange={(o) => !o && setCreateSetNs(null)}
        connId={params.clusterId}
        namespace={createSetNs ?? ""}
        onSuccess={() => {
          setCreateSetNs(null)
          cluster.refetch?.()
        }}
      />
    </main>
  )
}

function NamespaceCard({
  ns,
  clusterId,
  onCreateSet,
}: {
  ns: NamespaceInfo
  clusterId: string
  onCreateSet: () => void
}) {
  const severity = nsSeverity(ns)
  const accent =
    severity === "ok"
      ? "bg-indigo-500"
      : severity === "warning"
        ? "bg-amber-500"
        : "bg-red-500"
  const memPct =
    ns.memoryTotal > 0 ? Math.round((ns.memoryUsed / ns.memoryTotal) * 100) : 0

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cx("mt-0.5 h-9 w-1 shrink-0 rounded-full", accent)}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-50">
                {ns.name}
              </span>
              <Badge
                variant={
                  severity === "ok"
                    ? "success"
                    : severity === "warning"
                      ? "warning"
                      : "error"
                }
              >
                {nsStatusLabel(ns)}
              </Badge>
            </div>
            <span className="text-[11px] text-gray-500 dark:text-gray-500">
              {ns.sets.length} {ns.sets.length === 1 ? "set" : "sets"} · RF{" "}
              {ns.replicationFactor}
            </span>
          </div>
        </div>

        <dl className="grid flex-1 grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4 sm:gap-y-0">
          <Metric label="OBJECTS" value={formatCount(ns.objects)} />
          <Metric
            label="MEMORY"
            value={`${formatBytes(ns.memoryUsed)} / ${formatBytes(ns.memoryTotal)}`}
          />
          <Metric
            label="HWM"
            value={`${ns.highWaterMemoryPct ?? 0}%`}
            tone={ns.highWaterMemoryPct > 70 ? "warning" : "ok"}
          />
          <Metric
            label="TTL"
            value={ns.defaultTtl === 0 ? "None" : `${ns.defaultTtl}s`}
          />
        </dl>

        <div className="hidden w-20 shrink-0 flex-col items-end gap-1 sm:flex">
          <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-900">
            <div
              className={cx(
                "h-full rounded-full",
                memPct > 80 ? "bg-red-500" : memPct > 60 ? "bg-amber-500" : "bg-indigo-500",
              )}
              style={{ width: `${Math.max(memPct, 1)}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-gray-500 dark:text-gray-500">
            {memPct}%
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
        {ns.sets.length === 0 && (
          <span className="text-xs italic text-gray-400 dark:text-gray-600">
            No sets in this namespace yet.
          </span>
        )}
        {ns.sets.map((s) => (
          <SetChip key={s.name} clusterId={clusterId} namespace={ns.name} set={s} />
        ))}
        <button
          type="button"
          onClick={onCreateSet}
          className={cx(
            "inline-flex items-center gap-1 rounded-md border border-dashed border-indigo-300 px-2.5 py-1.5 text-xs font-medium text-indigo-600 transition",
            "hover:border-indigo-400 hover:bg-indigo-50 dark:border-indigo-900/60 dark:text-indigo-400 dark:hover:bg-indigo-950/30",
          )}
        >
          <RiAddLine className="size-3.5" aria-hidden="true" />
          Create set
        </button>
      </div>
    </Card>
  )
}

function SetChip({
  clusterId,
  namespace,
  set,
}: {
  clusterId: string
  namespace: string
  set: SetInfo
}) {
  return (
    <Link
      href={clusterSections.set(clusterId, namespace, set.name)}
      className={cx(
        "group inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs transition",
        "hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-gray-800 dark:bg-gray-950 hover:dark:border-indigo-900/60 hover:dark:bg-indigo-950/20",
      )}
    >
      <span className="font-mono text-gray-900 dark:text-gray-50">{set.name}</span>
      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600 dark:bg-gray-900 dark:text-gray-400">
        {formatCount(set.objects)}
      </span>
      <RiArrowRightSLine
        className="size-3.5 text-gray-300 transition group-hover:text-indigo-500 dark:text-gray-700"
        aria-hidden="true"
      />
    </Link>
  )
}

function Metric({
  label,
  value,
  tone = "ok",
}: {
  label: string
  value: string
  tone?: "ok" | "warning"
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-gray-500 dark:text-gray-500">
        {label}
      </span>
      <span
        className={cx(
          "font-mono text-xs font-semibold tabular-nums",
          tone === "warning"
            ? "text-amber-600 dark:text-amber-400"
            : "text-gray-900 dark:text-gray-50",
        )}
      >
        {value}
      </span>
    </div>
  )
}

function NamespaceSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1].map((i) => (
        <Card key={i} className="p-0">
          <div className="flex items-center gap-4 px-5 py-4">
            <span className="h-9 w-1 rounded-full bg-gray-200 dark:bg-gray-800" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-28 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-3 w-48 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
            </div>
            <div className="hidden flex-1 gap-4 sm:flex">
              {[0, 1, 2, 3].map((j) => (
                <div
                  key={j}
                  className="h-8 w-20 animate-pulse rounded bg-gray-100 dark:bg-gray-900"
                />
              ))}
            </div>
          </div>
          <div className="border-t border-gray-200 px-5 py-3 dark:border-gray-800">
            <div className="h-6 w-32 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
          </div>
        </Card>
      ))}
    </div>
  )
}
