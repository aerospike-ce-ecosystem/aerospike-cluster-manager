"use client"

import { RiCloseLine } from "@remixicon/react"

import { FILTER_OPERATORS_BY_TYPE, NO_VALUE_OPERATORS } from "@/lib/constants"
import { cx } from "@/lib/utils"

import type { FilterConditionWithId } from "@/stores/filter-store"

function formatValue(condition: FilterConditionWithId): string {
  const { operator, value, value2 } = condition
  if (NO_VALUE_OPERATORS.includes(operator)) return ""
  if (operator === "between" && value !== undefined && value2 !== undefined) {
    return `${value} ~ ${value2}`
  }
  if (value === undefined || value === null) return ""
  if (typeof value === "string")
    return value.length > 20 ? `${value.slice(0, 20)}...` : value
  return String(value)
}

function getOperatorLabel(condition: FilterConditionWithId): string {
  const binType = condition.binType ?? "string"
  const ops = FILTER_OPERATORS_BY_TYPE[binType]
  return ops?.find((o) => o.value === condition.operator)?.label ?? condition.operator
}

interface FilterChipProps {
  condition: FilterConditionWithId
  onEdit: (id: string) => void
  onRemove: (id: string) => void
}

export function FilterChip({ condition, onEdit, onRemove }: FilterChipProps) {
  const opLabel = getOperatorLabel(condition)
  const val = formatValue(condition)

  return (
    <span
      className={cx(
        "inline-flex max-w-[280px] cursor-pointer items-center gap-1 rounded-md border border-dashed border-gray-300 bg-gray-50 px-2 py-1 text-xs transition-colors",
        "hover:border-gray-400 hover:bg-gray-100",
        "dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600 dark:hover:bg-gray-800",
      )}
      role="button"
      tabIndex={0}
      onClick={() => onEdit(condition.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onEdit(condition.id)
        }
      }}
    >
      <span className="font-mono font-medium text-gray-700 dark:text-gray-300">
        {condition.bin}
      </span>
      <span className="text-gray-500 dark:text-gray-400">{opLabel}</span>
      {val && (
        <span className="max-w-[120px] truncate font-medium text-gray-900 dark:text-gray-50">
          {val}
        </span>
      )}
      <button
        type="button"
        className="-mr-0.5 ml-0.5 rounded-sm p-0.5 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(condition.id)
        }}
        aria-label={`Remove ${condition.bin} filter`}
      >
        <RiCloseLine aria-hidden className="size-3" />
      </button>
    </span>
  )
}
