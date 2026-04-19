"use client"

import {
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiDeleteBin2Line,
  RiPlayLine,
  RiRefreshLine,
  RiTimeLine,
} from "@remixicon/react"
import { useState } from "react"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { ProgressBar } from "@/components/ProgressBar"
import { cx } from "@/lib/utils"
import type { OperationStatusResponse } from "@/lib/types/k8s"

interface K8sOperationStatusProps {
  operationStatus: OperationStatusResponse
  /** Total pod count in the cluster, used when podList is empty (targets all pods). */
  totalPodCount: number
  /** Callback to clear spec.operations and unblock the cluster. */
  onClear?: () => Promise<void>
}

function getPhaseTone(phase: string | null | undefined) {
  switch (phase) {
    case "Completed":
      return { badge: "success" as const, border: "border-l-emerald-500" }
    case "Failed":
    case "Error":
      return { badge: "error" as const, border: "border-l-red-500" }
    case "InProgress":
    case "Running":
      return { badge: "warning" as const, border: "border-l-indigo-500" }
    default:
      return { badge: "neutral" as const, border: "border-l-gray-300" }
  }
}

function getOperationLabel(kind: string | null | undefined) {
  if (kind === "WarmRestart") return "Warm Restart"
  if (kind === "PodRestart") return "Pod Restart"
  return kind ?? "Operation"
}

export function K8sOperationStatus({
  operationStatus,
  totalPodCount,
  onClear,
}: K8sOperationStatusProps) {
  const [clearing, setClearing] = useState(false)
  const {
    kind,
    phase,
    completedPods = [],
    failedPods = [],
    podList = [],
    id,
  } = operationStatus

  const tone = getPhaseTone(phase)
  const targetCount = podList.length > 0 ? podList.length : totalPodCount
  const processedCount = completedPods.length + failedPods.length
  const progressPercent =
    targetCount > 0 ? Math.round((processedCount / targetCount) * 100) : 0
  const isAllPods = podList.length === 0
  const doneSet = new Set([...completedPods, ...failedPods])
  const pendingPods = podList.filter((p) => !doneSet.has(p))
  const isRunning = phase === "InProgress" || phase === "Running"

  return (
    <Card className={cx("border-l-4 p-4", tone.border)}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {kind === "PodRestart" ? (
            <RiRefreshLine aria-hidden="true" className="size-4" />
          ) : (
            <RiPlayLine aria-hidden="true" className="size-4" />
          )}
          Active operation: {getOperationLabel(kind)}
        </div>
        <Badge variant={tone.badge}>{phase ?? "Unknown"}</Badge>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {id && (
            <span className="font-mono text-gray-500 dark:text-gray-400">
              ID: {id}
            </span>
          )}
          {onClear && (
            <Button
              variant="ghost"
              onClick={async () => {
                const ok = window.confirm(
                  "Clear the active operation? This will unblock the cluster for new operations.",
                )
                if (!ok) return
                setClearing(true)
                try {
                  await onClear()
                } finally {
                  setClearing(false)
                }
              }}
              disabled={clearing}
              className="h-7 gap-1 px-2 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <RiDeleteBin2Line aria-hidden="true" className="size-3" />
              {clearing ? "Clearing..." : "Clear"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Progress: {processedCount}/{targetCount} pods
            {isAllPods && " (all pods)"}
          </span>
          <span className="font-medium">{progressPercent}%</span>
        </div>
        <ProgressBar value={progressPercent} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <RiCheckboxCircleLine
              aria-hidden="true"
              className="size-3.5 text-emerald-500"
            />
            Completed ({completedPods.length})
          </div>
          {completedPods.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">None yet</p>
          ) : (
            <ul className="space-y-1">
              {completedPods.map((pod) => (
                <li
                  key={pod}
                  className="truncate font-mono text-xs text-emerald-600 dark:text-emerald-400"
                  title={pod}
                >
                  {pod}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className={cx(
            "rounded-md border p-3",
            failedPods.length > 0
              ? "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/20"
              : "border-gray-200 dark:border-gray-800",
          )}
        >
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <RiCloseCircleLine
              aria-hidden="true"
              className={cx(
                "size-3.5",
                failedPods.length > 0 ? "text-red-500" : "text-gray-400",
              )}
            />
            Failed ({failedPods.length})
          </div>
          {failedPods.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">None</p>
          ) : (
            <ul className="space-y-1">
              {failedPods.map((pod) => (
                <li
                  key={pod}
                  className="truncate font-mono text-xs text-red-600 dark:text-red-400"
                  title={pod}
                >
                  {pod}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <RiTimeLine
              aria-hidden="true"
              className={cx(
                "size-3.5",
                isRunning ? "animate-pulse text-indigo-500" : "text-gray-400",
              )}
            />
            Pending ({targetCount - processedCount})
          </div>
          {pendingPods.length === 0 && isAllPods && targetCount - processedCount > 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {targetCount - processedCount} pod
              {targetCount - processedCount !== 1 ? "s" : ""} remaining
            </p>
          ) : pendingPods.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">None</p>
          ) : (
            <ul className="space-y-1">
              {pendingPods.map((pod) => (
                <li
                  key={pod}
                  className="truncate font-mono text-xs text-gray-600 dark:text-gray-400"
                  title={pod}
                >
                  {pod}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  )
}
