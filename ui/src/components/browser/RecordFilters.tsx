"use client"

import {
  RiAddLine,
  RiCloseLine,
  RiDatabase2Line,
  RiSearchLine,
} from "@remixicon/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/Popover"
import { Tooltip } from "@/components/Tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import {
  DUAL_VALUE_OPERATORS,
  FILTER_OPERATORS_BY_TYPE,
  NO_VALUE_OPERATORS,
  operatorLabel,
} from "@/lib/filter-operators"
import type {
  BinDataType,
  FilterCondition,
  FilterOperator,
} from "@/lib/types/query"
import type { BinValue } from "@/lib/types/record"
import { cx } from "@/lib/utils"

export interface FilterDraftCondition extends FilterCondition {
  id: string
  binType: BinDataType
}

export interface FilterDraft {
  pk: string
  logic: "and" | "or"
  conditions: FilterDraftCondition[]
}

export function emptyFilterDraft(): FilterDraft {
  return { pk: "", logic: "and", conditions: [] }
}

export function draftHasFilters(draft: FilterDraft): boolean {
  return draft.conditions.length > 0 || draft.pk.trim().length > 0
}

/** Strip the client-side `id` field before sending to the backend. */
export function draftToFilterConditions(
  draft: FilterDraft,
): { logic: "and" | "or"; conditions: FilterCondition[] } | undefined {
  if (draft.conditions.length === 0) return undefined
  return {
    logic: draft.logic,
    conditions: draft.conditions.map(({ id: _id, ...rest }) => rest),
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `fc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const TYPE_BADGE_COLORS: Record<BinDataType, string> = {
  integer: "text-blue-600 dark:text-blue-400",
  float: "text-cyan-600 dark:text-cyan-400",
  string: "text-emerald-600 dark:text-emerald-400",
  bool: "text-amber-600 dark:text-amber-400",
  geo: "text-rose-600 dark:text-rose-400",
  list: "text-violet-600 dark:text-violet-400",
  map: "text-orange-600 dark:text-orange-400",
}

export interface RecordFiltersProps {
  /** Bins that have a ready secondary index on this ns/set. */
  availableBins: Array<{ name: string; type: BinDataType }>
  draft: FilterDraft
  onChange: (draft: FilterDraft) => void
  onApply: () => void
  onClear: () => void
  loading?: boolean
  /** True when the draft differs from what was last applied. */
  dirty?: boolean
  /** Optional content rendered right-aligned on the same toolbar row. */
  trailing?: React.ReactNode
}

export function RecordFilters({
  availableBins,
  draft,
  onChange,
  onApply,
  onClear,
  loading,
  dirty,
  trailing,
}: RecordFiltersProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const updatePk = useCallback(
    (pk: string) => onChange({ ...draft, pk }),
    [draft, onChange],
  )

  const addCondition = useCallback(
    (binName: string, binType: BinDataType) => {
      const operators = FILTER_OPERATORS_BY_TYPE[binType]
      const defaultOp = operators[0]?.value ?? ("eq" as FilterOperator)
      const cond: FilterDraftCondition = {
        id: uuid(),
        bin: binName,
        operator: defaultOp,
        binType,
      }
      onChange({ ...draft, conditions: [...draft.conditions, cond] })
      setEditingId(cond.id)
      setPickerOpen(false)
    },
    [draft, onChange],
  )

  const updateCondition = useCallback(
    (id: string, updates: Partial<Omit<FilterDraftCondition, "id">>) => {
      onChange({
        ...draft,
        conditions: draft.conditions.map((c) =>
          c.id === id ? { ...c, ...updates } : c,
        ),
      })
    },
    [draft, onChange],
  )

  const removeCondition = useCallback(
    (id: string) => {
      onChange({
        ...draft,
        conditions: draft.conditions.filter((c) => c.id !== id),
      })
      if (editingId === id) setEditingId(null)
    },
    [draft, editingId, onChange],
  )

  const toggleLogic = useCallback(() => {
    onChange({ ...draft, logic: draft.logic === "and" ? "or" : "and" })
  }, [draft, onChange])

  const handleApplyKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        onApply()
      }
    },
    [onApply],
  )

  const hasDraft = draftHasFilters(draft)
  const canApply = !loading && dirty !== false

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* PK lookup */}
        <div className="flex min-w-[240px] items-center gap-1">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
            PK
          </span>
          <Input
            type="search"
            value={draft.pk}
            onChange={(e) => updatePk(e.target.value)}
            onKeyDown={handleApplyKey}
            placeholder="Primary key..."
            className="sm:w-60"
          />
        </div>

        <span className="mx-0.5 hidden h-5 w-px bg-gray-200 sm:block dark:bg-gray-800" />

        {/* Add filter picker */}
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cx(
                "inline-flex h-8 items-center gap-1 rounded-md border border-dashed px-2.5 text-xs transition-colors",
                "border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900",
                "dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-900 dark:hover:text-gray-50",
              )}
              title={
                pickerOpen
                  ? undefined
                  : availableBins.length === 0
                    ? "No secondary indexes found — create an index to enable filtering"
                    : `${availableBins.length} indexed bin(s) available`
              }
            >
              {availableBins.length > 0 ? (
                <RiAddLine className="size-3.5" aria-hidden="true" />
              ) : (
                <RiDatabase2Line className="size-3.5" aria-hidden="true" />
              )}
              <span>Add filter</span>
              {availableBins.length > 0 && (
                <span className="ml-1 rounded-full bg-indigo-100 px-1.5 text-[10px] font-medium tabular-nums text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                  {availableBins.length}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="w-[240px] p-0">
            <BinPicker bins={availableBins} onSelect={addCondition} />
          </PopoverContent>
        </Popover>

        {/* Condition chips */}
        {draft.conditions.map((cond, idx) => (
          <ConditionChip
            key={cond.id}
            condition={cond}
            editing={editingId === cond.id}
            onOpenChange={(open) => setEditingId(open ? cond.id : null)}
            onChange={(updates) => updateCondition(cond.id, updates)}
            onRemove={() => removeCondition(cond.id)}
            leadingLogic={idx > 0 ? draft.logic : undefined}
            onToggleLogic={idx > 0 ? toggleLogic : undefined}
          />
        ))}

        <Button
          variant="primary"
          onClick={onApply}
          isLoading={loading}
          disabled={!canApply}
          className="h-8 gap-1 px-3 text-xs"
        >
          <RiSearchLine className="size-3.5" aria-hidden="true" />
          Search
        </Button>

        {hasDraft && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-50"
          >
            <RiCloseLine className="size-3" aria-hidden="true" />
            <span>Clear</span>
          </button>
        )}

        {trailing && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {trailing}
          </div>
        )}
      </div>

      {availableBins.length === 0 && !pickerOpen && (
        <p className="text-[11px] text-gray-500 dark:text-gray-500">
          Bin filters require a ready secondary index on this namespace/set. Use
          the Indexes tab to create one. Primary-key lookup above works without
          an index.
        </p>
      )}
    </div>
  )
}

/* ───────────────── Bin picker popover ───────────────── */

function BinPicker({
  bins,
  onSelect,
}: {
  bins: Array<{ name: string; type: BinDataType }>
  onSelect: (name: string, type: BinDataType) => void
}) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return bins
    const q = query.toLowerCase()
    return bins.filter((b) => b.name.toLowerCase().includes(q))
  }, [bins, query])

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <RiSearchLine
          className="size-3.5 shrink-0 text-gray-400"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by..."
          className="w-full bg-transparent text-xs outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600"
        />
      </div>

      <div className="flex items-center gap-1.5 border-b border-gray-200 px-3 py-1.5 dark:border-gray-800">
        <RiDatabase2Line className="size-3 text-amber-500" aria-hidden="true" />
        <span className="text-[10px] text-gray-500 dark:text-gray-500">
          Secondary Index required
        </span>
      </div>

      <div className="max-h-[240px] overflow-auto py-1">
        {bins.length === 0 ? (
          <div className="space-y-1 px-3 py-4 text-center">
            <p className="text-gray-500 dark:text-gray-500">
              No indexed bins found
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-600">
              Create a secondary index on the Indexes tab to enable filtering.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-gray-500 dark:text-gray-500">
            No matching bins
          </div>
        ) : (
          filtered.map((bin) => (
            <button
              key={bin.name}
              type="button"
              onClick={() => onSelect(bin.name, bin.type)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-900"
            >
              <span
                className={cx(
                  "font-mono text-[11px]",
                  TYPE_BADGE_COLORS[bin.type],
                )}
              >
                #
              </span>
              <span className="truncate font-mono text-[12px] text-gray-900 dark:text-gray-50">
                {bin.name}
              </span>
              <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-600">
                {bin.type}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/* ───────────────── Condition chip + editor ───────────────── */

function formatChipValue(c: FilterDraftCondition): string {
  if (NO_VALUE_OPERATORS.includes(c.operator)) return ""
  if (c.operator === "between" && c.value != null && c.value2 != null) {
    return `${String(c.value)} ~ ${String(c.value2)}`
  }
  if (c.value == null) return "…"
  const s = String(c.value)
  return s.length > 20 ? `${s.slice(0, 20)}…` : s
}

interface ConditionChipProps {
  condition: FilterDraftCondition
  editing: boolean
  onOpenChange: (open: boolean) => void
  onChange: (updates: Partial<Omit<FilterDraftCondition, "id">>) => void
  onRemove: () => void
  leadingLogic?: "and" | "or"
  onToggleLogic?: () => void
}

function ConditionChip({
  condition,
  editing,
  onOpenChange,
  onChange,
  onRemove,
  leadingLogic,
  onToggleLogic,
}: ConditionChipProps) {
  const label = operatorLabel(condition.operator, condition.binType)
  const valStr = formatChipValue(condition)

  return (
    <div className="flex items-center gap-1.5">
      {leadingLogic && (
        <Tooltip
          content={`Switch to ${leadingLogic === "and" ? "OR" : "AND"} logic`}
          side="top"
          triggerAsChild
        >
          <button
            type="button"
            onClick={onToggleLogic}
            className="inline-flex h-6 items-center rounded bg-gray-100 px-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-600 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            {leadingLogic}
          </button>
        </Tooltip>
      )}
      <Popover open={editing} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
              "border-gray-300 bg-gray-50 text-gray-900 hover:bg-gray-100",
              "dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800",
            )}
          >
            <span
              className={cx("font-mono", TYPE_BADGE_COLORS[condition.binType])}
            >
              {condition.bin}
            </span>
            <span className="text-gray-500 dark:text-gray-500">{label}</span>
            {valStr && (
              <span className="max-w-[140px] truncate font-mono text-[11px]">
                {valStr}
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  e.stopPropagation()
                  onRemove()
                }
              }}
              className="ml-0.5 inline-flex size-4 items-center justify-center rounded-sm text-gray-400 hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-gray-50"
              aria-label={`Remove ${condition.bin} filter`}
            >
              <RiCloseLine className="size-3" aria-hidden="true" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="bottom" className="w-[280px] p-3">
          <ConditionEditor
            condition={condition}
            onChange={onChange}
            onApply={() => onOpenChange(false)}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function parseInputValue(raw: string, binType: BinDataType): BinValue {
  if (binType === "integer") {
    const n = parseInt(raw, 10)
    return Number.isNaN(n) ? raw : n
  }
  if (binType === "float") {
    const n = parseFloat(raw)
    return Number.isNaN(n) ? raw : n
  }
  return raw
}

function ConditionEditor({
  condition,
  onChange,
  onApply,
}: {
  condition: FilterDraftCondition
  onChange: (updates: Partial<Omit<FilterDraftCondition, "id">>) => void
  onApply: () => void
}) {
  const operators = FILTER_OPERATORS_BY_TYPE[condition.binType] ?? []
  const needsValue = !NO_VALUE_OPERATORS.includes(condition.operator)
  const needsValue2 = DUAL_VALUE_OPERATORS.includes(condition.operator)
  const isGeo =
    condition.operator === "geo_within" || condition.operator === "geo_contains"

  const [val, setVal] = useState(
    condition.value != null ? String(condition.value) : "",
  )
  const [val2, setVal2] = useState(
    condition.value2 != null ? String(condition.value2) : "",
  )
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (needsValue) inputRef.current?.focus()
  }, [needsValue])

  const commit = useCallback(() => {
    const updates: Partial<Omit<FilterDraftCondition, "id">> = {}
    if (needsValue) {
      updates.value = isGeo ? val : parseInputValue(val, condition.binType)
    } else {
      updates.value = null
    }
    if (needsValue2) {
      updates.value2 = parseInputValue(val2, condition.binType)
    } else {
      updates.value2 = null
    }
    onChange(updates)
    onApply()
  }, [
    condition.binType,
    isGeo,
    needsValue,
    needsValue2,
    onApply,
    onChange,
    val,
    val2,
  ])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      commit()
    }
  }

  const numberType =
    condition.binType === "integer" || condition.binType === "float"
      ? "number"
      : "text"

  return (
    <div className="space-y-2.5">
      <div className="font-mono text-xs text-gray-700 dark:text-gray-300">
        {condition.bin}
      </div>

      <Select
        value={condition.operator}
        onValueChange={(v) => onChange({ operator: v as FilterOperator })}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {needsValue && !isGeo && (
        <Input
          ref={inputRef}
          type={numberType}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            condition.operator === "regex" ? "Pattern..." : "Value..."
          }
          className={condition.operator === "regex" ? "font-mono" : ""}
        />
      )}

      {needsValue2 && (
        <Input
          type={numberType}
          value={val2}
          onChange={(e) => setVal2(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Upper bound..."
        />
      )}

      {isGeo && (
        <textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder='{"type":"AeroCircle","coordinates":[[lng,lat],radius]}'
          className="min-h-[80px] w-full rounded-md border border-gray-300 bg-white p-2 font-mono text-xs outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:focus:border-indigo-700 dark:focus:ring-indigo-700/30"
        />
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onApply()}
        >
          Cancel
        </Button>
        <Button variant="primary" className="h-7 px-2 text-xs" onClick={commit}>
          Apply
        </Button>
      </div>
    </div>
  )
}
