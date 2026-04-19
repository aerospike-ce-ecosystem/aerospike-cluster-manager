"use client"

import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiCloseLine,
  RiEqualizerLine,
  RiPlayLine,
  RiSearchLine,
} from "@remixicon/react"
import { useCallback, useMemo, useState } from "react"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Checkbox } from "@/components/Checkbox"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { InlineAlert } from "@/components/common/InlineAlert"
import { MAX_QUERY_RECORDS } from "@/lib/constants"
import type { QueryPredicateOperator } from "@/lib/types/query"
import { useQueryStore } from "@/stores/query-store"
import { useToastStore } from "@/stores/toast-store"

export type ViewMode = "browse" | "query" | "pk"

const OPERATORS: { value: QueryPredicateOperator; label: string }[] = [
  { value: "equals", label: "Equals" },
  { value: "between", label: "Between" },
  { value: "contains", label: "Contains" },
  { value: "geo_within_region", label: "Geo Within Region" },
  { value: "geo_contains_point", label: "Geo Contains Point" },
]

const MODE_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "browse", label: "Scan All" },
  { value: "query", label: "Index Query" },
  { value: "pk", label: "PK Lookup" },
]

interface QueryToolbarProps {
  connId: string
  namespace: string
  set: string
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onQueryExecuted: () => void
}

/**
 * Alternative toolbar for running ad-hoc queries (scan / index query / PK
 * lookup). Rendered separately from FilterToolbar because those share no
 * state and target a different backend endpoint (/api/query vs
 * /api/records/filter).
 */
export function QueryToolbar({
  connId,
  namespace,
  set,
  viewMode,
  onViewModeChange,
  onQueryExecuted,
}: QueryToolbarProps) {
  const store = useQueryStore()

  const [predBin, setPredBin] = useState("")
  const [predOp, setPredOp] = useState<QueryPredicateOperator>("equals")
  const [predValue, setPredValue] = useState("")
  const [predValue2, setPredValue2] = useState("")
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const knownBins = useMemo(() => {
    const names = new Set<string>()
    store.results.forEach((r) =>
      Object.keys(r.bins).forEach((b) => names.add(b)),
    )
    return Array.from(names).sort()
  }, [store.results])

  const toggleBin = useCallback(
    (bin: string) => {
      const current = store.selectBins
      if (current.includes(bin)) {
        store.setSelectBins(current.filter((b) => b !== bin))
      } else {
        store.setSelectBins([...current, bin])
      }
    },
    [store],
  )

  const handleClear = useCallback(() => {
    setPredBin("")
    setPredOp("equals")
    setPredValue("")
    setPredValue2("")
    setAdvancedOpen(false)
    store.setPrimaryKey("")
    onViewModeChange("browse")
  }, [store, onViewModeChange])

  const handleExecute = useCallback(async () => {
    if (viewMode === "pk") {
      if (!store.primaryKey.trim()) {
        useToastStore.getState().addToast("error", "Primary key is required")
        return
      }
      store.setNamespace(namespace)
      store.setSet(set)
      store.setPredicate(null)
    } else if (viewMode === "query") {
      if (!predBin.trim()) {
        useToastStore.getState().addToast("error", "Predicate bin is required")
        return
      }
      store.setNamespace(namespace)
      store.setSet(set)
      store.setPredicate({
        bin: predBin.trim(),
        operator: predOp,
        value: predValue,
        value2: predOp === "between" ? predValue2 : undefined,
      })
    }
    await store.executeQuery(connId)
    onQueryExecuted()
  }, [
    connId,
    namespace,
    set,
    viewMode,
    store,
    predBin,
    predOp,
    predValue,
    predValue2,
    onQueryExecuted,
  ])

  const showClear = viewMode !== "browse"
  const showBadge = viewMode !== "browse" && store.hasExecuted

  return (
    <div className="space-y-0 border-b border-gray-200 bg-white/60 px-3 py-2 sm:px-6 dark:border-gray-800 dark:bg-gray-950/40">
      <div className="flex flex-wrap items-center gap-2">
        <RiEqualizerLine
          aria-hidden
          className="size-4 shrink-0 text-gray-500"
        />

        <select
          value={viewMode}
          onChange={(e) => onViewModeChange(e.target.value as ViewMode)}
          className="block h-8 w-[140px] appearance-none rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:focus:border-indigo-700 dark:focus:ring-indigo-700/30"
          data-testid="filter-mode-select"
        >
          {MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {viewMode === "pk" && (
          <>
            <Input
              placeholder="Primary key..."
              value={store.primaryKey}
              onChange={(e) => store.setPrimaryKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleExecute()}
              className="h-8 min-w-[160px] max-w-[320px] flex-1 text-xs"
            />
            <Button
              onClick={handleExecute}
              disabled={store.loading}
              isLoading={store.loading}
              className="h-8"
            >
              <RiSearchLine aria-hidden className="mr-1.5 size-3.5" />
              Search
            </Button>
          </>
        )}

        {viewMode === "query" && (
          <>
            <Input
              placeholder="bin_name"
              value={predBin}
              onChange={(e) => setPredBin(e.target.value)}
              className="h-8 w-[120px] text-xs"
            />
            <select
              value={predOp}
              onChange={(e) =>
                setPredOp(e.target.value as QueryPredicateOperator)
              }
              className="block h-8 w-[130px] appearance-none rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:focus:border-indigo-700 dark:focus:ring-indigo-700/30"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            <Input
              placeholder="value"
              value={predValue}
              onChange={(e) => setPredValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleExecute()}
              className="h-8 w-[120px] text-xs"
            />
            {predOp === "between" && (
              <Input
                placeholder="upper bound"
                value={predValue2}
                onChange={(e) => setPredValue2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleExecute()}
                className="h-8 w-[120px] text-xs"
              />
            )}
            <Button
              onClick={handleExecute}
              disabled={store.loading}
              isLoading={store.loading}
              className="h-8"
            >
              <RiPlayLine aria-hidden className="mr-1.5 size-3.5" />
              Execute
            </Button>
          </>
        )}

        {showClear && (
          <Button
            variant="ghost"
            onClick={handleClear}
            className="h-8 gap-1 px-2 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
          >
            <RiCloseLine aria-hidden className="size-3.5" />
            Clear
          </Button>
        )}

        {showBadge && (
          <Badge variant="default" className="text-[10px]">
            {store.returnedRecords} result
            {store.returnedRecords !== 1 ? "s" : ""}
          </Badge>
        )}

        {viewMode === "query" && (
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="ml-auto flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
          >
            {advancedOpen ? (
              <RiArrowUpSLine aria-hidden className="size-3" />
            ) : (
              <RiArrowDownSLine aria-hidden className="size-3" />
            )}
            Advanced
          </button>
        )}
      </div>

      {viewMode === "query" && advancedOpen && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="expression-filter">Expression Filter</Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Raw JSON filter expression
            </p>
            {/* FIXME(stream-a): upgrade to code editor later — textarea for now */}
            <textarea
              id="expression-filter"
              value={store.expression}
              onChange={(e) => store.setExpression(e.target.value)}
              rows={5}
              spellCheck={false}
              className="block w-full rounded-md border border-gray-300 bg-white p-2 font-mono text-xs text-gray-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:focus:border-indigo-700 dark:focus:ring-indigo-700/30"
            />
          </div>

          <div className="max-w-[200px] space-y-1.5">
            <Label htmlFor="max-records">Max Records</Label>
            <Input
              id="max-records"
              type="number"
              min={1}
              max={MAX_QUERY_RECORDS}
              value={store.maxRecords}
              onChange={(e) =>
                store.setMaxRecords(
                  Math.max(
                    1,
                    Math.min(
                      parseInt(e.target.value, 10) || 100,
                      MAX_QUERY_RECORDS,
                    ),
                  ),
                )
              }
            />
          </div>

          {knownBins.length > 0 && (
            <div>
              <Label className="text-xs">Select Bins (optional)</Label>
              <div className="mt-1 flex max-h-[120px] flex-wrap gap-3 overflow-auto rounded-md border border-gray-200 p-3 dark:border-gray-800">
                {knownBins.map((bin) => (
                  <div key={bin} className="flex items-center gap-1.5">
                    <Checkbox
                      id={`qbin-${bin}`}
                      checked={store.selectBins.includes(bin)}
                      onCheckedChange={() => toggleBin(bin)}
                    />
                    <label
                      htmlFor={`qbin-${bin}`}
                      className="cursor-pointer font-mono text-xs"
                    >
                      {bin}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <InlineAlert
        message={store.error}
        className={store.error ? "mt-2" : ""}
      />
    </div>
  )
}
