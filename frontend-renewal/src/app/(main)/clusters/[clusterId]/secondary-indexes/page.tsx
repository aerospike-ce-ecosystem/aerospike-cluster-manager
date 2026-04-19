"use client"

import {
  RiAddLine,
  RiDatabase2Line,
  RiDeleteBin2Line,
  RiInformationLine,
  RiRefreshLine,
} from "@remixicon/react"
import { type ColumnDef } from "@tanstack/react-table"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/Dialog"
import { Input } from "@/components/Input"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DataTable } from "@/components/common/DataTable"
import { EmptyState } from "@/components/common/EmptyState"
import { InlineAlert } from "@/components/common/InlineAlert"
import { PageHeader } from "@/components/common/PageHeader"
import { StatCard } from "@/components/common/StatCard"
import { CreateIndexDialog } from "@/components/dialogs/CreateIndexDialog"
import { ApiError } from "@/lib/api/client"
import { dropIndex, listIndexes } from "@/lib/api/indexes"
import type { SecondaryIndex, SecondaryIndexState } from "@/lib/types/index"
import { useToastStore } from "@/stores/toast-store"

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail || err.message
  if (err instanceof Error) return err.message
  return String(err)
}

const stateBadgeVariant: Record<
  SecondaryIndexState,
  "success" | "warning" | "error"
> = {
  ready: "success",
  building: "warning",
  error: "error",
}

type PageProps = { params: { clusterId: string } }

export default function SecondaryIndexesPage({ params }: PageProps) {
  const { clusterId } = params

  const [indexes, setIndexes] = useState<SecondaryIndex[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SecondaryIndex | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [statsTarget, setStatsTarget] = useState<SecondaryIndex | null>(null)

  const toast = useToastStore((s) => s.addToast)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listIndexes(clusterId)
      setIndexes(data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [clusterId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return indexes
    return indexes.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.bin.toLowerCase().includes(q) ||
        i.namespace.toLowerCase().includes(q) ||
        (i.set ? i.set.toLowerCase().includes(q) : false),
    )
  }, [indexes, filter])

  // Aggregate stats (histogram by namespace + unique indexed bins).
  const { namespaceCounts, indexedBinCount, readyCount, buildingCount } =
    useMemo(() => {
      const nsCounts: Record<string, number> = {}
      const bins = new Set<string>()
      let ready = 0
      let building = 0
      for (const i of indexes) {
        nsCounts[i.namespace] = (nsCounts[i.namespace] ?? 0) + 1
        bins.add(`${i.namespace}.${i.set || "_"}.${i.bin}`)
        if (i.state === "ready") ready++
        if (i.state === "building") building++
      }
      return {
        namespaceCounts: nsCounts,
        indexedBinCount: bins.size,
        readyCount: ready,
        buildingCount: building,
      }
    }, [indexes])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await dropIndex(clusterId, {
        name: deleteTarget.name,
        ns: deleteTarget.namespace,
      })
      toast("success", `Index "${deleteTarget.name}" dropped`)
      setDeleteTarget(null)
      await load()
    } catch (err) {
      toast("error", errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const columns = useMemo<ColumnDef<SecondaryIndex>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ getValue }) => (
          <span className="font-mono font-semibold text-gray-900 dark:text-gray-50">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "namespace",
        header: "Namespace",
        size: 140,
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: "set",
        header: "Set",
        size: 140,
        cell: ({ getValue }) => {
          const v = getValue() as string
          return v ? (
            <span className="font-mono text-sm">{v}</span>
          ) : (
            <span className="text-xs italic text-gray-500 dark:text-gray-400">
              all
            </span>
          )
        },
      },
      {
        accessorKey: "bin",
        header: "Bin",
        size: 140,
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        size: 130,
        cell: ({ getValue }) => (
          <Badge variant="neutral">{getValue() as string}</Badge>
        ),
      },
      {
        accessorKey: "state",
        header: "State",
        size: 120,
        cell: ({ getValue }) => {
          const s = getValue() as SecondaryIndexState
          return <Badge variant={stateBadgeVariant[s]}>{s}</Badge>
        },
      },
      {
        id: "actions",
        header: "Actions",
        size: 120,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              className="size-8 p-0"
              aria-label={`Show stats for ${row.original.name}`}
              onClick={() => setStatsTarget(row.original)}
            >
              <RiInformationLine className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              className="size-8 p-0 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              aria-label={`Drop index ${row.original.name}`}
              onClick={() => setDeleteTarget(row.original)}
            >
              <RiDeleteBin2Line className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  )

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="Secondary indexes"
        description="Manage secondary indexes to accelerate queries on specific bins."
        actions={
          <>
            <Input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter indexes..."
              className="w-60"
            />
            <Button
              variant="secondary"
              onClick={() => void load()}
              isLoading={loading}
            >
              <RiRefreshLine className="mr-2 size-4" aria-hidden="true" />
              Refresh
            </Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <RiAddLine className="mr-2 size-4" aria-hidden="true" />
              Create index
            </Button>
          </>
        }
      />

      <InlineAlert message={error} />

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total indexes"
          value={indexes.length}
          icon={RiDatabase2Line}
          trend="neutral"
        />
        <StatCard
          label="Indexed bins"
          value={indexedBinCount}
          icon={RiDatabase2Line}
          trend="neutral"
        />
        <StatCard
          label="Ready"
          value={readyCount}
          icon={RiDatabase2Line}
          trend="up"
        />
        <StatCard
          label="Building"
          value={buildingCount}
          icon={RiDatabase2Line}
          trend={buildingCount > 0 ? "down" : "neutral"}
        />
      </div>

      {/* Per-namespace histogram */}
      {Object.keys(namespaceCounts).length > 0 && (
        <NamespaceHistogram counts={namespaceCounts} total={indexes.length} />
      )}

      <Card className="p-0">
        <DataTable
          data={filtered}
          columns={columns}
          loading={loading}
          emptyState={
            <EmptyState
              icon={RiDatabase2Line}
              title={
                indexes.length === 0
                  ? "No secondary indexes"
                  : "No indexes match the filter"
              }
              description={
                indexes.length === 0
                  ? "Create an index to speed up queries on specific bins."
                  : "Try a different search term or clear the filter."
              }
              action={
                indexes.length === 0 ? (
                  <Button variant="primary" onClick={() => setCreateOpen(true)}>
                    <RiAddLine className="mr-2 size-4" aria-hidden="true" />
                    Create index
                  </Button>
                ) : undefined
              }
            />
          }
          testId="indexes-table"
        />
      </Card>

      <CreateIndexDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => void load()}
        connId={clusterId}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Drop index"
        description={`Drop index "${deleteTarget?.name}" on ${deleteTarget?.namespace}? This may impact query performance and cannot be undone.`}
        confirmLabel="Drop"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />

      <IndexStatsDialog
        target={statsTarget}
        onOpenChange={(open) => !open && setStatsTarget(null)}
      />
    </main>
  )
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function NamespaceHistogram({
  counts,
  total,
}: {
  counts: Record<string, number>
  total: number
}) {
  const entries = Object.entries(counts).sort(([, a], [, b]) => b - a)
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
        Indexes per namespace
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {entries.map(([ns, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <li key={ns} className="flex items-center gap-3">
              <span className="min-w-[6rem] font-mono text-xs text-gray-700 dark:text-gray-300">
                {ns}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.max(pct, 2)}%` }}
                  aria-hidden="true"
                />
              </div>
              <span className="w-16 text-right font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {count}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

interface IndexStatsDialogProps {
  target: SecondaryIndex | null
  onOpenChange: (open: boolean) => void
}

function IndexStatsDialog({ target, onOpenChange }: IndexStatsDialogProps) {
  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono">{target?.name}</DialogTitle>
          <DialogDescription>
            Secondary index configuration and current state.
          </DialogDescription>
        </DialogHeader>
        {target && (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <StatRow label="Namespace" value={target.namespace} />
            <StatRow label="Set" value={target.set || "(all sets)"} />
            <StatRow label="Bin" value={target.bin} />
            <StatRow label="Type" value={target.type} />
            <StatRow label="State" value={target.state} />
          </dl>
        )}
        {/* FIXME(stream-b): wire up `asinfo "sindex/ns/name"` backend endpoint
            for live size/n_keys once available. */}
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Live index statistics (size, n_keys) will appear here once the backend
          exposes <code className="font-mono">asinfo sindex/…</code>.
        </p>
      </DialogContent>
    </Dialog>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-mono text-gray-900 dark:text-gray-50">{value}</dd>
    </div>
  )
}
