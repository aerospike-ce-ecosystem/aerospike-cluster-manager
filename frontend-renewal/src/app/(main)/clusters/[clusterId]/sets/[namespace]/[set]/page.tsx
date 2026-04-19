"use client"

import {
  RiAddLine,
  RiCheckLine,
  RiCodeSSlashLine,
  RiDatabase2Line,
  RiDeleteBin2Line,
  RiEyeLine,
  RiFileCopyLine,
  RiFileDownloadLine,
  RiFileListLine,
  RiPencilLine,
  RiRefreshLine,
  RiSubtractLine,
  RiCloseLine,
} from "@remixicon/react"
import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { clusterSections } from "@/app/siteConfig"
import { Button } from "@/components/Button"
import { BatchReadDialog } from "@/components/browser/BatchReadDialog"
import { FilterToolbar } from "@/components/browser/FilterToolbar"
import {
  RecordEditorDialog,
  type BinEntry,
} from "@/components/browser/RecordEditorDialog"
import { renderCellValue } from "@/components/browser/RecordCellRenderer"
import {
  buildBinEntriesFromRecord,
  createEmptyBinEntry,
  detectBinTypes,
  formatNumber,
  formatTTLAsExpiry,
  getErrorMessage,
  parseBinValue,
  truncateMiddle,
} from "@/components/browser/_utils"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DataTable } from "@/components/common/DataTable"
import { EmptyState } from "@/components/common/EmptyState"
import { listIndexes } from "@/lib/api/indexes"
import { PAGE_SIZE_OPTIONS } from "@/lib/constants"
import type { BinDataType } from "@/lib/types/query"
import type { SecondaryIndex } from "@/lib/types/index"
import type {
  AerospikeRecord,
  BinValue,
  RecordWriteRequest,
} from "@/lib/types/record"
import { cx } from "@/lib/utils"
import { useBrowserStore } from "@/stores/browser-store"
import { useConnectionStore } from "@/stores/connection-store"
import { useFilterStore } from "@/stores/filter-store"
import { useToastStore } from "@/stores/toast-store"

type PageProps = {
  params: { clusterId: string; namespace: string; set: string }
}

export default function RecordBrowserPage({ params }: PageProps) {
  const clusterId = params.clusterId
  const decodedNs = decodeURIComponent(params.namespace)
  const decodedSet = decodeURIComponent(params.set)

  const router = useRouter()

  const {
    records,
    total,
    pageSize,
    loading,
    error,
    executionTimeMs,
    scannedRecords,
    totalEstimated,
    fetchFilteredRecords,
    putRecord,
    deleteRecord,
    clearCache,
  } = useBrowserStore()

  const filterStore = useFilterStore()

  const connections = useConnectionStore((s) => s.connections)
  const currentConnection = useMemo(
    () => connections.find((c) => c.id === clusterId),
    [connections, clusterId],
  )

  /* ── Page-level state ─────────────────────────────── */

  const [selectedPKs, setSelectedPKs] = useState<Set<string>>(new Set())
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<"duplicate">("duplicate")
  const [deleteTarget, setDeleteTarget] = useState<AerospikeRecord | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)

  const [editorPK, setEditorPK] = useState("")
  const [editorTTL, setEditorTTL] = useState("0")
  const [editorBins, setEditorBins] = useState<BinEntry[]>([
    createEmptyBinEntry(),
  ])
  const [useCodeEditor, setUseCodeEditor] = useState<Record<string, boolean>>(
    {},
  )

  // Page-local page size — not URL-persisted in renewal
  const [currentPageSize, setCurrentPageSize] = useState(pageSize)

  /* ── Secondary indexes for filter-bin availability ── */

  const [indexes, setIndexes] = useState<SecondaryIndex[]>([])

  useEffect(() => {
    let cancelled = false
    listIndexes(clusterId)
      .then((idx) => {
        if (!cancelled) setIndexes(idx)
      })
      .catch(() => {
        // Swallow — filters will just show "no indexed bins".
      })
    return () => {
      cancelled = true
    }
  }, [clusterId])

  /* ── Reset filter store + cache on unmount ────────── */

  useEffect(() => {
    return () => {
      filterStore.reset()
      clearCache()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Fetch records whenever (filters, pageSize, pk) changes ── */

  const activeFilters = useMemo(
    () => filterStore.toFilterGroup(),
    [filterStore],
  )
  const activeFiltersKey = useMemo(
    () => JSON.stringify(activeFilters ?? null),
    [activeFilters],
  )

  const activePrimaryKey = filterStore.primaryKey.trim()

  useEffect(() => {
    fetchFilteredRecords(
      clusterId,
      decodedNs,
      decodedSet,
      activeFilters,
      currentPageSize,
      activePrimaryKey || undefined,
    )
    // JSON-ify filters so dependency array is stable when conditions haven't
    // semantically changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clusterId,
    decodedNs,
    decodedSet,
    activeFiltersKey,
    currentPageSize,
    activePrimaryKey,
  ])

  useEffect(() => {
    setSelectedPKs(new Set())
  }, [activeFiltersKey, activePrimaryKey, currentPageSize])

  /* ── Derived: dynamic bin columns + type hints ────── */

  const binColumns = useMemo(() => {
    const all = new Set<string>()
    records.forEach((r) => Object.keys(r.bins).forEach((b) => all.add(b)))
    return Array.from(all).sort()
  }, [records])

  const binTypeHints = useMemo(() => detectBinTypes(records), [records])

  const indexedBinSet = useMemo(() => {
    const map = new Map<string, SecondaryIndex>()
    for (const idx of indexes) {
      if (
        idx.namespace === decodedNs &&
        idx.set === decodedSet &&
        idx.state === "ready"
      ) {
        map.set(idx.bin, idx)
      }
    }
    return map
  }, [indexes, decodedNs, decodedSet])

  const availableBins = useMemo(
    () =>
      Array.from(indexedBinSet.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, idx]) => {
          const indexType: BinDataType =
            idx.type === "numeric"
              ? "integer"
              : idx.type === "geo2dsphere"
                ? "geo"
                : "string"
          return {
            name,
            type: binTypeHints[name] ?? indexType,
          }
        }),
    [binTypeHints, indexedBinSet],
  )

  /* ── Reload / refresh helpers ─────────────────────── */

  const refreshCurrentView = useCallback(async () => {
    await fetchFilteredRecords(
      clusterId,
      decodedNs,
      decodedSet,
      activeFilters,
      currentPageSize,
      activePrimaryKey || undefined,
      true,
    )
  }, [
    activeFilters,
    activePrimaryKey,
    clusterId,
    currentPageSize,
    decodedNs,
    decodedSet,
    fetchFilteredRecords,
  ])

  const handleFilterExecute = useCallback(() => {
    setSelectedPKs(new Set())
    // re-run via effect dependency on activeFiltersKey
  }, [])

  const handlePKLookup = useCallback(
    (pk: string) => {
      setSelectedPKs(new Set())
      filterStore.setPrimaryKey(pk.trim())
    },
    [filterStore],
  )

  /* ── Duplicate / delete / save ────────────────────── */

  const openDuplicateEditor = useCallback((record: AerospikeRecord) => {
    const nextBins = buildBinEntriesFromRecord(record)
    setEditorMode("duplicate")
    setEditorPK("")
    setEditorTTL(String(record.meta.ttl))
    setEditorBins(nextBins.length > 0 ? nextBins : [createEmptyBinEntry()])
    setUseCodeEditor({})
    setEditorOpen(true)
  }, [])

  const openRecordDetail = useCallback(
    (record: AerospikeRecord, intent?: "edit") => {
      const href = clusterSections.record(
        clusterId,
        decodedNs,
        decodedSet,
        encodeURIComponent(record.key.pk ?? ""),
      )
      router.push(intent === "edit" ? `${href}?intent=edit` : href)
    },
    [clusterId, decodedNs, decodedSet, router],
  )

  const addBin = useCallback(() => {
    setEditorBins((prev) => [...prev, createEmptyBinEntry()])
  }, [])

  const removeBin = useCallback((id: string) => {
    setEditorBins((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const updateBin = useCallback(
    (id: string, field: keyof BinEntry, val: string) => {
      setEditorBins((prev) =>
        prev.map((b) => (b.id === id ? { ...b, [field]: val } : b)),
      )
    },
    [],
  )

  const handleSaveRecord = async () => {
    if (!editorPK.trim()) {
      useToastStore.getState().addToast("error", "Primary key is required")
      return
    }
    setSaving(true)
    try {
      const binMap: Record<string, BinValue> = {}
      for (const bin of editorBins) {
        if (bin.name.trim()) {
          binMap[bin.name.trim()] = parseBinValue(bin.value, bin.type)
        }
      }
      const data: RecordWriteRequest = {
        key: { namespace: decodedNs, set: decodedSet, pk: editorPK.trim() },
        bins: binMap,
        ttl: parseInt(editorTTL, 10) || 0,
      }
      await putRecord(clusterId, data, { refresh: refreshCurrentView })
      useToastStore.getState().addToast("success", "Record duplicated")
      setEditorOpen(false)
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRecord = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteRecord(
        clusterId,
        deleteTarget.key.namespace,
        deleteTarget.key.set ?? decodedSet,
        deleteTarget.key.pk ?? "",
        { refresh: refreshCurrentView },
      )
      useToastStore.getState().addToast("success", "Record deleted")
      setDeleteTarget(null)
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  /* ── Selection ────────────────────────────────────── */

  const selectedPKsRef = useRef(selectedPKs)
  selectedPKsRef.current = selectedPKs

  const togglePK = useCallback((pk: string) => {
    setSelectedPKs((prev) => {
      const next = new Set(prev)
      if (next.has(pk)) next.delete(pk)
      else next.add(pk)
      return next
    })
  }, [])

  const toggleAllPKs = useCallback(() => {
    setSelectedPKs((prev) => {
      if (prev.size === records.length) return new Set()
      return new Set(records.map((r) => String(r.key.pk)))
    })
  }, [records])

  const generateBatchReadCode = useCallback(() => {
    const selected = records.filter((r) => selectedPKs.has(String(r.key.pk)))
    const host = currentConnection?.hosts?.[0] ?? "127.0.0.1"
    const port = currentConnection?.port ?? 3000
    const keysStr = selected
      .map(
        (r) =>
          `        ("${decodedNs}", "${decodedSet}", "${r.key.pk}")`,
      )
      .join(",\n")

    return `import asyncio
import aerospike_py as aerospike

async def main():
    client = aerospike.AsyncClient({"hosts": [("${host}", ${port})]})
    await client.connect()

    keys = [
${keysStr},
    ]

    batch = await client.batch_read(keys)

    for br in batch.batch_records:
        if br.record:
            print(br.record.bins)
        else:
            print(f"Failed to read key: {br.key}")

    await client.close()

asyncio.run(main())`
  }, [records, selectedPKs, decodedNs, decodedSet, currentConnection])

  /* ── Export (JSON / CSV) ──────────────────────────── */

  const handleExportJSON = useCallback(() => {
    const data = records.map((r) => ({
      key: r.key,
      meta: r.meta,
      bins: r.bins,
    }))
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `records-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    useToastStore.getState().addToast("success", "Exported as JSON")
  }, [records])

  const handleExportCSV = useCallback(() => {
    if (records.length === 0) return
    const binNames = new Set<string>()
    records.forEach((r) => Object.keys(r.bins).forEach((b) => binNames.add(b)))
    const headers = ["pk", "generation", "ttl", ...Array.from(binNames)]
    const rows = records.map((r) => [
      r.key.pk,
      r.meta.generation,
      r.meta.ttl,
      ...Array.from(binNames).map((b) => {
        const val = r.bins[b]
        if (val === null || val === undefined) return ""
        if (typeof val === "object") return JSON.stringify(val)
        return String(val)
      }),
    ])
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `records-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    useToastStore.getState().addToast("success", "Exported as CSV")
  }, [records])

  /* ── Table columns ────────────────────────────────── */

  const tableColumns = useMemo<ColumnDef<AerospikeRecord>[]>(
    () => [
      {
        id: "select",
        size: 40,
        header: () => {
          const pks = selectedPKsRef.current
          return (
            <button
              type="button"
              onClick={toggleAllPKs}
              className={cx(
                "inline-flex h-4 w-4 items-center justify-center rounded border transition-colors",
                pks.size === records.length && records.length > 0
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : pks.size > 0
                    ? "border-indigo-500/60 bg-indigo-500/20"
                    : "border-gray-300 hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-600",
              )}
              aria-label="Select all rows"
            >
              {pks.size === records.length && records.length > 0 ? (
                <RiCheckLine aria-hidden className="size-3" />
              ) : pks.size > 0 ? (
                <RiSubtractLine aria-hidden className="size-3" />
              ) : null}
            </button>
          )
        },
        cell: ({ row }) => {
          const pks = selectedPKsRef.current
          const pkStr = String(row.original.key.pk)
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                togglePK(pkStr)
              }}
              className={cx(
                "inline-flex h-4 w-4 items-center justify-center rounded border transition-colors",
                pks.has(pkStr)
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-gray-300 hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-600",
              )}
              aria-label={`Select ${pkStr}`}
            >
              {pks.has(pkStr) && (
                <RiCheckLine aria-hidden className="size-3" />
              )}
            </button>
          )
        },
      },
      {
        id: "pk",
        size: 200,
        header: () => <span>PK</span>,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openRecordDetail(row.original)
            }}
            className="w-full truncate text-left font-mono text-[13px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {truncateMiddle(String(row.original.key.pk), 28)}
          </button>
        ),
      },
      {
        id: "gen",
        size: 56,
        header: () => <span>Gen</span>,
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {row.original.meta.generation}
          </span>
        ),
      },
      {
        id: "ttl",
        size: 140,
        header: () => <span>Expiry</span>,
        cell: ({ row }) => {
          const ttl = row.original.meta.ttl
          return (
            <span
              className="font-mono text-xs text-gray-500 dark:text-gray-400"
              title={`Expires: ${formatTTLAsExpiry(ttl, true)}  (TTL: ${ttl}s)`}
            >
              {formatTTLAsExpiry(ttl)}
            </span>
          )
        },
      },
      ...binColumns.map<ColumnDef<AerospikeRecord>>((col) => ({
        id: `bin_${col}`,
        size: 140,
        header: () => (
          <span className="font-mono text-[10px] font-semibold tracking-[0.1em]">
            {col}
          </span>
        ),
        cell: ({ row }) => renderCellValue(row.original.bins[col], col),
      })),
      {
        id: "actions",
        size: 130,
        header: () => null,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openRecordDetail(row.original)
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-50"
              title="View"
              aria-label={`View ${row.original.key.pk}`}
            >
              <RiEyeLine aria-hidden className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openRecordDetail(row.original, "edit")
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-50"
              title="Edit"
              aria-label={`Edit ${row.original.key.pk}`}
            >
              <RiPencilLine aria-hidden className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openDuplicateEditor(row.original)
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-50"
              title="Duplicate"
              aria-label={`Duplicate ${row.original.key.pk}`}
            >
              <RiFileCopyLine aria-hidden className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setDeleteTarget(row.original)
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
              title="Delete"
              aria-label={`Delete ${row.original.key.pk}`}
            >
              <RiDeleteBin2Line aria-hidden className="size-3.5" />
            </button>
          </div>
        ),
      },
    ],
    [
      binColumns,
      openDuplicateEditor,
      openRecordDetail,
      records.length,
      toggleAllPKs,
      togglePK,
    ],
  )

  /* ── Render ───────────────────────────────────────── */

  const newRecordHref = clusterSections.recordNew(
    clusterId,
    decodedNs,
    decodedSet,
  )

  return (
    <div className="flex min-h-0 flex-col gap-0">
      {/* Breadcrumb + counts */}
      <div className="border-b border-gray-200 px-3 py-2.5 dark:border-gray-800 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <nav className="flex min-w-0 items-center gap-0.5 font-mono text-[13px]">
              <Link
                href={clusterSections.sets(clusterId)}
                className="shrink-0 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
              >
                Sets
              </Link>
              <span className="mx-1 shrink-0 text-gray-400 sm:mx-1.5 dark:text-gray-600">
                ›
              </span>
              <span className="max-w-[60px] truncate text-gray-500 sm:max-w-none dark:text-gray-400">
                {decodedNs}
              </span>
              <span className="mx-1 shrink-0 text-gray-400 sm:mx-1.5 dark:text-gray-600">
                ›
              </span>
              <span className="max-w-[80px] truncate font-medium text-indigo-600 sm:max-w-none dark:text-indigo-400">
                {decodedSet}
              </span>
            </nav>

            {total > 0 && (
              <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-indigo-500/15 bg-indigo-500/5 px-2.5 py-0.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-500 opacity-40" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500" />
                </span>
                <span className="font-mono text-[11px] font-medium tabular-nums text-indigo-700 dark:text-indigo-400">
                  {totalEstimated ? "~" : ""}
                  {formatNumber(total)}
                </span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={refreshCurrentView}
              disabled={loading}
              className="h-8 gap-1.5 text-xs"
              aria-label="Reload records"
            >
              <RiRefreshLine
                aria-hidden
                className={cx("size-3.5", loading && "animate-spin")}
              />
              <span className="hidden sm:inline">Reload</span>
            </Button>
            <Button variant="secondary" asChild className="h-8 text-xs">
              <Link href={newRecordHref} className="gap-1.5">
                <RiAddLine aria-hidden className="size-3" />
                <span className="hidden sm:inline">New record</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <FilterToolbar
        connId={clusterId}
        namespace={decodedNs}
        set={decodedSet}
        availableBins={availableBins}
        onExecute={handleFilterExecute}
        onPKLookup={handlePKLookup}
        loading={loading}
        error={error}
        stats={
          filterStore.conditions.length > 0
            ? { executionTimeMs, scannedRecords, returnedRecords: total }
            : undefined
        }
      />

      {/* Export bar */}
      {filterStore.conditions.length > 0 && records.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800 sm:px-6">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Export {formatNumber(records.length)} visible record
            {records.length === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleExportJSON}
              className="h-7 gap-1.5 text-xs"
              aria-label="Export JSON"
            >
              <RiFileListLine aria-hidden className="size-3.5" />
              <span className="hidden sm:inline">JSON</span>
            </Button>
            <Button
              variant="secondary"
              onClick={handleExportCSV}
              className="h-7 gap-1.5 text-xs"
              aria-label="Export CSV"
            >
              <RiFileDownloadLine aria-hidden className="size-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="relative mt-3 flex-1 min-w-0">
        <DataTable
          data={records}
          columns={tableColumns}
          loading={loading}
          density="compact"
          testId="records-table"
          emptyState={
            filterStore.conditions.length > 0 ? (
              <EmptyState
                icon={RiDatabase2Line}
                title="No results"
                description="No records match the current filters. Try adjusting or clearing the filters."
              />
            ) : (
              <EmptyState
                icon={RiDatabase2Line}
                title="No records found"
                description="This set appears to be empty. Create a new record to get started."
                action={
                  <Button asChild>
                    <Link href={newRecordHref} className="gap-1.5">
                      <RiAddLine aria-hidden className="size-4" />
                      Create Record
                    </Link>
                  </Button>
                }
              />
            )
          }
        />
      </div>

      {/* Selection toolbar */}
      {selectedPKs.size > 0 && (
        <div className="shrink-0 border-t border-indigo-500/30 bg-indigo-500/5 px-3 py-2 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] font-medium tabular-nums text-indigo-700 dark:text-indigo-400">
                {selectedPKs.size} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedPKs(new Set())}
                className="inline-flex items-center gap-1 font-mono text-[11px] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
              >
                <RiCloseLine aria-hidden className="size-3" />
                Clear
              </button>
            </div>
            <Button
              variant="secondary"
              onClick={() => setBatchDialogOpen(true)}
              className="h-7 gap-1.5 text-xs"
            >
              <RiCodeSSlashLine aria-hidden className="size-3" />
              Generate batch_read
            </Button>
          </div>
        </div>
      )}

      {/* Bottom status bar */}
      {(records.length > 0 || total > 0) && (
        <div className="flex w-full shrink-0 items-center border-t border-gray-200 bg-gray-50 px-4 py-1.5 dark:border-gray-800 dark:bg-gray-900/40 sm:px-6">
          <div className="flex items-center gap-2">
            {executionTimeMs > 0 && (
              <div className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400">
                <svg
                  aria-hidden
                  className="size-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="font-mono text-[11px] font-bold tabular-nums">
                  {executionTimeMs}ms
                </span>
              </div>
            )}
            <span className="h-3.5 w-px bg-gray-300 dark:bg-gray-700" />
            <div className="flex items-center gap-1 font-mono text-[12px] tabular-nums">
              <span className="font-bold">{formatNumber(records.length)}</span>
              <span className="text-gray-400">of</span>
              <span className="font-bold">
                {totalEstimated ? "~" : ""}
                {formatNumber(total)}
              </span>
              <span className="ml-0.5 text-gray-400">rows</span>
            </div>
            <span className="h-3.5 w-px bg-gray-300 dark:bg-gray-700" />
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-gray-500">
                Limit
              </span>
              <select
                value={String(currentPageSize)}
                onChange={(e) =>
                  setCurrentPageSize(parseInt(e.target.value, 10))
                }
                className="h-6 appearance-none rounded border border-gray-300 bg-white px-1.5 font-mono text-[11px] font-bold text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50"
                disabled={loading}
                aria-label="Records limit"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={String(size)}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <RecordEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editorMode}
        namespace={decodedNs}
        set={decodedSet}
        pk={editorPK}
        onPKChange={setEditorPK}
        ttl={editorTTL}
        onTTLChange={setEditorTTL}
        bins={editorBins}
        onAddBin={addBin}
        onRemoveBin={removeBin}
        onUpdateBin={updateBin}
        useCodeEditor={useCodeEditor}
        onToggleCodeEditor={(id) =>
          setUseCodeEditor((prev) => ({ ...prev, [id]: !prev[id] }))
        }
        saving={saving}
        onSave={handleSaveRecord}
      />

      <BatchReadDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        selectedCount={selectedPKs.size}
        generateCode={generateBatchReadCode}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete record"
        description={`Delete record with PK "${deleteTarget?.key.pk}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteRecord}
        loading={deleting}
      />
    </div>
  )
}
