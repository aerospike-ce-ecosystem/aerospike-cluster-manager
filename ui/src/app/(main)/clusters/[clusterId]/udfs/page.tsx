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
import { listUdfs } from "@/lib/api/udfs"
import type { UDFModule } from "@/lib/types/udf"
import { useCallback, useEffect, useMemo, useState } from "react"

type PageProps = { params: { clusterId: string } }

export default function UdfsPage({ params }: PageProps) {
  const [udfs, setUdfs] = useState<UDFModule[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listUdfs(params.clusterId)
      setUdfs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setUdfs(null)
    } finally {
      setLoading(false)
    }
  }, [params.clusterId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (!udfs) return []
    const q = filter.trim().toLowerCase()
    return udfs.filter((u) => !q || u.filename.toLowerCase().includes(q))
  }, [udfs, filter])

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">
            UDFs
          </span>
          <h1 className="mt-1 text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
            User-defined functions
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            Registered Lua modules. Backend does not ship bundled UDFs — users
            manage their own.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter modules..."
            className="sm:w-60"
          />
          <Button
            variant="secondary"
            onClick={() => void load()}
            isLoading={loading}
          >
            Refresh
          </Button>
          <Button variant="primary">Register UDF</Button>
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
                <TableHeaderCell>Module</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Hash</TableHeaderCell>
                <TableHeaderCell className="text-right">
                  Actions
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && !udfs ? (
                [0, 1].map((i) => (
                  <TableRow key={i}>
                    {[0, 1, 2, 3].map((c) => (
                      <TableCell key={c}>
                        <div className="h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-6 text-center text-sm text-gray-500"
                  >
                    {udfs && udfs.length > 0
                      ? "No modules match the filter."
                      : "No UDF modules registered."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((u) => (
                  <TableRow key={u.filename}>
                    <TableCell>
                      <span className="font-mono font-semibold text-gray-900 dark:text-gray-50">
                        {u.filename}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{u.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-500 dark:text-gray-400">
                      {u.hash}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" className="h-7 px-2 text-xs">
                        Remove
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
