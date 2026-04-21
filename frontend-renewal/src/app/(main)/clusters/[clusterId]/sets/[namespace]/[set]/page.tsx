"use client"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Input } from "@/components/Input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from "@/components/Table"
import { clusterSections } from "@/app/siteConfig"
import { listRecords } from "@/lib/api/records"
import type { AerospikeRecord } from "@/lib/types/record"
import { cx } from "@/lib/utils"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

type PageProps = { params: { clusterId: string; namespace: string; set: string } }

// TTL sentinel for namespaces without default-ttl (uint32 max).
const TTL_NO_EXPIRY = 4_294_967_295

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
  if (name.toLowerCase().includes("geojson") && typeof v === "string") return "geojson"
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
        <span className="truncate max-w-[14rem] font-mono text-[10px]">
          geo · {label.length > 32 ? label.slice(0, 32) + "…" : label}
        </span>
      </Badge>
    )
  }
  if (kind === "list" || kind === "map") {
    const txt = JSON.stringify(v)
    return (
      <Badge variant="neutral">
        <span className="truncate max-w-[16rem] font-mono text-[10px]">
          {kind} · {txt.length > 36 ? txt.slice(0, 36) + "…" : txt}
        </span>
      </Badge>
    )
  }
  const s = String(v)
  return <span className="font-mono text-xs text-gray-900 dark:text-gray-50">{s}</span>
}

export default function RecordBrowserPage({ params }: PageProps) {
  const [records, setRecords] = useState<AerospikeRecord[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pkFilter, setPkFilter] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await listRecords(params.clusterId, {
        ns: params.namespace,
        set: params.set,
        pageSize: 50,
      })
      setRecords(resp.records)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRecords(null)
    } finally {
      setLoading(false)
    }
  }, [params.clusterId, params.namespace, params.set])

  useEffect(() => {
    void load()
  }, [load])

  const binColumns = useMemo(() => {
    const names = new Set<string>()
    for (const r of records ?? []) for (const k of Object.keys(r.bins)) names.add(k)
    return Array.from(names).sort()
  }, [records])

  const filtered = useMemo(() => {
    if (!records) return []
    const q = pkFilter.trim().toLowerCase()
    if (!q) return records
    return records.filter((r) => (r.key.pk ?? "").toLowerCase().includes(q))
  }, [records, pkFilter])

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
        <span className="font-mono text-gray-900 dark:text-gray-50">{params.namespace}</span>
        <span aria-hidden="true">/</span>
        <span className="font-mono text-gray-900 dark:text-gray-50">{params.set}</span>
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
              ? `${filtered.length} of ${records.length} records shown`
              : loading
                ? "Loading…"
                : "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load()} isLoading={loading}>
            Refresh
          </Button>
          <Button variant="primary">New record</Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={pkFilter}
          onChange={(e) => setPkFilter(e.target.value)}
          placeholder="Primary key contains..."
          className="sm:w-72"
        />
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <Card className="p-0">
        <TableRoot>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="sticky left-0 z-10 bg-white dark:bg-[#090E1A]">
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
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && !records ? (
                <RecordSkeleton cols={Math.max(binColumns.length, 4) + 4} />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={binColumns.length + 4}
                    className="py-8 text-center text-sm text-gray-500 dark:text-gray-500"
                  >
                    {records && records.length > 0
                      ? "No records match the filter."
                      : "No records in this set."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
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
                      <Button variant="ghost" className="h-7 px-2 text-xs" asChild>
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

function RecordSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((r) => (
        <TableRow key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <TableCell key={c}>
              <div className="h-3 w-20 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
