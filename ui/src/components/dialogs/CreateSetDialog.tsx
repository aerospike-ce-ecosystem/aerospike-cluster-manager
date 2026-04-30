"use client"

import React from "react"

import { Button } from "@/components/Button"
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
import { ApiError } from "@/lib/api/client"
import { putRecord } from "@/lib/api/records"

/**
 * Aerospike sets are created implicitly when a record with a new `set` value is written.
 * This dialog collects the set name and a seed record (primary key + one bin) and POSTs
 * it through the normal record write endpoint — after the write completes, the set exists
 * and the user returns to the set list with a refreshed cluster view.
 */
interface CreateSetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connId: string
  namespace: string
  onSuccess?: (setName: string) => void
}

export function CreateSetDialog({
  open,
  onOpenChange,
  connId,
  namespace,
  onSuccess,
}: CreateSetDialogProps) {
  const [setName, setSetName] = React.useState("")
  const [pk, setPk] = React.useState("")
  const [binName, setBinName] = React.useState("value")
  const [binValue, setBinValue] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setSetName("")
    setPk("")
    setBinName("value")
    setBinValue("")
    setError(null)
  }, [open])

  const handleSubmit = async () => {
    setError(null)
    const set = setName.trim()
    if (!set) return setError("Set name is required")
    const primaryKey = pk.trim()
    if (!primaryKey) return setError("Primary key is required")
    const bin = binName.trim()
    if (!bin) return setError("Bin name is required")

    setLoading(true)
    try {
      await putRecord(connId, {
        key: { namespace, set, pk: primaryKey },
        bins: { [bin]: binValue },
      })
      onOpenChange(false)
      onSuccess?.(set)
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail || err.message)
      else if (err instanceof Error) setError(err.message)
      else setError("Failed to create set")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create set in {namespace}</DialogTitle>
          <DialogDescription>
            Aerospike creates sets implicitly when the first record is written.
            Provide a set name and a seed record below — the set will appear
            after the write succeeds.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-name">Set Name</Label>
            <Input
              id="cs-name"
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              placeholder="my_set"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-pk">Primary Key (for the seed record)</Label>
            <Input
              id="cs-pk"
              value={pk}
              onChange={(e) => setPk(e.target.value)}
              placeholder="record-1"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cs-bin-name">Bin Name</Label>
              <Input
                id="cs-bin-name"
                value={binName}
                onChange={(e) => setBinName(e.target.value)}
                placeholder="value"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cs-bin-value">Bin Value</Label>
              <Input
                id="cs-bin-value"
                value={binValue}
                onChange={(e) => setBinValue(e.target.value)}
                placeholder="hello"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            isLoading={loading}
            loadingText="Creating…"
          >
            Create Set
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
