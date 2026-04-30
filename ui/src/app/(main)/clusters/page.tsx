"use client"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from "@/components/Table"
import { AddressCopyCell } from "@/components/clusters/AddressCopyCell"
import { LabelsCell } from "@/components/clusters/LabelsCell"
import {
  DEFAULT_ENV_VALUE,
  ENV_LABEL_KEY,
} from "@/components/clusters/LabelsEditor"
import { getEnvTone } from "@/components/clusters/envTone"
import { AddConnectionDialog } from "@/components/dialogs/AddConnectionDialog"
import { EditConnectionDialog } from "@/components/dialogs/EditConnectionDialog"
import { clusterSections } from "@/app/siteConfig"
import { useConnections } from "@/hooks/use-connections"
import { useK8sClusters } from "@/hooks/use-k8s-clusters"
import type { ConnectionProfileResponse } from "@/lib/types/connection"
import type { K8sClusterSummary } from "@/lib/types/k8s"
import { cx, focusRing } from "@/lib/utils"
import { type ClustersView, useUiStore } from "@/stores/ui-store"
import { RiLayoutGridLine, RiListCheck2 } from "@remixicon/react"
import Link from "next/link"
import { useMemo, useState } from "react"

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
  description: string | null
  labels: Record<string, string>
  profile: ConnectionProfileResponse | null
}

const ENV_PRIORITY = ["prod", "stage", "test", "dev", DEFAULT_ENV_VALUE]

function envSortKey(env: string): [number, string] {
  const idx = ENV_PRIORITY.indexOf(env.toLowerCase())
  return [idx === -1 ? ENV_PRIORITY.length : idx, env.toLowerCase()]
}

function compareEnv(a: string, b: string): number {
  const [ia, sa] = envSortKey(a)
  const [ib, sb] = envSortKey(b)
  return ia !== ib ? ia - ib : sa.localeCompare(sb)
}

function ensureEnvLabel(
  labels: Record<string, string> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = { ...(labels ?? {}) }
  if (!out[ENV_LABEL_KEY]) out[ENV_LABEL_KEY] = DEFAULT_ENV_VALUE
  return out
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
      description: c.description ?? null,
      labels: ensureEnvLabel(c.labels),
      profile: c,
    })
  }

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
      description: null,
      labels: ensureEnvLabel(null),
      profile: null,
    })
  }

  return rows
}

function groupByEnv(rows: Row[]): Array<{ env: string; rows: Row[] }> {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const env = row.labels[ENV_LABEL_KEY] ?? DEFAULT_ENV_VALUE
    const list = groups.get(env)
    if (list) {
      list.push(row)
    } else {
      groups.set(env, [row])
    }
  }
  return Array.from(groups.entries())
    .map(([env, items]) => ({
      env,
      rows: items.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }))
    .sort((a, b) => compareEnv(a.env, b.env))
}

export default function ClustersPage() {
  const conn = useConnections()
  const k8s = useK8sClusters()

  const [addConnOpen, setAddConnOpen] = useState(false)
  const [editTarget, setEditTarget] =
    useState<ConnectionProfileResponse | null>(null)
  const view = useUiStore((s) => s.clustersView)
  const setView = useUiStore((s) => s.setClustersView)

  const rows = useMemo(
    () => mergeRows(conn.data, k8s.data?.items ?? null),
    [conn.data, k8s.data],
  )
  const groups = useMemo(() => groupByEnv(rows), [rows])

  const loading = conn.isLoading || k8s.isLoading
  const combinedError = conn.error ?? k8s.error

  const handleConnectionUpserted = () => {
    conn.refetch()
  }

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
          <Button variant="secondary" onClick={() => setAddConnOpen(true)}>
            Add Connection
          </Button>
          <Button variant="primary" asChild>
            <Link href="/clusters/new">Create Cluster</Link>
          </Button>
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
        <EmptyState onAddConnection={() => setAddConnOpen(true)} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-500">
              {rows.length} {rows.length === 1 ? "cluster" : "clusters"} ·{" "}
              {groups.length} env group{groups.length === 1 ? "" : "s"}
            </p>
            <ViewToggle value={view} onChange={setView} />
          </div>
          <div className="flex flex-col gap-8">
            {groups.map((group) => (
              <EnvSection
                key={group.env}
                env={group.env}
                rows={group.rows}
                view={view}
                onEdit={setEditTarget}
              />
            ))}
          </div>
        </>
      )}

      <AddConnectionDialog
        open={addConnOpen}
        onOpenChange={setAddConnOpen}
        onSuccess={handleConnectionUpserted}
      />
      <EditConnectionDialog
        open={editTarget !== null}
        connection={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        onSuccess={handleConnectionUpserted}
      />
    </main>
  )
}

function EnvSection({
  env,
  rows,
  view,
  onEdit,
}: {
  env: string
  rows: Row[]
  view: ClustersView
  onEdit: (conn: ConnectionProfileResponse) => void
}) {
  const tone = getEnvTone(env)
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cx("h-4 w-[3px] shrink-0 rounded-full", tone.accent)}
        />
        <span
          className={cx(
            "text-[11px] font-bold uppercase tracking-[0.22em]",
            tone.headerText,
          )}
        >
          env / {env}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-gray-500 dark:text-gray-500">
          {rows.length} {rows.length === 1 ? "cluster" : "clusters"}
        </span>
        <span aria-hidden="true" className={cx("h-px flex-1", tone.rule)} />
      </div>
      {view === "card" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <ClusterCard key={r.key} row={r} onEdit={onEdit} />
          ))}
        </div>
      ) : (
        <ClusterTable rows={rows} onEdit={onEdit} />
      )}
    </section>
  )
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ClustersView
  onChange: (v: ClustersView) => void
}) {
  const options: Array<{
    value: ClustersView
    label: string
    icon: typeof RiLayoutGridLine
  }> = [
    { value: "card", label: "Card view", icon: RiLayoutGridLine },
    { value: "table", label: "Table view", icon: RiListCheck2 },
  ]

  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 dark:border-gray-800 dark:bg-gray-950"
    >
      {options.map((opt) => {
        const Icon = opt.icon
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={cx(
              "flex size-7 items-center justify-center rounded transition",
              active
                ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-500 hover:dark:bg-gray-900 hover:dark:text-gray-50",
              focusRing,
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

function NameLink({ row }: { row: Row }) {
  const content = (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="inline-block size-2 shrink-0 rounded-sm"
        style={{ background: row.color }}
      />
      <span className="truncate">{row.displayName}</span>
    </span>
  )
  if (row.connId) {
    return (
      <Link
        href={clusterSections.overview(row.connId)}
        className={cx(
          "block font-mono font-medium text-gray-900 transition hover:text-indigo-600 dark:text-gray-50 dark:hover:text-indigo-400",
          focusRing,
        )}
      >
        {content}
      </Link>
    )
  }
  return (
    <span className="block font-mono font-medium text-gray-500 dark:text-gray-500">
      {content}
    </span>
  )
}

function ClusterTable({
  rows,
  onEdit,
}: {
  rows: Row[]
  onEdit: (conn: ConnectionProfileResponse) => void
}) {
  return (
    <Card className="p-0">
      <TableRoot>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Managed by</TableHeaderCell>
              <TableHeaderCell>Labels</TableHeaderCell>
              <TableHeaderCell>Description</TableHeaderCell>
              <TableHeaderCell>Address</TableHeaderCell>
              <TableHeaderCell className="w-12 text-right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const status = phaseBadge(r.phase)
              return (
                <TableRow
                  key={r.key}
                  className="transition hover:bg-gray-50 dark:hover:bg-gray-900/40"
                >
                  <TableCell>
                    <NameLink row={r} />
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`size-2 rounded-full ${status.dot}`}
                        aria-hidden="true"
                      />
                      <span className="text-xs uppercase tracking-wider text-gray-600 dark:text-gray-400">
                        {status.label}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {r.managedBy === "ACKO" ? (
                      <Badge
                        variant="default"
                        className="uppercase tracking-wider"
                      >
                        ACKO
                      </Badge>
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">
                        Manual
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <LabelsCell labels={r.labels} hideEnv />
                  </TableCell>
                  <TableCell className="max-w-[260px]">
                    {r.description ? (
                      <span
                        className="block truncate text-gray-600 dark:text-gray-400"
                        title={r.description}
                      >
                        {r.description}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-600">
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <AddressCopyCell
                      hosts={r.hosts}
                      port={r.port}
                      fallback={r.k8sNamespace ?? "—"}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {r.profile ? (
                      <Button
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => onEdit(r.profile!)}
                      >
                        Edit
                      </Button>
                    ) : (
                      <Badge variant="warning" className="text-[10px]">
                        not linked
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableRoot>
    </Card>
  )
}

function ClusterCard({
  row,
  onEdit,
}: {
  row: Row
  onEdit: (conn: ConnectionProfileResponse) => void
}) {
  const status = phaseBadge(row.phase)
  const cardInner = (
    <Card
      className={cx(
        "flex h-full flex-col gap-3 transition",
        row.connId &&
          "hover:border-indigo-300 hover:shadow-sm dark:hover:border-indigo-700",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1 h-6 w-1 shrink-0 rounded-sm"
          style={{ background: row.color }}
        />
        <div className="min-w-0 flex-1">
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
          {row.description && (
            <p
              className="mt-1 truncate text-xs text-gray-500 dark:text-gray-500"
              title={row.description}
            >
              {row.description}
            </p>
          )}
        </div>
      </div>

      {Object.keys(row.labels).filter((k) => k !== ENV_LABEL_KEY).length >
        0 && <LabelsCell labels={row.labels} hideEnv />}

      <AddressCopyCell
        hosts={row.hosts}
        port={row.port}
        fallback={row.k8sNamespace ?? "—"}
        className="text-xs"
      />

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
        <span className="text-xs text-gray-500 dark:text-gray-500">
          {row.managedBy === "ACKO" ? "ACKO" : "Manual"}
        </span>
        {row.profile ? (
          <Button
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onEdit(row.profile!)
            }}
          >
            Edit
          </Button>
        ) : (
          <Badge variant="warning">not linked</Badge>
        )}
      </div>
    </Card>
  )

  if (row.connId) {
    return (
      <Link
        href={clusterSections.overview(row.connId)}
        className={cx("block focus-visible:outline-none", focusRing)}
      >
        {cardInner}
      </Link>
    )
  }
  return cardInner
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

function EmptyState({ onAddConnection }: { onAddConnection: () => void }) {
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
        <Button variant="secondary" onClick={onAddConnection}>
          Add Connection
        </Button>
        <Button variant="primary" asChild>
          <Link href="/clusters/new">Create Cluster</Link>
        </Button>
      </div>
    </Card>
  )
}
