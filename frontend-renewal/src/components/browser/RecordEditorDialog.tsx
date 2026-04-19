"use client"

import { RiAddLine } from "@remixicon/react"

import { Button } from "@/components/Button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/Dialog"
import type { AerospikeRecord, BinEntry } from "@/lib/types/record"

import { BinRow } from "./BinRow"
import { RecordMetadataGrid } from "./RecordMetadataGrid"

// Re-export the BinEntry shape so page-level code can keep importing it
// from the dialog module. The value-level helpers
// (buildBinEntriesFromRecord / createEmptyBinEntry / parseBinValue) live
// in `@/lib/bin-utils` — do not re-export them here as types; doing so
// erases them at runtime.
export type { BinEntry } from "@/lib/types/record"

export interface RecordEditorFieldsProps {
  mode: "create" | "edit" | "duplicate"
  pk: string
  onPKChange: (pk: string) => void
  ttl: string
  onTTLChange: (ttl: string) => void
  bins: BinEntry[]
  onAddBin: () => void
  onRemoveBin: (id: string) => void
  onUpdateBin: (id: string, field: keyof BinEntry, val: string) => void
  useCodeEditor: Record<string, boolean>
  onToggleCodeEditor: (id: string) => void
  saving: boolean
  record?: AerospikeRecord | null
  namespace?: string
  setName?: string
  onSetNameChange?: (setName: string) => void
}

interface RecordEditorDialogProps extends RecordEditorFieldsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespace: string
  set: string
  onSave: () => void
}

export function RecordEditorFields({
  mode,
  pk,
  onPKChange,
  ttl,
  onTTLChange,
  bins,
  onAddBin,
  onRemoveBin,
  onUpdateBin,
  useCodeEditor: codeEditorMap,
  onToggleCodeEditor,
  saving,
  record,
  namespace,
  setName,
  onSetNameChange,
}: RecordEditorFieldsProps) {
  return (
    <div className="space-y-5 p-5">
      <RecordMetadataGrid
        record={record}
        mode={mode === "create" ? "create" : "edit"}
        pk={pk}
        onPKChange={onPKChange}
        ttl={ttl}
        onTTLChange={onTTLChange}
        disabled={saving}
        namespace={namespace}
        setName={setName}
        onSetNameChange={onSetNameChange}
      />

      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h4 className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
            Bins
            <span className="h-px w-8 bg-gray-200 dark:bg-gray-800" />
          </h4>
          <Button
            type="button"
            variant="secondary"
            onClick={onAddBin}
            disabled={saving}
            className="h-6 gap-1 px-2 py-0 font-mono text-[11px]"
          >
            <RiAddLine aria-hidden className="size-3" />
            Add
          </Button>
        </div>

        <div className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          <div className="grid grid-cols-[2rem_1fr_6rem_2fr_2rem] items-center gap-2 bg-gray-50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
            <span className="text-right">#</span>
            <span>Name</span>
            <span>Type</span>
            <span>Value</span>
            <span />
          </div>
          {bins.map((bin, i) => (
            <BinRow
              key={bin.id}
              mode="edit"
              index={i + 1}
              bin={bin}
              onUpdate={onUpdateBin}
              onRemove={onRemoveBin}
              canRemove={bins.length > 1}
              useCodeEditor={codeEditorMap[bin.id] ?? false}
              onToggleCodeEditor={onToggleCodeEditor}
              saving={saving}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

export function RecordEditorDialog({
  open,
  onOpenChange,
  mode,
  namespace,
  set,
  pk,
  onPKChange,
  ttl,
  onTTLChange,
  bins,
  onAddBin,
  onRemoveBin,
  onUpdateBin,
  useCodeEditor: codeEditorMap,
  onToggleCodeEditor,
  saving,
  onSave,
}: RecordEditorDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[700px]">
        <DialogHeader className="space-y-0.5 border-b border-gray-200 px-5 pb-3 pt-5 dark:border-gray-800">
          <DialogTitle className="font-mono text-sm font-medium">
            {mode === "create"
              ? "New Record"
              : mode === "duplicate"
                ? "Duplicate Record"
                : "Edit Record"}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-gray-500 dark:text-gray-400">
            {namespace}
            <span className="mx-1 text-gray-400 dark:text-gray-600">.</span>
            {set}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <RecordEditorFields
            mode={mode}
            pk={pk}
            onPKChange={onPKChange}
            ttl={ttl}
            onTTLChange={onTTLChange}
            bins={bins}
            onAddBin={onAddBin}
            onRemoveBin={onRemoveBin}
            onUpdateBin={onUpdateBin}
            useCodeEditor={codeEditorMap}
            onToggleCodeEditor={onToggleCodeEditor}
            saving={saving}
            namespace={namespace}
            setName={set}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-800">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-8 font-mono text-xs"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            isLoading={saving}
            className="h-8 font-mono text-xs"
          >
            {mode === "edit" ? "Update" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
