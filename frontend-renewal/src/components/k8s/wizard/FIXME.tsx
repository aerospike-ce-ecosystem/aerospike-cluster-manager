import { RiAlertLine } from "@remixicon/react"

/**
 * Placeholder for wizard steps that have not been ported yet.
 * Renders a clear indication of the missing surface + pointer to the original file.
 */
export function FIXME({ note }: { note: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <RiAlertLine aria-hidden="true" className="size-4 shrink-0" />
      <div>
        <p className="font-medium">Not yet ported</p>
        <p className="mt-0.5 text-xs">{note}</p>
        <p className="mt-2 text-xs">
          Skip this step for now — the cluster can be created with sensible
          defaults, and advanced settings can be applied after creation by
          editing the CR.
        </p>
      </div>
    </div>
  )
}
