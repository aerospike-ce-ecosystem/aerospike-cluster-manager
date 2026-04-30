import { DEFAULT_ENV_VALUE, ENV_LABEL_KEY } from "@/components/clusters/labels"
import { compareEnv } from "@/components/clusters/envSort"
import type { ConnectionProfileResponse } from "@/lib/types/connection"
import type { K8sClusterSummary } from "@/lib/types/k8s"

/**
 * Unified row shape used by both the table and card views.
 *
 * ``profile`` is null for ACKO-managed clusters that haven't been linked to a
 * connection profile yet — those rows can't be edited or browsed inline, only
 * shown.
 */
export type ClusterRow = {
  key: string
  connId: string | null
  displayName: string
  color: string
  hosts: string[]
  port: number
  managedBy: "ACKO" | "manual"
  k8sNamespace?: string
  phase?: string
  size?: number
  description: string | null
  labels: Record<string, string>
  profile: ConnectionProfileResponse | null
}

function ensureEnvLabel(
  labels: Record<string, string> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = { ...(labels ?? {}) }
  if (!out[ENV_LABEL_KEY]) out[ENV_LABEL_KEY] = DEFAULT_ENV_VALUE
  return out
}

export function mergeRows(
  connections: ConnectionProfileResponse[] | null,
  k8s: K8sClusterSummary[] | null,
): ClusterRow[] {
  const rows: ClusterRow[] = []
  const seenConnIds = new Set<string>()

  for (const c of connections ?? []) {
    seenConnIds.add(c.id)
    const linkedK8s = k8s?.find((k) => k.connectionId === c.id)
    rows.push({
      key: `conn:${c.id}`,
      connId: c.id,
      displayName: c.name,
      color: c.color,
      hosts: c.hosts,
      port: c.port,
      managedBy: linkedK8s ? "ACKO" : "manual",
      k8sNamespace: linkedK8s?.namespace,
      phase: linkedK8s?.phase,
      size: linkedK8s?.size,
      description: c.description ?? null,
      labels: ensureEnvLabel(c.labels),
      profile: c,
    })
  }

  for (const k of k8s ?? []) {
    if (k.connectionId && seenConnIds.has(k.connectionId)) continue
    rows.push({
      key: `k8s:${k.namespace}/${k.name}`,
      connId: k.connectionId ?? null,
      displayName: k.name,
      color: "#4F46E5",
      hosts: [],
      port: 0,
      managedBy: "ACKO",
      k8sNamespace: k.namespace,
      phase: k.phase,
      size: k.size,
      description: null,
      labels: ensureEnvLabel(null),
      profile: null,
    })
  }

  return rows
}

export type EnvGroup = { env: string; rows: ClusterRow[] }

/**
 * Group rows by their (lower-cased) ``env`` label and order the resulting
 * groups by ``ENV_PRIORITY``. Within a group, rows sort by display name.
 */
export function groupByEnv(rows: ClusterRow[]): EnvGroup[] {
  const groups = new Map<string, ClusterRow[]>()
  for (const row of rows) {
    const env = (row.labels[ENV_LABEL_KEY] ?? DEFAULT_ENV_VALUE).toLowerCase()
    const list = groups.get(env)
    if (list) {
      list.push(row)
    } else {
      groups.set(env, [row])
    }
  }
  return Array.from(groups.entries())
    .map(([env, items]) => ({
      env,
      rows: items.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }))
    .sort((a, b) => compareEnv(a.env, b.env))
}
