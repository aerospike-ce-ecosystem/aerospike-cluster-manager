"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/Button"
import { Checkbox } from "@/components/Checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/Dialog"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { apiPost } from "@/lib/api/client"
import { MAX_QUERY_RECORDS } from "@/lib/constants"
import { useToastStore } from "@/stores/toast-store"

import { getErrorMessage } from "./_utils"

// NOTE(stream-a): no dedicated src/lib/api/sample-data.ts client yet — call
// /api/sample-data/{connId} directly via apiPost. Stream E may introduce a
// typed wrapper later; switch over when that lands.
interface CreateSampleDataRequest {
  namespace: string
  setName?: string
  recordCount?: number
  createIndexes?: boolean
}

interface CreateSampleDataResponse {
  recordsCreated: number
  indexesCreated: string[]
  indexesSkipped: string[]
  elapsedMs: number
}

interface CreateSampleDataDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connId: string
  namespaces: string[]
  onSuccess: () => void
}

export function CreateSampleDataDialog({
  open,
  onOpenChange,
  connId,
  namespaces,
  onSuccess,
}: CreateSampleDataDialogProps) {
  const [namespace, setNamespace] = useState(namespaces[0] ?? "")
  const [setName, setSetName] = useState("sample_set")
  const [recordCount, setRecordCount] = useState("1234")
  const [createIndexes, setCreateIndexes] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (namespaces.length > 0 && !namespaces.includes(namespace)) {
      setNamespace(namespaces[0])
    }
  }, [namespaces, namespace])

  const handleSubmit = async () => {
    if (!namespace) {
      useToastStore.getState().addToast("error", "Namespace is required")
      return
    }
    if (!setName.trim()) {
      useToastStore.getState().addToast("error", "Set name is required")
      return
    }
    const count = parseInt(recordCount, 10)
    if (isNaN(count) || count < 1 || count > MAX_QUERY_RECORDS) {
      useToastStore
        .getState()
        .addToast(
          "error",
          `Record count must be between 1 and ${MAX_QUERY_RECORDS.toLocaleString()}`,
        )
      return
    }

    setLoading(true)
    try {
      const result = await apiPost<CreateSampleDataResponse>(
        `/sample-data/${encodeURIComponent(connId)}`,
        {
          namespace,
          setName: setName.trim(),
          recordCount: count,
          createIndexes,
        } satisfies CreateSampleDataRequest,
        { timeoutMs: 60_000 },
      )

      const parts: string[] = [`${result.recordsCreated} records`]
      if (result.indexesCreated.length > 0) {
        parts.push(`${result.indexesCreated.length} indexes`)
      }
      if (result.indexesSkipped.length > 0) {
        parts.push(`${result.indexesSkipped.length} indexes skipped`)
      }
      const elapsed = (result.elapsedMs / 1000).toFixed(1)
      useToastStore
        .getState()
        .addToast("success", `Created ${parts.join(", ")} in ${elapsed}s`)

      onOpenChange(false)
      onSuccess()
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Sample Data</DialogTitle>
          <DialogDescription>
            Generate sample records with various bin types (Integer, String,
            Double, Boolean, List, Map, GeoJSON) for testing and exploration.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sample-namespace">Namespace</Label>
            <select
              id="sample-namespace"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              className="block w-full appearance-none rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:focus:border-indigo-700 dark:focus:ring-indigo-700/30"
            >
              <option value="">Select namespace</option>
              {namespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sample-set-name">Set Name</Label>
            <Input
              id="sample-set-name"
              placeholder="sample_set"
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sample-record-count">Record Count</Label>
            <Input
              id="sample-record-count"
              type="number"
              placeholder="1234"
              min={1}
              max={MAX_QUERY_RECORDS}
              value={recordCount}
              onChange={(e) => setRecordCount(e.target.value)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              1 ~ {MAX_QUERY_RECORDS.toLocaleString()} records
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="create-indexes"
              checked={createIndexes}
              onCheckedChange={(v) => setCreateIndexes(v === true)}
            />
            <Label
              htmlFor="create-indexes"
              className="cursor-pointer text-sm font-normal"
            >
              Create secondary indexes (5 indexes on
              int/str/double/bool/geojson bins)
            </Label>
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={loading}>
            Create Sample Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
