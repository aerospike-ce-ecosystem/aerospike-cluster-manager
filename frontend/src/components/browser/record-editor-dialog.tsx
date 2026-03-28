"use client";

import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { RecordMetadataGrid } from "@/components/browser/record-metadata-grid";
import { BinRow } from "@/components/browser/bin-row";
import type { AerospikeRecord, BinEntry } from "@/lib/api/types";

// Re-export bin helpers for backwards compatibility with existing import sites
export {
  parseBinValue,
  detectBinType,
  serializeBinValue,
  createEmptyBinEntry,
  buildBinEntriesFromRecord,
} from "@/lib/bin-utils";
export type { BinEntry } from "@/lib/api/types";

/* ─── Component ──────────────────────────────────────── */

export interface RecordEditorFieldsProps {
  mode: "create" | "edit" | "duplicate";
  pk: string;
  onPKChange: (pk: string) => void;
  ttl: string;
  onTTLChange: (ttl: string) => void;
  bins: BinEntry[];
  onAddBin: () => void;
  onRemoveBin: (id: string) => void;
  onUpdateBin: (id: string, field: keyof BinEntry, val: string) => void;
  useCodeEditor: Record<string, boolean>;
  onToggleCodeEditor: (id: string) => void;
  saving: boolean;
  record?: AerospikeRecord | null;
  namespace?: string;
  setName?: string;
  onSetNameChange?: (setName: string) => void;
}

interface RecordEditorDialogProps extends RecordEditorFieldsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namespace: string;
  set: string;
  onSave: () => void;
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
          <h4 className="text-muted-foreground/60 flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.12em] uppercase">
            Bins
            <span className="bg-border/30 h-px w-8" />
          </h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddBin}
            disabled={saving}
            className="border-base-300/40 text-muted-foreground hover:text-primary hover:border-accent/30 h-6 gap-1 font-mono text-[11px]"
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>

        <div className="divide-base-300/30 divide-y rounded-lg border">
          {/* Header row */}
          <div
            className="bin-row-grid bg-base-200/30 text-muted-foreground/50 font-mono text-[11px] tracking-wider uppercase"
            data-header
          >
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
  );
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
    <Dialog open={open} onOpenChange={onOpenChange} preventClose={saving}>
      <DialogContent className="border-base-300/50 flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[700px]">
        <DialogHeader className="border-base-300/40 space-y-0.5 border-b px-5 pt-5 pb-3">
          <DialogTitle className="font-mono text-sm font-medium">
            {mode === "create"
              ? "New Record"
              : mode === "duplicate"
                ? "Duplicate Record"
                : "Edit Record"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/60 font-mono text-xs">
            {namespace}
            <span className="text-muted-foreground/30 mx-1">.</span>
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

        <div className="border-base-300/40 flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-8 font-mono text-xs"
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving} className="h-8 gap-1.5 font-mono text-xs">
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {mode === "edit" ? "Update" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
