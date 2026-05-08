"use client"

import { Tooltip } from "@/components/Tooltip"
import { cx } from "@/lib/utils"
import {
  RiCheckLine,
  RiErrorWarningLine,
  RiFileCopyLine,
} from "@remixicon/react"
import React from "react"

interface AddressCopyCellProps {
  hosts: string[]
  port: number
  /** Fallback shown when ``hosts`` is empty (e.g. ACKO cluster without seeds). */
  fallback?: string
  className?: string
}

type CopyStatus = "idle" | "copied" | "error"

/**
 * Best-effort copy that tries the modern Clipboard API first and falls back
 * to the legacy ``document.execCommand('copy')`` flow when permissions are
 * denied or the API isn't available (insecure contexts, embedded browsers,
 * automation harnesses with restrictive permissions).
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the textarea fallback
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.setAttribute("readonly", "")
    // Position offscreen so the user never sees a flicker.
    ta.style.position = "fixed"
    ta.style.top = "-1000px"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function AddressCopyCell({
  hosts,
  port,
  fallback = "—",
  className,
}: AddressCopyCellProps) {
  const [status, setStatus] = React.useState<CopyStatus>("idle")
  // Tracks the most recent feedback-reset timer so rapid double-clicks don't
  // race a stale callback into resetting the status, and so the timer is
  // canceled if the cell unmounts mid-feedback (otherwise React warns about
  // setState on an unmounted component).
  const resetTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
        resetTimerRef.current = null
      }
    }
  }, [])

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
    const ok = await copyText(seedList)
    setStatus(ok ? "copied" : "error")
    // Cancel any in-flight reset before scheduling a new one so the feedback
    // window doesn't get cut short by the previous click's pending timer.
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current)
    }
    // Hold the feedback long enough for a glance — the previous 1.5s window
    // was too short for the change to register reliably (#319 follow-up).
    resetTimerRef.current = window.setTimeout(() => {
      setStatus("idle")
      resetTimerRef.current = null
    }, 2500)
  }

  const tooltipContent =
    status === "copied"
      ? "Copied!"
      : status === "error"
        ? "Copy failed — clipboard permission denied. Select the address text manually."
        : `Copy seed list (${formatted.length} host${formatted.length === 1 ? "" : "s"})`

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
      <Tooltip content={tooltipContent} side="top" triggerAsChild>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy seed list"
          aria-live="polite"
          className={cx(
            "inline-flex size-6 items-center justify-center rounded text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50",
            status === "copied" && "text-emerald-600 dark:text-emerald-400",
            status === "error" && "text-red-600 dark:text-red-400",
          )}
        >
          {status === "copied" ? (
            <RiCheckLine className="size-4" aria-hidden="true" />
          ) : status === "error" ? (
            <RiErrorWarningLine className="size-4" aria-hidden="true" />
          ) : (
            <RiFileCopyLine className="size-4" aria-hidden="true" />
          )}
        </button>
      </Tooltip>
    </span>
  )
}

export default AddressCopyCell
