"use client"

import { Badge } from "@/components/Badge"
import { Tooltip } from "@/components/Tooltip"
import { ENV_LABEL_KEY } from "@/components/clusters/LabelsEditor"

interface LabelsCellProps {
  labels: Record<string, string>
  /** Maximum number of chips shown before collapsing the rest into a tooltip. */
  maxVisible?: number
}

export function LabelsCell({ labels, maxVisible = 3 }: LabelsCellProps) {
  const entries = Object.entries(labels)
  const envValue = labels[ENV_LABEL_KEY] ?? "default"
  const others = entries.filter(([k]) => k !== ENV_LABEL_KEY)
  const visible = others.slice(0, maxVisible)
  const overflow = others.slice(maxVisible)

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant="default" className="font-mono">
        env={envValue}
      </Badge>
      {visible.map(([k, v]) => (
        <Badge key={k} variant="neutral" className="font-mono">
          {k}={v}
        </Badge>
      ))}
      {overflow.length > 0 && (
        <Tooltip
          content={
            <div className="flex flex-col gap-1 font-mono text-xs">
              {overflow.map(([k, v]) => (
                <span key={k}>
                  {k}={v}
                </span>
              ))}
            </div>
          }
          side="top"
          triggerAsChild
        >
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-gray-900"
          >
            +{overflow.length}
          </button>
        </Tooltip>
      )}
    </div>
  )
}

export default LabelsCell
