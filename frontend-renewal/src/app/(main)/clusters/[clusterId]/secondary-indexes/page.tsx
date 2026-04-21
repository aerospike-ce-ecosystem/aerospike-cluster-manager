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
import { listIndexes } from "@/lib/api/indexes"
import type { SecondaryIndex, SecondaryIndexState } from "@/lib/types/index"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Fragment } from "react"

type PageProps = { params: { clusterId: string } }

const stateBadge: Record<
  SecondaryIndexState,
  { variant: "success" | "warning" | "error" }
> = {
  ready: { variant: "success" },
  building: { variant: "warning" },
  error: { variant: "error" },
}

export default function SecondaryIndexesPage({ params }: PageProps) {
  const [indexes, setIndexes] = useState<SecondaryIndex[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listIndexes(params.clusterId)
      setIndexes(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIndexes(null)
    } finally {
      setLoading(false)
    }
  }, [params.clusterId])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const rows = (indexes ?? []).filter((r) =>
      !q ? true : r.name.toLowerCase().includes(q) || r.bin.toLowerCase().includes(q),
    )
    const byNs: Record<string, SecondaryIndex[]> = {}
    for (const r of rows) (byNs[r.namespace] ??= []).push(r)
    return byNs
  }, [indexes, filter])

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">
            Secondary indexes
          </span>
          <h1 className="mt-1 text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
            Secondary indexes
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            Grouped per namespace. Backed by <span className="font-mono">sindex-list</span>.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter indexes..."
            className="sm:w-60"
          />
          <Button variant="secondary" onClick={() => void load()} isLoading={loading}>
            Refresh
          </Button>
          <Button variant="primary">Create index</Button>
        </div>
      </header>

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
                <TableHeaderCell>Index</TableHeaderCell>
                <TableHeaderCell>Set</TableHeaderCell>
                <TableHeaderCell>Bin</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>State</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && !indexes ? (
                <SkeletonRows cols={6} rows={3} />
              ) : Object.keys(grouped).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-gray-500">
                    {indexes && indexes.length > 0
                      ? "No indexes match the filter."
                      : "No secondary indexes defined."}
                  </TableCell>
                </TableRow>
              ) : (
                Object.entries(grouped).map(([ns, rows]) => (
                  <Fragment key={ns}>
                    <TableRow>
                      <TableHeaderCell
                        scope="colgroup"
                        colSpan={6}
                        className="bg-gray-50 py-2 pl-4 font-mono sm:pl-6 dark:bg-gray-900"
                      >
                        {ns}
                        <span className="ml-2 font-sans font-medium text-gray-500 dark:text-gray-400">
                          {rows.length}
                        </span>
                      </TableHeaderCell>
                    </TableRow>
                    {rows.map((r) => {
                      const s = stateBadge[r.state]
                      return (
                        <TableRow key={`${r.namespace}/${r.name}`}>
                          <TableCell>
                            <span className="font-mono font-semibold text-gray-900 dark:text-gray-50">
                              {r.name}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-gray-500 dark:text-gray-400">
                            {r.set || "—"}
                          </TableCell>
                          <TableCell className="font-mono">{r.bin}</TableCell>
                          <TableCell>
                            <Badge variant="neutral">{r.type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={s.variant}>{r.state}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" className="h-7 px-2 text-xs">
                              Drop
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TableRoot>
      </Card>
    </main>
  )
}

function SkeletonRows({ cols, rows }: { cols: number; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
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
