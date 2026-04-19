"use client"

import {
  RiAlertLine,
  RiCircleLine,
  RiFilterLine,
  RiTimeLine,
} from "@remixicon/react"
import { useMemo, useState } from "react"

import { Badge } from "@/components/Badge"
import { Card } from "@/components/Card"
import { cx } from "@/lib/utils"
import type { EventCategory, K8sClusterEvent } from "@/lib/types/k8s"

// NOTE(stream-c): inline formatter until Stream E adds a shared one.
function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "—"
  try {
    const then = new Date(iso).getTime()
    const diff = Date.now() - then
    if (Number.isNaN(diff)) return "—"
    const sec = Math.max(0, Math.floor(diff / 1000))
    if (sec < 60) return `${sec}s ago`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}m ago`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}h ago`
    const days = Math.floor(hr / 24)
    return `${days}d ago`
  } catch {
    return "—"
  }
}

const ALL_CATEGORIES: EventCategory[] = [
  "Lifecycle",
  "Rolling Restart",
  "Configuration",
  "ACL Security",
  "Scaling",
  "Rack Management",
  "Network",
  "Monitoring",
  "Template",
  "Circuit Breaker",
  "Other",
]

interface K8sEventTimelineProps {
  events: K8sClusterEvent[]
  className?: string
}

export function K8sEventTimeline({ events, className }: K8sEventTimelineProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<EventCategory | null>(null)
  const [typeFilter, setTypeFilter] = useState<"all" | "Warning" | "Normal">(
    "all",
  )

  const categoryCounts = useMemo(
    () =>
      events.reduce<Record<string, number>>((acc, e) => {
        const cat = e.category || "Other"
        acc[cat] = (acc[cat] || 0) + 1
        return acc
      }, {}),
    [events],
  )

  const filteredEvents = useMemo(
    () =>
      events.filter((e) => {
        if (selectedCategory && (e.category || "Other") !== selectedCategory)
          return false
        if (typeFilter !== "all" && e.type !== typeFilter) return false
        return true
      }),
    [events, selectedCategory, typeFilter],
  )

  return (
    <Card className={cx("p-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <RiTimeLine aria-hidden="true" className="size-4" />
          Events
          <Badge variant="neutral">{filteredEvents.length}</Badge>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1 rounded-md border border-gray-200 p-0.5 dark:border-gray-800">
            {(["all", "Warning", "Normal"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setTypeFilter(v)}
                className={cx(
                  "rounded px-2 py-0.5 transition-colors",
                  typeFilter === v
                    ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300"
                    : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100",
                )}
              >
                {v === "all" ? "All" : v}
              </button>
            ))}
          </div>
          {selectedCategory && (
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              <RiFilterLine aria-hidden="true" className="size-3" />
              Clear filter
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ALL_CATEGORIES.filter((cat) => categoryCounts[cat]).map((cat) => {
          const isSelected = selectedCategory === cat
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedCategory(isSelected ? null : cat)}
              className={cx(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                isSelected
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-300"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-900",
              )}
            >
              <RiCircleLine aria-hidden="true" className="size-2" />
              {cat}
              <span className="opacity-60">{categoryCounts[cat]}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        {filteredEvents.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            No events match the current filters.
          </p>
        ) : (
          <ul className="space-y-1">
            {filteredEvents.map((event, i) => {
              const isWarning = event.type === "Warning"
              return (
                <li
                  key={`${event.source ?? ""}-${event.reason ?? ""}-${event.firstTimestamp ?? ""}-${i}`}
                  className={cx(
                    "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm",
                    isWarning
                      ? "bg-red-50 dark:bg-red-950/20"
                      : "hover:bg-gray-50 dark:hover:bg-gray-900/50",
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {isWarning ? (
                      <RiAlertLine
                        aria-hidden="true"
                        className="size-3.5 text-red-600 dark:text-red-400"
                      />
                    ) : (
                      <RiCircleLine
                        aria-hidden="true"
                        className="size-3.5 text-gray-400"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{event.reason ?? "—"}</span>
                      {(event.count ?? 0) > 1 && (
                        <Badge variant="neutral">×{event.count}</Badge>
                      )}
                      {event.category && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {event.category}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {event.message ?? ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {formatRelativeTime(event.lastTimestamp)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}
