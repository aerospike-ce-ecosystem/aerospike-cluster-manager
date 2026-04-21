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
import { listK8sTemplates } from "@/lib/api/k8s"
import type { K8sTemplateSummary } from "@/lib/types/k8s"
import { useCallback, useEffect, useState } from "react"

export default function AckoTemplatesPage() {
  const [templates, setTemplates] = useState<K8sTemplateSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listK8sTemplates()
      setTemplates(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setTemplates(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">
            ACKO
          </span>
          <h1 className="mt-1 text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
            Cluster templates
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            AerospikeClusterTemplate CRs — reusable shapes for creating clusters via ACKO.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load()} isLoading={loading}>
            Refresh
          </Button>
          <Button variant="primary">New template</Button>
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
                <TableHeaderCell>Template</TableHeaderCell>
                <TableHeaderCell className="text-right">Nodes</TableHeaderCell>
                <TableHeaderCell>Image</TableHeaderCell>
                <TableHeaderCell>Used by</TableHeaderCell>
                <TableHeaderCell>Age</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && !templates ? (
                [0, 1].map((i) => (
                  <TableRow key={i}>
                    {[0, 1, 2, 3, 4, 5].map((c) => (
                      <TableCell key={c}>
                        <div className="h-3 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !templates || templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-gray-500">
                    No AerospikeClusterTemplates defined.
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell>
                      <span className="font-mono font-semibold text-gray-900 dark:text-gray-50">
                        {t.name}
                      </span>
                      {t.description && (
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {t.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.size ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{t.image ?? "—"}</TableCell>
                    <TableCell>
                      {t.usedBy.length === 0 ? (
                        <span className="text-gray-500">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {t.usedBy.map((c) => (
                            <Badge key={c} variant="neutral">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-500">
                      {t.age ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" className="h-7 px-2 text-xs">
                        Edit
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
