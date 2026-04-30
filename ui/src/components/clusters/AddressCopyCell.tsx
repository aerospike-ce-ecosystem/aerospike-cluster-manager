"use client"

import { Tooltip } from "@/components/Tooltip"
import { cx } from "@/lib/utils"
import { RiCheckLine, RiFileCopyLine } from "@remixicon/react"
import React from "react"

interface AddressCopyCellProps {
  hosts: string[]
  port: number
  /** Fallback shown when ``hosts`` is empty (e.g. ACKO cluster without seeds). */
  fallback?: string
  className?: string
}

export function AddressCopyCell({
  hosts,
  port,
  fallback = "—",
  className,
}: AddressCopyCellProps) {
  const [copied, setCopied] = React.useState(false)

  if (hosts.length === 0) {
    return (
      <span
        className={cx("font-mono text-gray-600 dark:text-gray-400", className)}
      >
        {fallback}
      </span>
    )
  }

  const formatted = hosts.map((h) => `${h}:${port}`)
  const seedList = formatted.join(",")
  const primary = formatted[0]
  const extra = hosts.length - 1

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(seedList)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Browsers without clipboard permission fall back silently;
      // the user can still read the address from the tooltip.
    }
  }

  return (
    <span className={cx("flex items-center gap-1.5", className)}>
      <Tooltip
        content={
          <div className="flex flex-col gap-1 font-mono text-xs">
            {formatted.map((entry) => (
              <span key={entry}>{entry}</span>
            ))}
          </div>
        }
        side="top"
      >
        <span className="block max-w-[220px] truncate font-mono text-gray-700 dark:text-gray-300">
          {primary}
        </span>
      </Tooltip>
      {extra > 0 && (
        <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          +{extra}
        </span>
      )}
      <Tooltip
        content={
          copied
            ? "Copied!"
            : `Copy seed list (${formatted.length} host${formatted.length === 1 ? "" : "s"})`
        }
        side="top"
        triggerAsChild
      >
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy seed list"
          className={cx(
            "inline-flex size-6 items-center justify-center rounded text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50",
            copied && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {copied ? (
            <RiCheckLine className="size-4" aria-hidden="true" />
          ) : (
            <RiFileCopyLine className="size-4" aria-hidden="true" />
          )}
        </button>
      </Tooltip>
    </span>
  )
}

export default AddressCopyCell
