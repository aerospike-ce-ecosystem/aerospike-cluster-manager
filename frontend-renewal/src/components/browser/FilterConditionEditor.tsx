"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import {
  DUAL_VALUE_OPERATORS,
  FILTER_OPERATORS_BY_TYPE,
  NO_VALUE_OPERATORS,
} from "@/lib/constants"
import type {
  BinDataType,
  FilterOperator,
  QueryPredicateOperator,
} from "@/lib/types/query"
import type { BinValue } from "@/lib/types/record"

import type { FilterConditionWithId } from "@/stores/filter-store"

interface FilterConditionEditorProps {
  condition: FilterConditionWithId
  onChange: (updates: Partial<Omit<FilterConditionWithId, "id">>) => void
  onApply: () => void
  onCancel: () => void
}

function parseInputValue(raw: string, binType: BinDataType): BinValue {
  if (binType === "integer") {
    const n = parseInt(raw, 10)
    return isNaN(n) ? raw : n
  }
  if (binType === "float") {
    const n = parseFloat(raw)
    return isNaN(n) ? raw : n
  }
  return raw
}

export function FilterConditionEditor({
  condition,
  onChange,
  onApply,
  onCancel,
}: FilterConditionEditorProps) {
  const binType = condition.binType ?? "string"
  const operators = FILTER_OPERATORS_BY_TYPE[binType] ?? []
  const needsValue = !NO_VALUE_OPERATORS.includes(condition.operator)
  const needsValue2 = DUAL_VALUE_OPERATORS.includes(condition.operator)
  const isGeo = (
    ["geo_within", "geo_contains"] as (
      | FilterOperator
      | QueryPredicateOperator
    )[]
  ).includes(condition.operator)

  const [val, setVal] = useState(
    condition.value !== undefined && condition.value !== null
      ? String(condition.value)
      : "",
  )
  const [val2, setVal2] = useState(
    condition.value2 !== undefined && condition.value2 !== null
      ? String(condition.value2)
      : "",
  )
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (needsValue) {
      inputRef.current?.focus()
    }
  }, [needsValue])

  const handleApply = () => {
    const updates: Partial<Omit<FilterConditionWithId, "id">> = {}
    if (needsValue) {
      updates.value = isGeo ? val : parseInputValue(val, binType)
    }
    if (needsValue2) {
      updates.value2 = parseInputValue(val2, binType)
    }
    onChange(updates)
    onApply()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleApply()
    }
    if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="w-[260px] space-y-2.5 p-3">
      <div className="font-mono text-xs font-medium text-gray-700 dark:text-gray-300">
        {condition.bin}
      </div>

      <select
        value={condition.operator}
        onChange={(e) =>
          onChange({ operator: e.target.value as FilterOperator })
        }
        className="block h-8 w-full appearance-none rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:focus:border-indigo-700 dark:focus:ring-indigo-700/30"
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {needsValue && !isGeo && (
        <Input
          ref={inputRef}
          type={binType === "integer" || binType === "float" ? "number" : "text"}
          placeholder={condition.operator === "regex" ? "Pattern..." : "Value..."}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 text-xs"
          inputClassName={condition.operator === "regex" ? "font-mono" : undefined}
        />
      )}

      {needsValue2 && (
        <Input
          type={binType === "integer" || binType === "float" ? "number" : "text"}
          placeholder="Upper bound..."
          value={val2}
          onChange={(e) => setVal2(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 text-xs"
        />
      )}

      {isGeo && (
        <textarea
          placeholder='{"type":"AeroCircle","coordinates":[[lng,lat],radius]}'
          value={val}
          onChange={(e) => setVal(e.target.value)}
          rows={4}
          spellCheck={false}
          className="block w-full rounded-md border border-gray-300 bg-white p-2 font-mono text-xs text-gray-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:focus:border-indigo-700 dark:focus:ring-indigo-700/30"
        />
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          variant="ghost"
          onClick={onCancel}
          className="h-7 px-3 text-xs"
        >
          Cancel
        </Button>
        <Button onClick={handleApply} className="h-7 px-3 text-xs">
          Apply
        </Button>
      </div>
    </div>
  )
}
