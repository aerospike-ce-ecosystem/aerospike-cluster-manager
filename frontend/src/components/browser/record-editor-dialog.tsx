"use client";

import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

import { LazyCodeEditor as CodeEditor } from "@/components/common/code-editor-lazy";
import type { AerospikeRecord, BinValue, BinEntry } from "@/lib/api/types";
export type { BinEntry } from "@/lib/api/types";
import { BIN_TYPES, type BinType } from "@/lib/constants";
import { cn } from "@/lib/utils";

/* ─── Helpers ────────────────────────────────────────── */

export function parseBinValue(value: string, type: BinType): BinValue {
  switch (type) {
    case "integer": {
      const n = parseInt(value, 10);
      return isNaN(n) ? 0 : n;
    }
    case "float": {
      const f = parseFloat(value);
      return isNaN(f) ? 0 : f;
    }
    case "bool":
      return value.toLowerCase() === "true";
    case "list":
    case "map":
    case "geojson":
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    case "bytes":
      return value;
    default:
      return value;
  }
}

export function detectBinType(value: BinValue | undefined): BinType {
  if (value === null || value === undefined) return "string";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "float";
  if (Array.isArray(value)) return "list";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("type" in obj && "coordinates" in obj) return "geojson";
    return "map";
  }
  return "string";
}

export function serializeBinValue(value: BinValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function createEmptyBinEntry(): BinEntry {
  return { id: crypto.randomUUID(), name: "", value: "", type: "string" };
}

export function buildBinEntriesFromRecord(record: AerospikeRecord): BinEntry[] {
  return Object.entries(record.bins).map(([name, value]) => ({
    id: crypto.randomUUID(),
    name,
    value: serializeBinValue(value),
    type: detectBinType(value),
  }));
}

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
}: RecordEditorFieldsProps) {
  const typeAccent: Record<string, string> = {
    string: "border-l-foreground/15",
    integer: "border-l-accent/60",
    float: "border-l-accent/60",
    bool: "border-l-success/60",
    list: "border-l-chart-2/60",
    map: "border-l-chart-4/60",
    bytes: "border-l-muted-foreground/30",
    geojson: "border-l-chart-4/60",
  };

  return (
    <div className="space-y-5 p-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground/60 font-mono text-[11px] tracking-wider uppercase">
            Primary Key
          </Label>
          <Input
            placeholder="Record key"
            value={pk}
            onChange={(e) => onPKChange(e.target.value)}
            disabled={mode === "edit" || saving}
            className="border-base-300/50 focus-visible:ring-accent/30 h-9 font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground/60 font-mono text-[11px] tracking-wider uppercase">
            TTL (seconds)
          </Label>
          <Input
            type="number"
            placeholder="0 = default"
            value={ttl}
            onChange={(e) => onTTLChange(e.target.value)}
            disabled={saving}
            className="border-base-300/50 focus-visible:ring-accent/30 h-9 font-mono text-sm"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground/60 font-mono text-[11px] tracking-wider uppercase">
            Bins
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddBin}
            disabled={saving}
            className="border-base-300/40 text-muted-foreground hover:text-accent hover:border-accent/30 h-6 gap-1 font-mono text-[11px]"
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>

        {bins.map((bin) => {
          const isComplex = ["list", "map", "geojson"].includes(bin.type);
          const showCode = codeEditorMap[bin.id];
          return (
            <div
              key={bin.id}
              className={cn(
                "border-base-300/40 hover:border-base-300/60 space-y-2.5 rounded-md border border-l-2 p-3 transition-colors",
                typeAccent[bin.type] || "border-l-border",
              )}
            >
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Bin name"
                  value={bin.name}
                  onChange={(e) => onUpdateBin(bin.id, "name", e.target.value)}
                  disabled={saving}
                  className="border-base-300/40 h-8 flex-1 font-mono text-sm"
                />
                <Select
                  value={bin.type}
                  onChange={(e) => onUpdateBin(bin.id, "type", e.target.value)}
                  className="border-base-300/40 h-8 w-[110px] font-mono text-xs"
                  disabled={saving}
                >
                  {BIN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
                {bins.length > 1 && (
                  <button
                    type="button"
                    className="text-muted-foreground/50 hover:text-error hover:bg-error/10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => onRemoveBin(bin.id)}
                    disabled={saving}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {isComplex && (
                <button
                  type="button"
                  className="text-muted-foreground/60 hover:text-accent font-mono text-[11px] transition-colors disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => onToggleCodeEditor(bin.id)}
                  disabled={saving}
                >
                  {showCode ? "↩ simple input" : "⌨ code editor"}
                </button>
              )}

              {isComplex && showCode ? (
                <div className="border-base-300/40 h-[200px] overflow-hidden rounded-md border">
                  <CodeEditor
                    value={bin.value}
                    onChange={(v) => onUpdateBin(bin.id, "value", v)}
                    language="json"
                    height="200px"
                  />
                </div>
              ) : (
                <Input
                  placeholder={
                    bin.type === "bool"
                      ? "true / false"
                      : bin.type === "integer" || bin.type === "float"
                        ? "0"
                        : "Value"
                  }
                  value={bin.value}
                  onChange={(e) => onUpdateBin(bin.id, "value", e.target.value)}
                  disabled={saving}
                  className="border-base-300/40 h-8 font-mono text-sm"
                />
              )}
            </div>
          );
        })}
      </div>
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
