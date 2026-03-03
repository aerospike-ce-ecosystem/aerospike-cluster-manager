"use client";

import { useState, useCallback, useMemo } from "react";
import { Plus, Search, X, Clock, Filter, DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
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
    <div className="border-border/50 space-y-0 border-b px-3 py-2 sm:px-4">
      {/* ── Main filter row ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* PK Lookup toggle */}
        <button
          type="button"
          className={cn(
            "text-muted-foreground hover:text-foreground flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs transition-colors",
            pkExpanded && "bg-base-200/60 text-foreground",
          )}
          onClick={() => setPkExpanded(!pkExpanded)}
          title="Primary Key Lookup"
        >
          <Search className="h-3.5 w-3.5" />
          {!pkExpanded && <span className="hidden sm:inline">PK</span>}
        </button>

        {/* PK Input (expandable) */}
        {pkExpanded && (
          <div className="flex items-center gap-1">
            <Input
              placeholder="Primary key..."
              value={store.primaryKey}
              onChange={(e) => store.setPrimaryKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePKSearch();
                if (e.key === "Escape") setPkExpanded(false);
              }}
              className="h-7 w-[180px] text-xs"
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

        {/* Separator */}
        {pkExpanded && <div className="bg-border/40 mx-0.5 h-4 w-px" />}

        {/* + Add filter */}
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            className={cn(
              "border-border/60 hover:border-border hover:bg-base-200/60 inline-flex h-7 items-center gap-1 rounded-md border border-dashed px-2 text-xs transition-colors",
              "text-muted-foreground hover:text-foreground",
            )}
            title={
              availableBins.length === 0
                ? "No secondary indexes found — create an index to enable filtering"
                : `${availableBins.length} indexed bin(s) available`
            }
          >
            {availableBins.length > 0 ? (
              <Plus className="h-3 w-3" />
            ) : (
              <DatabaseZap className="h-3 w-3" />
            )}
            <span>Add filter</span>
            {availableBins.length > 0 && (
              <span className="bg-accent/10 text-accent rounded-full px-1 text-[10px] font-medium tabular-nums">
                {availableBins.length}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={4}>
            <FilterColumnPicker
              bins={availableBins}
              onSelect={handleAddFilter}
              onClose={() => setPickerOpen(false)}
            />
          </PopoverContent>
        </Popover>

        {/* Active filter chips */}
        {store.conditions.map((cond) => (
          <div key={cond.id} className="relative">
            {editingId === cond.id ? (
              <Popover open={true} onOpenChange={(open) => !open && setEditingId(null)}>
                <PopoverTrigger className="inline-flex">
                  <FilterChip
                    condition={cond}
                    onEdit={handleEditChip}
                    onRemove={handleRemoveChip}
                  />
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={4}>
                  {editingCondition && (
                    <FilterConditionEditor
                      condition={editingCondition}
                      onChange={(updates) => store.updateCondition(editingCondition.id, updates)}
                      onApply={handleEditorApply}
                      onCancel={handleEditorCancel}
                    />
                  )}
                </PopoverContent>
              </Popover>
            ) : (
              <FilterChip condition={cond} onEdit={handleEditChip} onRemove={handleRemoveChip} />
            )}
          </div>
        ))}

        {/* AND/OR toggle */}
        {store.conditions.length >= 2 && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground bg-base-200/40 hover:bg-base-200/70 h-7 rounded-md px-2 text-[10px] font-semibold tracking-wider uppercase transition-colors"
            onClick={() => store.setLogic(store.logic === "and" ? "or" : "and")}
            title={`Switch to ${store.logic === "and" ? "OR" : "AND"} logic`}
          >
            {store.logic}
          </button>
        )}

        {/* Clear all */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            className="text-muted-foreground hover:text-foreground h-7 gap-1 px-2 text-xs"
          >
            <X className="h-3 w-3" />
            <span className="hidden sm:inline">Clear all</span>
          </Button>
        )}

        {/* Stats badge */}
        {showStats && (
          <div className="text-muted-foreground ml-auto hidden items-center gap-2 text-[10px] sm:flex">
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
