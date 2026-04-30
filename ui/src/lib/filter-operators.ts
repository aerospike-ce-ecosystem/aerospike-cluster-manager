/**
 * Filter operator metadata mirrored from the original frontend/ constants.
 * Used by the record-browser filter toolbar to render operator selects,
 * decide which value inputs to show, and render filter chips.
 */

import type { BinDataType, FilterOperator } from "./types/query"

export interface FilterOperatorOption {
  value: FilterOperator
  label: string
}

export const FILTER_OPERATORS_BY_TYPE: Record<
  BinDataType,
  FilterOperatorOption[]
> = {
  integer: [
    { value: "eq", label: "=" },
    { value: "ne", label: "≠" },
    { value: "gt", label: ">" },
    { value: "ge", label: "≥" },
    { value: "lt", label: "<" },
    { value: "le", label: "≤" },
    { value: "between", label: "Between" },
    { value: "exists", label: "Exists" },
    { value: "not_exists", label: "Not Exists" },
  ],
  float: [
    { value: "eq", label: "=" },
    { value: "ne", label: "≠" },
    { value: "gt", label: ">" },
    { value: "ge", label: "≥" },
    { value: "lt", label: "<" },
    { value: "le", label: "≤" },
    { value: "between", label: "Between" },
    { value: "exists", label: "Exists" },
    { value: "not_exists", label: "Not Exists" },
  ],
  string: [
    { value: "eq", label: "Equals" },
    { value: "ne", label: "Not Equals" },
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Not Contains" },
    { value: "regex", label: "Regex" },
    { value: "exists", label: "Exists" },
    { value: "not_exists", label: "Not Exists" },
  ],
  bool: [
    { value: "is_true", label: "Is True" },
    { value: "is_false", label: "Is False" },
    { value: "exists", label: "Exists" },
  ],
  geo: [
    { value: "geo_within", label: "Within Region" },
    { value: "geo_contains", label: "Contains Point" },
    { value: "exists", label: "Exists" },
  ],
  list: [
    { value: "exists", label: "Exists" },
    { value: "not_exists", label: "Not Exists" },
  ],
  map: [
    { value: "exists", label: "Exists" },
    { value: "not_exists", label: "Not Exists" },
  ],
}

export const NO_VALUE_OPERATORS: FilterOperator[] = [
  "exists",
  "not_exists",
  "is_true",
  "is_false",
]

export const DUAL_VALUE_OPERATORS: FilterOperator[] = ["between"]

export function operatorLabel(
  op: FilterOperator,
  binType: BinDataType,
): string {
  return (
    FILTER_OPERATORS_BY_TYPE[binType]?.find((o) => o.value === op)?.label ?? op
  )
}
