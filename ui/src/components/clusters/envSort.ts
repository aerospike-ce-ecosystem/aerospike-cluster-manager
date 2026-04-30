import { DEFAULT_ENV_VALUE } from "@/components/clusters/labels"

/**
 * Lifecycle-ordered priority for known environments. Values not in the list
 * fall to the end (alphabetical) so unknown envs still group consistently.
 */
export const ENV_PRIORITY = [
  "prod",
  "stage",
  "test",
  "dev",
  DEFAULT_ENV_VALUE,
] as const

export function envSortKey(env: string): [number, string] {
  const normalized = env.toLowerCase()
  const idx = (ENV_PRIORITY as readonly string[]).indexOf(normalized)
  return [idx === -1 ? ENV_PRIORITY.length : idx, normalized]
}

export function compareEnv(a: string, b: string): number {
  const [ia, sa] = envSortKey(a)
  const [ib, sb] = envSortKey(b)
  return ia !== ib ? ia - ib : sa.localeCompare(sb)
}
