"use client"

import { cx, focusRing } from "@/lib/utils"
import { type ClustersView } from "@/stores/ui-store"
import { RiLayoutGridLine, RiListCheck2 } from "@remixicon/react"

/**
 * Card / table view radiogroup toggle for the cluster list.
 */
export function ViewToggle({
  value,
  onChange,
}: {
  value: ClustersView
  onChange: (v: ClustersView) => void
}) {
  const options: Array<{
    value: ClustersView
    label: string
    icon: typeof RiLayoutGridLine
  }> = [
    { value: "card", label: "Card view", icon: RiLayoutGridLine },
    { value: "table", label: "Table view", icon: RiListCheck2 },
  ]

  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 dark:border-gray-800 dark:bg-gray-950"
    >
      {options.map((opt) => {
        const Icon = opt.icon
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={cx(
              "flex size-7 items-center justify-center rounded transition",
              active
                ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-500 hover:dark:bg-gray-900 hover:dark:text-gray-50",
              focusRing,
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
