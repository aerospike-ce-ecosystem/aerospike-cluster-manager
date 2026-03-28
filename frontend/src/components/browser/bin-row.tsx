"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { JsonViewer } from "@/components/common/json-viewer";
import { LazyCodeEditor as CodeEditor } from "@/components/common/code-editor-lazy";
import { BinTypeBadge } from "@/components/browser/bin-type-badge";
import { BIN_TYPES, BIN_TYPE_BORDER_COLORS, type BinType } from "@/lib/constants";
import type { BinValue, BinEntry } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/* ─── View mode helpers ───────────────────────────── */

function isComplex(value: BinValue): boolean {
  return value !== null && typeof value === "object";
}

function complexSummary(value: BinValue, type: BinType): string {
  if (type === "geojson") {
    const obj = value as Record<string, unknown>;
    return String(obj.type ?? "GeoJSON");
  }
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === "object" && value !== null) return `{${Object.keys(value).length} keys}`;
  return "";
}

function PrimitiveValue({ value, type }: { value: BinValue; type: BinType }) {
  if (type === "string") return <span className="text-success">&quot;{String(value)}&quot;</span>;
  if (type === "integer" || type === "float")
    return <span className="text-info metric-value">{String(value)}</span>;
  if (type === "bool") {
    const b = Boolean(value);
    return (
      <span className={b ? "text-success" : "text-error"}>
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />
        {String(b)}
      </span>
    );
  }
  return <span className="text-muted-foreground">{String(value)}</span>;
}

/* ─── ViewBinRow ──────────────────────────────────── */

interface ViewBinRowProps {
  index: number;
  name: string;
  type: BinType;
  value: BinValue;
}

function ViewBinRow({ index, name, type, value }: ViewBinRowProps) {
  const [expanded, setExpanded] = useState(false);
  const complex = isComplex(value);

  return (
    <div className={cn("border-l-2", BIN_TYPE_BORDER_COLORS[type])}>
      <div className="bin-row-grid">
        {/* index */}
        <span className="grid-row-num text-right">#{index}</span>
        {/* name */}
        <span className="truncate font-mono text-[13px] font-semibold">{name}</span>
        {/* type badge */}
        <BinTypeBadge type={type} />
        {/* value */}
        <div className="min-w-0 font-mono text-[13px]">
          {complex ? (
            <button
              type="button"
              className="hover:text-primary flex items-center gap-1 transition-colors"
              onClick={() => setExpanded((p) => !p)}
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" />
              )}
              <span className="text-muted-foreground text-xs">{complexSummary(value, type)}</span>
            </button>
          ) : (
            <PrimitiveValue value={value} type={type} />
          )}
        </div>
        {/* spacer for grid alignment */}
        <div />
      </div>
      {complex && expanded && (
        <div className="border-base-300/30 mx-3 mb-2 max-h-[300px] overflow-auto rounded-md border p-2">
          <JsonViewer data={value} />
        </div>
      )}
    </div>
  );
}

/* ─── EditBinRow ──────────────────────────────────── */

interface EditBinRowProps {
  index: number;
  bin: BinEntry;
  onUpdate: (id: string, field: keyof BinEntry, val: string) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
  useCodeEditor: boolean;
  onToggleCodeEditor: (id: string) => void;
  saving: boolean;
}

function EditBinRow({
  index,
  bin,
  onUpdate,
  onRemove,
  canRemove,
  useCodeEditor: showCode,
  onToggleCodeEditor,
  saving,
}: EditBinRowProps) {
  const isComplexType = ["list", "map", "geojson"].includes(bin.type);

  return (
    <div className={cn("border-l-2", BIN_TYPE_BORDER_COLORS[bin.type])}>
      <div className="bin-row-grid">
        {/* index */}
        <span className="grid-row-num text-right">#{index}</span>
        {/* name input */}
        <Input
          placeholder="Bin name"
          value={bin.name}
          onChange={(e) => onUpdate(bin.id, "name", e.target.value)}
          disabled={saving}
          className="border-base-300/40 h-7 font-mono text-xs"
        />
        {/* type select */}
        <Select
          value={bin.type}
          onChange={(e) => onUpdate(bin.id, "type", e.target.value)}
          className="border-base-300/40 h-7 font-mono text-[11px]"
          disabled={saving}
        >
          {BIN_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        {/* value input */}
        <div className="min-w-0">
          {isComplexType && showCode ? (
            <div className="border-base-300/40 h-[160px] overflow-hidden rounded-md border">
              <CodeEditor
                value={bin.value}
                onChange={(v) => onUpdate(bin.id, "value", v)}
                language="json"
                height="160px"
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
              onChange={(e) => onUpdate(bin.id, "value", e.target.value)}
              disabled={saving}
              className="border-base-300/40 h-7 font-mono text-xs"
            />
          )}
          {isComplexType && (
            <button
              type="button"
              className="text-muted-foreground/60 hover:text-primary mt-1 font-mono text-[10px] transition-colors disabled:pointer-events-none disabled:opacity-50"
              onClick={() => onToggleCodeEditor(bin.id)}
              disabled={saving}
            >
              {showCode ? "↩ simple input" : "⌨ code editor"}
            </button>
          )}
        </div>
        {/* delete */}
        <div>
          {canRemove && (
            <button
              type="button"
              className="text-muted-foreground/50 hover:text-error hover:bg-error/10 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50"
              onClick={() => onRemove(bin.id)}
              disabled={saving}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── BinRow (unified export) ─────────────────────── */

export type { ViewBinRowProps, EditBinRowProps };

export function BinRow(
  props: ({ mode: "view" } & ViewBinRowProps) | ({ mode: "edit" } & EditBinRowProps),
) {
  if (props.mode === "view") {
    const { mode: _, ...rest } = props;
    return <ViewBinRow {...rest} />;
  }
  const { mode: _, ...rest } = props;
  return <EditBinRow {...rest} />;
}
