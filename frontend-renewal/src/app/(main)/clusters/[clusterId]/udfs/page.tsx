"use client"

import {
  RiAddLine,
  RiCodeSSlashLine,
  RiDeleteBin2Line,
  RiEyeLine,
  RiRefreshLine,
  RiUploadCloud2Line,
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
import { RegisterUdfDialog } from "@/components/dialogs/RegisterUdfDialog"
import { ApiError } from "@/lib/api/client"
import { listUdfs, removeUdf } from "@/lib/api/udfs"
import type { UDFModule } from "@/lib/types/udf"
import { useToastStore } from "@/stores/toast-store"

// NOTE(stream-b): inline helper until Stream E publishes shared formatters.
function truncateMiddle(str: string, max = 24): string {
  if (!str || str.length <= max) return str
  const half = Math.floor((max - 1) / 2)
  return `${str.slice(0, half)}…${str.slice(-half)}`
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail || err.message
  if (err instanceof Error) return err.message
  return String(err)
}

type PageProps = { params: { clusterId: string } }

export default function UdfsPage({ params }: PageProps) {
  const { clusterId } = params

  const [udfs, setUdfs] = useState<UDFModule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")

  // Dialog state
  const [registerOpen, setRegisterOpen] = useState(false)
  const [viewSource, setViewSource] = useState<UDFModule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UDFModule | null>(null)
  const [deleting, setDeleting] = useState(false)

  const toast = useToastStore((s) => s.addToast)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listUdfs(clusterId)
      setUdfs(data)
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
    if (!q) return udfs
    return udfs.filter((u) => u.filename.toLowerCase().includes(q))
  }, [udfs, filter])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await removeUdf(clusterId, deleteTarget.filename)
      toast("success", `UDF "${deleteTarget.filename}" deleted`)
      setDeleteTarget(null)
      await load()
    } catch (err) {
      toast("error", errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  // Upload an existing .lua file by reading it into the Register dialog form.
  // The dialog handles POST /api/udfs/{conn} itself.
  const handleUploadFile = useCallback(() => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".lua"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        // Register via API directly so we don't duplicate dialog state.
        const { uploadUdf } = await import("@/lib/api/udfs")
        await uploadUdf(clusterId, { filename: file.name, content: text })
        toast("success", `UDF "${file.name}" uploaded`)
        await load()
      } catch (err) {
        toast("error", errorMessage(err))
      }
    }
    input.click()
  }, [clusterId, load, toast])

  const columns = useMemo<ColumnDef<UDFModule>[]>(
    () => [
      {
        accessorKey: "filename",
        header: "Filename",
        cell: ({ getValue }) => (
          <span className="font-mono font-semibold text-gray-900 dark:text-gray-50">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        size: 100,
        cell: ({ getValue }) => (
          <Badge variant="neutral">{getValue() as string}</Badge>
        ),
      },
      {
        accessorKey: "hash",
        header: "Hash",
        cell: ({ getValue }) => (
          <span
            className="font-mono text-xs text-gray-500 dark:text-gray-400"
            title={getValue() as string}
          >
            {truncateMiddle(getValue() as string, 24)}
          </span>
        ),
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
              aria-label={`View source of ${row.original.filename}`}
              onClick={() => setViewSource(row.original)}
            >
              <RiEyeLine className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              className="size-8 p-0 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              aria-label={`Delete UDF ${row.original.filename}`}
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
        title="UDF modules"
        description="Registered Lua user-defined functions. Upload a new module or inspect existing source."
        actions={
          <>
            <Input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter modules..."
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
            <Button variant="secondary" onClick={handleUploadFile}>
              <RiUploadCloud2Line className="mr-2 size-4" aria-hidden="true" />
              Upload file
            </Button>
            <Button variant="primary" onClick={() => setRegisterOpen(true)}>
              <RiAddLine className="mr-2 size-4" aria-hidden="true" />
              Register UDF
            </Button>
          </>
        }
      />

      <InlineAlert message={error} />

      <Card className="p-0">
        <DataTable
          data={filtered}
          columns={columns}
          loading={loading}
          emptyState={
            <EmptyState
              icon={RiCodeSSlashLine}
              title={
                udfs.length === 0 ? "No UDF modules" : "No matching modules"
              }
              description={
                udfs.length === 0
                  ? "Upload a Lua script to register a User-Defined Function."
                  : "Try a different filter or clear the search."
              }
              action={
                udfs.length === 0 ? (
                  <Button
                    variant="primary"
                    onClick={() => setRegisterOpen(true)}
                  >
                    <RiAddLine className="mr-2 size-4" aria-hidden="true" />
                    Register UDF
                  </Button>
                ) : undefined
              }
            />
          }
          testId="udfs-table"
        />
      </Card>

      <RegisterUdfDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onSuccess={() => void load()}
        connId={clusterId}
      />

      <Dialog
        open={!!viewSource}
        onOpenChange={(open) => !open && setViewSource(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewSource?.filename}</DialogTitle>
            <DialogDescription>
              Read-only source of the registered UDF module.
            </DialogDescription>
          </DialogHeader>
          {/* FIXME(stream-b): upgrade to a syntax-highlighted code editor later. */}
          <pre className="mt-2 max-h-[60vh] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200">
            {viewSource?.content ?? "-- Source not available from server."}
          </pre>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete UDF"
        description={`Delete "${deleteTarget?.filename}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </main>
  )
}
