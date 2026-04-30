/**
 * Visual mapping of an ACKO cluster ``phase`` to a colored dot + label.
 * Pure helper plus a small <PhaseDot/> for the table's status column.
 */

export type PhaseTone = {
  label: string
  variant: "success" | "warning" | "error" | "neutral"
  dot: string
}

export function phaseTone(phase: string | undefined): PhaseTone {
  if (!phase)
    return { label: "Unknown", variant: "neutral", dot: "bg-gray-400" }
  const p = phase.toLowerCase()
  if (p === "ready" || p === "running")
    return { label: phase, variant: "success", dot: "bg-emerald-500" }
  if (p === "error" || p === "failed")
    return { label: phase, variant: "error", dot: "bg-red-500" }
  if (p === "paused")
    return { label: phase, variant: "neutral", dot: "bg-gray-400" }
  return { label: phase, variant: "warning", dot: "bg-amber-500" }
}

export function PhaseDot({ phase }: { phase: string | undefined }) {
  const tone = phaseTone(phase)
  return (
    <span
      className={`inline-block size-2.5 rounded-full ${tone.dot}`}
      role="img"
      aria-label={tone.label}
      title={tone.label}
    />
  )
}
