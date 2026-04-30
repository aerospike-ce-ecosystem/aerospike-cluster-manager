"use client"

import { Tooltip } from "@/components/Tooltip"
import { ENV_LABEL_KEY } from "@/components/clusters/LabelsEditor"
import { type EnvTone, getEnvTone } from "@/components/clusters/envTone"
import { cx } from "@/lib/utils"

interface LabelsCellProps {
  labels: Record<string, string>
  /**
   * When the parent context (e.g. an env-grouped section header) already
   * declares the env, the env chip becomes redundant noise. Hide it.
   */
  hideEnv?: boolean
  maxVisible?: number
}

interface ChipProps {
  k: string
  v: string
  tone?: EnvTone
}

function Chip({ k, v, tone }: ChipProps) {
  if (tone) {
    return (
      <span
        className={cx(
          "inline-flex items-stretch overflow-hidden rounded-md text-[11px] leading-none shadow-[0_1px_0_rgb(0_0_0/0.02)] ring-1 dark:shadow-none",
          tone.valueRing,
        )}
      >
        <span className="border-r border-black/[0.06] bg-white px-1.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:border-white/[0.06] dark:bg-gray-950 dark:text-gray-500">
          {k}
        </span>
        <span
          className={cx(
            "px-1.5 py-1 font-mono font-semibold",
            tone.valueBg,
            tone.valueText,
          )}
        >
          {v}
        </span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-stretch overflow-hidden rounded-md text-[11px] leading-none shadow-[0_1px_0_rgb(0_0_0/0.02)] ring-1 ring-gray-200 dark:shadow-none dark:ring-gray-800">
      <span className="border-r border-gray-200 bg-gray-50 px-1.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
        {k}
      </span>
      <span className="bg-white px-1.5 py-1 font-mono text-gray-800 dark:bg-gray-950 dark:text-gray-200">
        {v}
      </span>
    </span>
  )
}

export function LabelsCell({
  labels,
  hideEnv,
  maxVisible = 3,
}: LabelsCellProps) {
  const envValue = labels[ENV_LABEL_KEY] ?? "default"
  const envTone = getEnvTone(envValue)
  const others = Object.entries(labels).filter(([k]) => k !== ENV_LABEL_KEY)
  const visible = others.slice(0, maxVisible)
  const overflow = others.slice(maxVisible)

  const isEmpty = others.length === 0 && hideEnv
  if (isEmpty) {
    return <span className="text-xs text-gray-400 dark:text-gray-600">—</span>
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!hideEnv && <Chip k="env" v={envValue} tone={envTone} />}
      {visible.map(([k, v]) => (
        <Chip key={k} k={k} v={v} />
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
            className="rounded-md px-1.5 py-1 font-mono text-[10px] font-medium text-gray-600 ring-1 ring-gray-200 transition hover:bg-gray-50 dark:text-gray-400 dark:ring-gray-800 dark:hover:bg-gray-900"
          >
            +{overflow.length}
          </button>
        </Tooltip>
      )}
    </div>
  )
}

export default LabelsCell
