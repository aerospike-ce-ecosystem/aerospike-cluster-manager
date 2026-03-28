"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Plus, Search, X, Clock, Filter, DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineAlert } from "@/components/common/inline-alert";
import { FilterColumnPicker } from "@/components/browser/filter-column-picker";
import { FilterConditionEditor } from "@/components/browser/filter-condition-editor";
import { FilterChip } from "@/components/browser/filter-chip";
import { useFilterStore } from "@/stores/filter-store";
import type { BinDataType } from "@/lib/api/types";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface FilterToolbarProps {
  connId: string;
  namespace: string;
  set: string;
  availableBins: Array<{ name: string; type: BinDataType }>;
  onExecute: () => void;
  onPKLookup: (pk: string) => void;
  loading?: boolean;
  error?: string | null;
  /** Stats from last filtered query */
  stats?: {
    executionTimeMs: number;
    scannedRecords: number;
    returnedRecords: number;
  };
}

export function FilterToolbar({
  availableBins,
  onExecute,
  onPKLookup,
  loading,
  error,
  stats,
}: FilterToolbarProps) {
  const store = useFilterStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pkExpanded, setPkExpanded] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen]);

  const hasFilters = store.conditions.length > 0;
  const showStats = hasFilters && stats && stats.executionTimeMs > 0;

  const handleAddFilter = useCallback(
    (binName: string, binType: BinDataType) => {
      const cond = store.addCondition(binName, binType);
      setEditingId(cond.id);
    },
    [store],
  );

  const handleEditChip = useCallback((id: string) => {
    setEditingId(id);
  }, []);

  const handleRemoveChip = useCallback(
    (id: string) => {
      store.removeCondition(id);
      if (editingId === id) setEditingId(null);
      // Auto-re-execute when removing a filter
      setTimeout(onExecute, 0);
    },
    [store, editingId, onExecute],
  );

  const handleEditorApply = useCallback(() => {
    setEditingId(null);
    onExecute();
  }, [onExecute]);

  const handleEditorCancel = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleClearAll = useCallback(() => {
    store.clearAll();
    setEditingId(null);
    onExecute();
  }, [store, onExecute]);

  const handlePKSearch = useCallback(() => {
    if (store.primaryKey.trim()) {
      onPKLookup(store.primaryKey.trim());
    }
  }, [store.primaryKey, onPKLookup]);

  const editingCondition = useMemo(
    () => store.conditions.find((c) => c.id === editingId),
    [store.conditions, editingId],
  );

  return (
    <div className="border-base-300/50 shrink-0 space-y-0 border-b px-3 py-2 sm:px-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={cn(
              "text-muted-foreground hover:text-base-content flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs transition-colors",
              pkExpanded && "bg-base-200/60 text-base-content",
            )}
            onClick={() => setPkExpanded(!pkExpanded)}
            title="Primary Key Lookup"
          >
            <Search className="h-3.5 w-3.5" />
            {!pkExpanded && <span className="hidden sm:inline">PK</span>}
          </button>

          {pkExpanded && (
            <div className="flex min-w-[220px] flex-1 items-center gap-1 sm:flex-none">
              <Input
                placeholder="Primary key..."
                value={store.primaryKey}
                onChange={(e) => store.setPrimaryKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePKSearch();
                  if (e.key === "Escape") setPkExpanded(false);
                }}
                className="h-7 min-w-0 flex-1 text-xs sm:w-[220px] sm:flex-none"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={handlePKSearch}
                disabled={loading || !store.primaryKey.trim()}
                className="h-7 px-2"
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {pkExpanded && <div className="bg-border/40 mx-0.5 hidden h-4 w-px sm:block" />}

          <div ref={pickerRef} className="relative">
            <button
              type="button"
              className={cn(
                "border-base-300/60 hover:border-base-300 hover:bg-base-200/60 inline-flex h-7 items-center gap-1 rounded-md border border-dashed px-2 text-xs transition-colors",
                "text-muted-foreground hover:text-base-content",
              )}
              title={
                availableBins.length === 0
                  ? "No secondary indexes found — create an index to enable filtering"
                  : `${availableBins.length} indexed bin(s) available`
              }
              onClick={() => setPickerOpen(!pickerOpen)}
            >
              {availableBins.length > 0 ? (
                <Plus className="h-3 w-3" />
              ) : (
                <DatabaseZap className="h-3 w-3" />
              )}
              <span>Add filter</span>
              {availableBins.length > 0 && (
                <span className="bg-accent/10 text-primary rounded-full px-1 text-[10px] font-medium tabular-nums">
                  {availableBins.length}
                </span>
              )}
            </button>
            {pickerOpen && (
              <div className="bg-base-100 border-base-300 absolute top-full left-0 z-50 mt-1 rounded-lg border shadow-lg">
                <FilterColumnPicker
                  bins={availableBins}
                  onSelect={handleAddFilter}
                  onClose={() => setPickerOpen(false)}
                />
              </div>
            )}
          </div>

          {store.conditions.map((cond) => (
            <div key={cond.id} className="relative">
              {editingId === cond.id ? (
                <div className="relative">
                  <FilterChip
                    condition={cond}
                    onEdit={handleEditChip}
                    onRemove={handleRemoveChip}
                  />
                  <div className="bg-base-100 border-base-300 absolute top-full left-0 z-50 mt-1 rounded-lg border shadow-lg">
                    {editingCondition && (
                      <FilterConditionEditor
                        condition={editingCondition}
                        onChange={(updates) => store.updateCondition(editingCondition.id, updates)}
                        onApply={handleEditorApply}
                        onCancel={handleEditorCancel}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <FilterChip condition={cond} onEdit={handleEditChip} onRemove={handleRemoveChip} />
              )}
            </div>
          ))}

          {store.conditions.length >= 2 && (
            <button
              type="button"
              className="text-muted-foreground hover:text-base-content bg-base-200/40 hover:bg-base-200/70 h-7 rounded-md px-2 text-[10px] font-semibold tracking-wider uppercase transition-colors"
              onClick={() => store.setLogic(store.logic === "and" ? "or" : "and")}
              title={`Switch to ${store.logic === "and" ? "OR" : "AND"} logic`}
            >
              {store.logic}
            </button>
          )}

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-muted-foreground hover:text-base-content h-7 gap-1 px-2 text-xs"
            >
              <X className="h-3 w-3" />
              <span className="hidden sm:inline">Clear all</span>
            </Button>
          )}
        </div>

        {showStats && (
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[10px]">
            <Clock className="h-3 w-3" />
            <span>{stats.executionTimeMs}ms</span>
            <span className="opacity-40">|</span>
            <Filter className="h-3 w-3" />
            <span>
              {formatNumber(stats.returnedRecords)} / {formatNumber(stats.scannedRecords)}
            </span>
          </div>
        )}
      </div>

      {/* ── Error display ──────────────────────────── */}
      <InlineAlert message={error ?? null} className={error ? "mt-2" : ""} />
    </div>
  );
}
