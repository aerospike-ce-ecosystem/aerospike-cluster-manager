"use client"

import {
  RiAddLine,
  RiCloseLine,
  RiDatabase2Line,
  RiFilterLine,
  RiSearchLine,
  RiTimeLine,
} from "@remixicon/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { InlineAlert } from "@/components/common/InlineAlert"
import type { BinDataType } from "@/lib/types/query"
import { cx } from "@/lib/utils"
import { useFilterStore } from "@/stores/filter-store"

import { formatNumber } from "./_utils"
import { FilterChip } from "./FilterChip"
import { FilterColumnPicker } from "./FilterColumnPicker"
import { FilterConditionEditor } from "./FilterConditionEditor"

interface FilterToolbarProps {
  connId: string
  namespace: string
  set: string
  availableBins: Array<{ name: string; type: BinDataType }>
  onExecute: () => void
  onPKLookup: (pk: string) => void
  loading?: boolean
  error?: string | null
  stats?: {
    executionTimeMs: number
    scannedRecords: number
    returnedRecords: number
  }
}

/**
 * Filter toolbar that combines primary-key lookup, indexed-bin filter chips,
 * and AND/OR logic switch. Chip editing is handled by FilterConditionEditor;
 * chip rendering by FilterChip.
 */
export function FilterToolbar({
  availableBins,
  onExecute,
  onPKLookup,
  loading,
  error,
  stats,
}: FilterToolbarProps) {
  const store = useFilterStore()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pkExpanded, setPkExpanded] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pickerOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [pickerOpen])

  const hasFilters = store.conditions.length > 0
  const showStats = hasFilters && stats && stats.executionTimeMs > 0

  const handleAddFilter = useCallback(
    (binName: string, binType: BinDataType) => {
      const cond = store.addCondition(binName, binType)
      setEditingId(cond.id)
    },
    [store],
  )

  const handleEditChip = useCallback((id: string) => {
    setEditingId(id)
  }, [])

  const handleRemoveChip = useCallback(
    (id: string) => {
      store.removeCondition(id)
      if (editingId === id) setEditingId(null)
      setTimeout(onExecute, 0)
    },
    [store, editingId, onExecute],
  )

  const handleEditorApply = useCallback(() => {
    setEditingId(null)
    onExecute()
  }, [onExecute])

  const handleEditorCancel = useCallback(() => {
    setEditingId(null)
  }, [])

  const handleClearAll = useCallback(() => {
    store.clearAll()
    setEditingId(null)
    onExecute()
  }, [store, onExecute])

  const handlePKSearch = useCallback(() => {
    if (store.primaryKey.trim()) {
      onPKLookup(store.primaryKey.trim())
    }
  }, [store, onPKLookup])

  const editingCondition = useMemo(
    () => store.conditions.find((c) => c.id === editingId),
    [store.conditions, editingId],
  )

  return (
    <div className="shrink-0 space-y-0 border-b border-gray-200 px-3 py-2 sm:px-4 dark:border-gray-800">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={cx(
              "flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50",
              pkExpanded &&
                "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50",
            )}
            onClick={() => setPkExpanded(!pkExpanded)}
            title="Primary Key Lookup"
          >
            <RiSearchLine aria-hidden className="size-3.5" />
            {!pkExpanded && <span className="hidden sm:inline">PK</span>}
          </button>

          {pkExpanded && (
            <div className="flex min-w-[220px] flex-1 items-center gap-1 sm:flex-none">
              <Input
                placeholder="Primary key..."
                value={store.primaryKey}
                onChange={(e) => store.setPrimaryKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePKSearch()
                  if (e.key === "Escape") setPkExpanded(false)
                }}
                className="h-7 min-w-0 flex-1 text-xs sm:w-[220px] sm:flex-none"
              />
              <Button
                variant="ghost"
                onClick={handlePKSearch}
                disabled={loading || !store.primaryKey.trim()}
                className="h-7 px-2"
              >
                <RiSearchLine aria-hidden className="size-3.5" />
              </Button>
            </div>
          )}

          {pkExpanded && (
            <div className="mx-0.5 hidden h-4 w-px bg-gray-300 sm:block dark:bg-gray-700" />
          )}

          <div ref={pickerRef} className="relative">
            <button
              type="button"
              className={cx(
                "inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 text-xs text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900",
                "dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-900/50 dark:hover:text-gray-50",
              )}
              title={
                availableBins.length === 0
                  ? "No secondary indexes found — create an index to enable filtering"
                  : `${availableBins.length} indexed bin(s) available`
              }
              onClick={() => setPickerOpen(!pickerOpen)}
            >
              {availableBins.length > 0 ? (
                <RiAddLine aria-hidden className="size-3" />
              ) : (
                <RiDatabase2Line aria-hidden className="size-3" />
              )}
              <span>Add filter</span>
              {availableBins.length > 0 && (
                <span className="rounded-full bg-indigo-100 px-1 text-[10px] font-medium tabular-nums text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-400">
                  {availableBins.length}
                </span>
              )}
            </button>
            {pickerOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-[#090E1A]">
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
                  <div className="absolute left-0 top-full z-50 mt-1 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-[#090E1A]">
                    {editingCondition && (
                      <FilterConditionEditor
                        condition={editingCondition}
                        onChange={(updates) =>
                          store.updateCondition(editingCondition.id, updates)
                        }
                        onApply={handleEditorApply}
                        onCancel={handleEditorCancel}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <FilterChip
                  condition={cond}
                  onEdit={handleEditChip}
                  onRemove={handleRemoveChip}
                />
              )}
            </div>
          ))}

          {store.conditions.length >= 2 && (
            <button
              type="button"
              className="h-7 rounded-md bg-gray-100 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-800/60 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50"
              onClick={() =>
                store.setLogic(store.logic === "and" ? "or" : "and")
              }
              title={`Switch to ${store.logic === "and" ? "OR" : "AND"} logic`}
            >
              {store.logic}
            </button>
          )}

          {hasFilters && (
            <Button
              variant="ghost"
              onClick={handleClearAll}
              className="h-7 gap-1 px-2 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
            >
              <RiCloseLine aria-hidden className="size-3" />
              <span className="hidden sm:inline">Clear all</span>
            </Button>
          )}
        </div>

        {showStats && stats && (
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
            <RiTimeLine aria-hidden className="size-3" />
            <span>{stats.executionTimeMs}ms</span>
            <span className="opacity-40">|</span>
            <RiFilterLine aria-hidden className="size-3" />
            <span>
              {formatNumber(stats.returnedRecords)} /{" "}
              {formatNumber(stats.scannedRecords)}
            </span>
          </div>
        )}
      </div>

      <InlineAlert message={error ?? null} className={error ? "mt-2" : ""} />
    </div>
  )
}
