"use client"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { ErrorBanner } from "@/components/ErrorBanner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from "@/components/Table"
import {
  draftHasFilters,
  draftToFilterConditions,
  emptyFilterDraft,
  RecordFilters,
  type FilterDraft,
} from "@/components/browser/RecordFilters"
import { clusterSections } from "@/app/siteConfig"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { listIndexes } from "@/lib/api/indexes"
import { filterRecords } from "@/lib/api/records"
import { TableSkeleton } from "@/components/skeletons/TableSkeleton"
import type { BinDataType } from "@/lib/types/query"
import type { SecondaryIndex } from "@/lib/types/index"
import type { AerospikeRecord } from "@/lib/types/record"
import { cx } from "@/lib/utils"
import { RiRefreshLine, RiTimerLine } from "@remixicon/react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

type PageProps = {
  params: { clusterId: string; namespace: string; set: string }
}

// TTL sentinel for namespaces without default-ttl (uint32 max).
const TTL_NO_EXPIRY = 4_294_967_295

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 50

function formatRowCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

interface QueryMeta {
  total: number
  totalEstimated: boolean
  executionTimeMs: number
}

const EMPTY_META: QueryMeta = {
  total: 0,
  totalEstimated: false,
  executionTimeMs: 0,
}

function formatTtl(ttl: number): string {
  if (!Number.isFinite(ttl) || ttl === TTL_NO_EXPIRY || ttl <= 0) return "never"
  if (ttl >= 86400) return `${Math.round(ttl / 86400)}d`
  if (ttl >= 3600) return `${Math.round(ttl / 3600)}h`
  if (ttl >= 60) return `${Math.round(ttl / 60)}m`
  return `${ttl}s`
}

type BinKind =
  | "string"
  | "integer"
  | "double"
  | "bool"
  | "list"
  | "map"
  | "geojson"
  | "null"

function detectBinKind(v: unknown, name: string): BinKind {
  if (v === null || v === undefined) return "null"
  if (name.toLowerCase().includes("geojson") && typeof v === "string")
    return "geojson"
  if (Array.isArray(v)) return "list"
  if (typeof v === "object") return "map"
  if (typeof v === "boolean") return "bool"
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "double"
  if (typeof v === "string") {
    // Heuristic: GeoJSON often stored as JSON string
    if (v.startsWith('{"type"') && v.includes("coordinates")) return "geojson"
    return "string"
  }
  return "string"
}

function renderBin(v: unknown, name: string): React.ReactNode {
  const kind = detectBinKind(v, name)
  if (kind === "null")
    return <span className="italic text-gray-400 dark:text-gray-600">null</span>
  if (kind === "bool")
    return (
      <span className="font-mono text-xs">
        {v === true || v === 1 ? "true" : "false"}
      </span>
    )
  if (kind === "integer" || kind === "double")
    return (
      <span className="font-mono text-xs tabular-nums text-indigo-700 dark:text-indigo-400">
        {String(v)}
      </span>
    )
  if (kind === "geojson") {
    const label = typeof v === "string" ? v : JSON.stringify(v)
    return (
      <Badge variant="success">
        <span className="max-w-[14rem] truncate font-mono text-[10px]">
          geo · {label.length > 32 ? label.slice(0, 32) + "…" : label}
        </span>
      </Badge>
    )
  }
  if (kind === "list" || kind === "map") {
    const txt = JSON.stringify(v)
    return (
      <Badge variant="neutral">
        <span className="max-w-[16rem] truncate font-mono text-[10px]">
          {kind} · {txt.length > 36 ? txt.slice(0, 36) + "…" : txt}
        </span>
      </Badge>
    )
  }
  const s = String(v)
  return (
    <span
      title={s}
      className="block max-w-[20rem] truncate font-mono text-xs text-gray-900 dark:text-gray-50"
    >
      {s}
    </span>
  )
}

function indexTypeToBinDataType(idx: SecondaryIndex): BinDataType {
  if (idx.type === "numeric") return "integer"
  if (idx.type === "geo2dsphere") return "geo"
  return "string"
}

export default function RecordBrowserPage({ params }: PageProps) {
  const [records, setRecords] = useState<AerospikeRecord[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [indexes, setIndexes] = useState<SecondaryIndex[]>([])
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [meta, setMeta] = useState<QueryMeta>(EMPTY_META)

  // Draft = what the user is composing in the toolbar.
  // Applied = what the most recent fetch used.
  const [draft, setDraft] = useState<FilterDraft>(emptyFilterDraft)
  const [applied, setApplied] = useState<FilterDraft>(emptyFilterDraft)

  const runFetch = useCallback(
    async (target: FilterDraft, size: number) => {
      setLoading(true)
      setError(null)
      try {
        const pk = target.pk.trim()
        const filters = draftToFilterConditions(target)
        const resp = await filterRecords(params.clusterId, {
          namespace: params.namespace,
          set: params.set,
          pageSize: size,
          primaryKey: pk || null,
          filters: filters ?? null,
        })
        setRecords(resp.records)
        setMeta({
          total: resp.total,
          totalEstimated: resp.totalEstimated,
          executionTimeMs: resp.executionTimeMs,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [params.clusterId, params.namespace, params.set],
  )

  // Initial load + reload on set change.
  useEffect(() => {
    const blank = emptyFilterDraft()
    setDraft(blank)
    setApplied(blank)
    // Wipe prior set's data so a failed fetch on the new route can't render
    // the previous set's rows under the new breadcrumb.
    setRecords(null)
    setMeta(EMPTY_META)
    void runFetch(blank, pageSize)
    // Intentionally omit pageSize from deps — we only want to reset on set
    // change, not on every limit change (that's handled by handlePageSize).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runFetch])

  // Load secondary indexes once per connection.
  useEffect(() => {
    let cancelled = false
    listIndexes(params.clusterId)
      .then((data) => {
        if (!cancelled) setIndexes(data)
      })
      .catch(() => {
        if (!cancelled) setIndexes([])
      })
    return () => {
      cancelled = true
    }
  }, [params.clusterId])

  const binColumns = useMemo(() => {
    const names = new Set<string>()
    for (const r of records ?? [])
      for (const k of Object.keys(r.bins)) names.add(k)
    return Array.from(names).sort()
  }, [records])

  // Only bins with a ready secondary index on this ns/set are filterable.
  const availableBins = useMemo(() => {
    const byBin = new Map<string, SecondaryIndex>()
    for (const idx of indexes) {
      if (
        idx.namespace === params.namespace &&
        idx.set === params.set &&
        idx.state === "ready"
      ) {
        byBin.set(idx.bin, idx)
      }
    }
    return Array.from(byBin.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, idx]) => ({ name, type: indexTypeToBinDataType(idx) }))
  }, [indexes, params.namespace, params.set])

  const dirty = useMemo(() => !draftEquals(draft, applied), [draft, applied])

  const handleApply = useCallback(() => {
    setApplied(draft)
    void runFetch(draft, pageSize)
  }, [draft, pageSize, runFetch])

  const handleClear = useCallback(() => {
    const blank = emptyFilterDraft()
    setDraft(blank)
    setApplied(blank)
    void runFetch(blank, pageSize)
  }, [pageSize, runFetch])

  const handleRefresh = useCallback(() => {
    void runFetch(applied, pageSize)
  }, [applied, pageSize, runFetch])

  const handlePageSize = useCallback(
    (next: number) => {
      setPageSize(next)
      void runFetch(applied, next)
    },
    [applied, runFetch],
  )

  const appliedFilterCount =
    applied.conditions.length + (applied.pk.trim() ? 1 : 0)

  return (
    <main className="flex flex-col gap-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500"
      >
        <Link
          href={clusterSections.sets(params.clusterId)}
          className="hover:text-gray-900 dark:hover:text-gray-50"
        >
          Sets
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-mono text-gray-900 dark:text-gray-50">
          {params.namespace}
        </span>
        <span aria-hidden="true">/</span>
        <span className="font-mono text-gray-900 dark:text-gray-50">
          {params.set}
        </span>
      </nav>

      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">
            Records
          </span>
          <h1 className="mt-1 font-mono text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
            {params.namespace}.{params.set}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            {records
              ? appliedFilterCount > 0
                ? `${records.length} records shown · ${appliedFilterCount} filter${appliedFilterCount === 1 ? "" : "s"} active`
                : `${records.length} records shown`
              : loading
                ? "Loading…"
                : "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleRefresh}
            disabled={loading}
            aria-label="Refresh records"
            title="Refresh records"
            className="h-9 w-9 p-0"
          >
            <RiRefreshLine
              className={cx("size-4", loading && "animate-spin")}
              aria-hidden="true"
            />
          </Button>
          <Button variant="primary">New record</Button>
        </div>
      </header>

      <RecordFilters
        availableBins={availableBins}
        draft={draft}
        onChange={setDraft}
        onApply={handleApply}
        onClear={handleClear}
        loading={loading}
        dirty={dirty}
        trailing={
          <StatusBar
            records={records}
            meta={meta}
            pageSize={pageSize}
            onPageSizeChange={handlePageSize}
            loading={loading}
          />
        }
      />

      {error && (
        <ErrorBanner
          message={error}
          onRetry={handleRefresh}
          disabled={loading}
          staleData={!!records && records.length > 0}
        />
      )}

      <Card className="p-0">
        <TableRoot>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="sticky left-0 z-20 bg-white dark:bg-[#090E1A]">
                  Primary key
                </TableHeaderCell>
                <TableHeaderCell className="text-right">Gen</TableHeaderCell>
                <TableHeaderCell className="text-right">TTL</TableHeaderCell>
                {binColumns.map((b) => (
                  <TableHeaderCell key={b}>
                    <span className="font-mono text-[10px] font-semibold tracking-wider text-gray-500 dark:text-gray-500">
                      {b}
                    </span>
                  </TableHeaderCell>
                ))}
                <TableHeaderCell className="text-right">
                  Actions
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && !records ? (
                <TableSkeleton
                  rows={6}
                  cols={Math.max(binColumns.length, 4) + 4}
                />
              ) : error && !records ? (
                <TableRow>
                  <TableCell
                    colSpan={binColumns.length + 4}
                    className="py-8 text-center text-sm text-red-600 dark:text-red-400"
                  >
                    Failed to load records.
                  </TableCell>
                </TableRow>
              ) : !records || records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={binColumns.length + 4}
                    className="py-8 text-center text-sm text-gray-500 dark:text-gray-500"
                  >
                    {draftHasFilters(applied)
                      ? "No records match the applied filters."
                      : "No records in this set."}
                  </TableCell>
                </TableRow>
              ) : (
                records.map((r) => (
                  <TableRow key={r.key.digest ?? r.key.pk}>
                    <TableCell
                      className={cx(
                        "sticky left-0 z-10 bg-white font-mono text-xs dark:bg-[#090E1A]",
                      )}
                    >
                      <Link
                        href={clusterSections.record(
                          params.clusterId,
                          params.namespace,
                          params.set,
                          encodeURIComponent(r.key.pk ?? ""),
                        )}
                        className="text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {r.key.pk}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {r.meta.generation}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-gray-500">
                      {formatTtl(r.meta.ttl)}
                    </TableCell>
                    {binColumns.map((b) => (
                      <TableCell key={b}>{renderBin(r.bins[b], b)}</TableCell>
                    ))}
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        asChild
                      >
                        <Link
                          href={clusterSections.record(
                            params.clusterId,
                            params.namespace,
                            params.set,
                            encodeURIComponent(r.key.pk ?? ""),
                          )}
                        >
                          Open
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableRoot>
      </Card>
    </main>
  )
}

function StatusBar({
  records,
  meta,
  pageSize,
  onPageSizeChange,
  loading,
}: {
  records: AerospikeRecord[] | null
  meta: QueryMeta
  pageSize: number
  onPageSizeChange: (next: number) => void
  loading: boolean
}) {
  const returned = records?.length ?? 0
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {meta.executionTimeMs > 0 && (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <RiTimerLine className="size-3" aria-hidden="true" />
          {meta.executionTimeMs}ms
        </span>
      )}

      <span
        className="h-3.5 w-px bg-gray-200 dark:bg-gray-800"
        aria-hidden="true"
      />

      <span className="font-mono tabular-nums text-gray-500 dark:text-gray-400">
        <span className="font-semibold text-gray-900 dark:text-gray-50">
          {returned}
        </span>
        <span className="mx-1 opacity-60">of</span>
        <span className="font-semibold text-gray-900 dark:text-gray-50">
          {meta.totalEstimated ? "~" : ""}
          {formatRowCount(meta.total)}
        </span>
        <span className="ml-1 opacity-60">rows</span>
      </span>

      <span
        className="h-3.5 w-px bg-gray-200 dark:bg-gray-800"
        aria-hidden="true"
      />

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-500">
          Limit
        </span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(parseInt(v, 10))}
          disabled={loading}
        >
          <SelectTrigger className="h-7 w-[72px] px-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function draftEquals(a: FilterDraft, b: FilterDraft): boolean {
  if (a.pk !== b.pk) return false
  if (a.logic !== b.logic) return false
  if (a.conditions.length !== b.conditions.length) return false
  for (let i = 0; i < a.conditions.length; i++) {
    const x = a.conditions[i]
    const y = b.conditions[i]
    if (
      x.bin !== y.bin ||
      x.operator !== y.operator ||
      x.binType !== y.binType ||
      x.value !== y.value ||
      x.value2 !== y.value2
    ) {
      return false
    }
  }
  return true
}
