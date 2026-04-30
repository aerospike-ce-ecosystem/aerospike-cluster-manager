/**
 * Connection-label domain primitives.
 *
 * Shared between the editor (LabelsEditor), the display chip (LabelsCell),
 * and the cluster list page so neither display nor editing depends on the
 * other.
 */

export const ENV_LABEL_KEY = "env"
export const DEFAULT_ENV_VALUE = "default"

export type LabelEntry = { key: string; value: string }

export function labelsToEntries(labels: Record<string, string>): LabelEntry[] {
  const entries: LabelEntry[] = [
    { key: ENV_LABEL_KEY, value: labels[ENV_LABEL_KEY] ?? DEFAULT_ENV_VALUE },
  ]
  for (const [k, v] of Object.entries(labels)) {
    if (k === ENV_LABEL_KEY) continue
    entries.push({ key: k, value: v })
  }
  return entries
}

export function entriesToLabels(entries: LabelEntry[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { key, value } of entries) {
    const k = key.trim()
    if (!k) continue
    out[k] = value
  }
  if (!out[ENV_LABEL_KEY]) {
    out[ENV_LABEL_KEY] = DEFAULT_ENV_VALUE
  }
  return out
}
