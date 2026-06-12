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
import type { BinValue, PkType } from "@/lib/types/record"
import { validateBinName } from "@/lib/validation"

/**
 * Create a new record in (namespace, set). Mirrors the seed-record half of
 * ``CreateSetDialog`` (the set and namespace are already known here, so the
 * dialog only collects the primary key and one bin to seed). After a
 * successful write, ``onSuccess`` fires with the resolved primary key so the
 * caller can navigate to the record detail page where additional bins can
 * be added or edited.
 *
 * Single seed bin is intentional: multi-bin authoring lives in the record
 * detail editor (BinDraft), which already supports add/remove with type
 * selection. Re-implementing it inside the dialog would duplicate ~150
 * lines of state and validation for a marginal UX win.
 */

type SeedBinKind = "string" | "int" | "double" | "bool"

const BIN_KINDS: ReadonlyArray<{ value: SeedBinKind; label: string }> = [
  { value: "string", label: "String" },
  { value: "int", label: "Integer" },
  { value: "double", label: "Double" },
  { value: "bool", label: "Boolean (true/false)" },
]

const PK_TYPES: ReadonlyArray<{ value: PkType; label: string }> = [
  { value: "auto", label: "auto (digit-only → INTEGER)" },
  { value: "string", label: "String" },
  { value: "int", label: "Integer" },
  { value: "bytes", label: "Bytes (hex)" },
]

const SELECT_CLASSES =
  "h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-primary-45 focus:outline-hidden focus:ring-1 focus:ring-primary-45 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"

interface CreateRecordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connId: string
  namespace: string
  set: string
  /** Called after a successful write; receives the resolved primary key. */
  onSuccess?: (pk: string) => void
}

function parseSeedBinValue(
  raw: string,
  kind: SeedBinKind,
): { ok: true; value: BinValue } | { ok: false; error: string } {
  switch (kind) {
    case "string":
      return { ok: true, value: raw }
    case "int": {
      if (!/^-?\d+$/.test(raw.trim())) {
        return { ok: false, error: "Bin value must be an integer." }
      }
      const n = Number.parseInt(raw.trim(), 10)
      if (!Number.isFinite(n)) {
        return { ok: false, error: "Bin value out of range for integer." }
      }
      return { ok: true, value: n }
    }
    case "double": {
      const n = Number.parseFloat(raw.trim())
      if (!Number.isFinite(n)) {
        return { ok: false, error: "Bin value must be a number." }
      }
      return { ok: true, value: n }
    }
    case "bool": {
      const v = raw.trim().toLowerCase()
      if (v === "true") return { ok: true, value: true }
      if (v === "false") return { ok: true, value: false }
      return { ok: false, error: 'Bin value must be "true" or "false".' }
    }
  }
}

export function CreateRecordDialog({
  open,
  onOpenChange,
  connId,
  namespace,
  set,
  onSuccess,
}: CreateRecordDialogProps) {
  const [pk, setPk] = React.useState("")
  const [pkType, setPkType] = React.useState<PkType>("auto")
  const [binName, setBinName] = React.useState("value")
  const [binKind, setBinKind] = React.useState<SeedBinKind>("string")
  const [binValue, setBinValue] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    // Reset on each open so a previously-aborted draft doesn't leak in.
    setPk("")
    setPkType("auto")
    setBinName("value")
    setBinKind("string")
    setBinValue("")
    setError(null)
  }, [open])

  const handleSubmit = async () => {
    setError(null)
    const primaryKey = pk.trim()
    if (!primaryKey) return setError("Primary key is required.")
    const bin = binName
    const binError = validateBinName(bin)
    if (binError) return setError(binError)

    const parsed = parseSeedBinValue(binValue, binKind)
    if (!parsed.ok) return setError(parsed.error)

    setLoading(true)
    try {
      await putRecord(connId, {
        key: { namespace, set, pk: primaryKey },
        bins: { [bin]: parsed.value },
        pkType,
      })
      onOpenChange(false)
      onSuccess?.(primaryKey)
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail || err.message)
      else if (err instanceof Error) setError(err.message)
      else setError("Failed to create record.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            New record in {namespace}.{set}
          </DialogTitle>
          <DialogDescription>
            Enter a primary key and one seed bin. Add more bins on the record
            detail page after this dialog closes.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4 py-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cr-pk">Primary key</Label>
              <Input
                id="cr-pk"
                value={pk}
                onChange={(e) => setPk(e.target.value)}
                placeholder="record-1"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cr-pk-type">Key type</Label>
              <select
                id="cr-pk-type"
                className={SELECT_CLASSES}
                value={pkType}
                onChange={(e) => setPkType(e.target.value as PkType)}
              >
                {PK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cr-bin-name">Bin name</Label>
              <Input
                id="cr-bin-name"
                value={binName}
                onChange={(e) => setBinName(e.target.value)}
                placeholder="value"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cr-bin-kind">Bin type</Label>
              <select
                id="cr-bin-kind"
                className={SELECT_CLASSES}
                value={binKind}
                onChange={(e) => setBinKind(e.target.value as SeedBinKind)}
              >
                {BIN_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cr-bin-value">Bin value</Label>
            <Input
              id="cr-bin-value"
              value={binValue}
              onChange={(e) => setBinValue(e.target.value)}
              placeholder={
                binKind === "bool"
                  ? "true / false"
                  : binKind === "int"
                    ? "42"
                    : binKind === "double"
                      ? "3.14"
                      : "hello"
              }
            />
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
            Create Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
