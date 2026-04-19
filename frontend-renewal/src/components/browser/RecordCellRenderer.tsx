import type { BinValue } from "@/lib/types/record"
import { cx } from "@/lib/utils"

import { truncateMiddle } from "./_utils"

/** Pattern matching bin names that strongly suggest boolean semantics. */
const BOOL_BIN_PATTERN =
  /(?:^bool|bool$|^is[_A-Z]|^has[_A-Z]|_bool_|_bool$|^enabled$|^disabled$|^active$|^flag)/i

function renderBooleanCell(boolVal: boolean): React.ReactNode {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 font-mono text-xs font-medium",
        boolVal
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400",
      )}
    >
      <span
        className={cx(
          "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
          boolVal ? "bg-emerald-500" : "bg-red-500",
        )}
      />
      {boolVal.toString()}
    </span>
  )
}

/**
 * Type-aware cell renderer for the record browser table.
 *
 * Handles primitives (string / number / bool), complex types (list / map / geo)
 * with a compact summary, nullish values, and heuristic detection of booleans
 * stored as 0/1 or GeoJSON stored as JSON strings.
 */
export function renderCellValue(
  value: BinValue,
  binName?: string,
): React.ReactNode {
  if (value === null || value === undefined)
    return (
      <span className="font-mono text-xs text-gray-400 dark:text-gray-600">
        —
      </span>
    )

  if (typeof value === "boolean") return renderBooleanCell(value)

  if (
    typeof value === "number" &&
    binName &&
    BOOL_BIN_PATTERN.test(binName) &&
    (value === 0 || value === 1)
  )
    return renderBooleanCell(value === 1)

  if (typeof value === "number")
    return (
      <span className="font-mono text-[13px] font-medium tabular-nums text-blue-700 dark:text-blue-400">
        {value.toLocaleString()}
      </span>
    )

  if (Array.isArray(value))
    return (
      <span className="font-mono text-xs text-cyan-700 dark:text-cyan-400">
        <span className="opacity-50">[</span>
        {value.length}
        <span className="opacity-50">]</span>
      </span>
    )

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    if ("type" in obj && "coordinates" in obj) {
      return (
        <span className="font-mono text-xs text-rose-700 dark:text-rose-400">
          ◉ geo
        </span>
      )
    }
    const keyCount = Object.keys(obj).length
    return (
      <span className="font-mono text-xs text-pink-700 dark:text-pink-400">
        <span className="opacity-50">{"{"}</span>
        {keyCount}
        <span className="opacity-50">{"}"}</span>
      </span>
    )
  }

  const str = String(value)
  if (str.startsWith('{"type":') && str.includes('"coordinates"')) {
    return (
      <span className="font-mono text-xs text-rose-700 dark:text-rose-400">
        ◉ geo
      </span>
    )
  }

  return (
    <span className="font-mono text-[13px] text-gray-900 dark:text-gray-50">
      {truncateMiddle(str, 50)}
    </span>
  )
}
