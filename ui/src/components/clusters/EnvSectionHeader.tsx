"use client"

import { getEnvTone } from "@/components/clusters/envTone"
import { cx } from "@/lib/utils"

/**
 * Editorial-style section header for an env group: colored accent bar,
 * tracking-widest small caps for the env name, monospace count, and a
 * gradient rule that fades into the canvas.
 */
export function EnvSectionHeader({
  env,
  count,
}: {
  env: string
  count: number
}) {
  const tone = getEnvTone(env)
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={cx("h-4 w-[3px] shrink-0 rounded-full", tone.accent)}
      />
      <span
        className={cx(
          "text-[11px] font-bold uppercase tracking-[0.22em]",
          tone.headerText,
        )}
      >
        {env}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-gray-500 dark:text-gray-500">
        {count} {count === 1 ? "cluster" : "clusters"}
      </span>
      <span aria-hidden="true" className={cx("h-px flex-1", tone.rule)} />
    </div>
  )
}
