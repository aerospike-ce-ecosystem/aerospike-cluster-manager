import type { AerospikeNamespaceConfig } from "@/lib/types/k8s"

export const CE_LIMITS = {
  MAX_NODES: 8,
  MAX_CE_NAMESPACES: 2,
} as const

export const AEROSPIKE_IMAGES = ["aerospike:ce-8.1.1.1"] as const

const K8S_NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
const CPU_RE = /^[0-9]+(\.[0-9]+)?m?$/
const MEM_RE = /^[0-9]+(\.[0-9]+)?[KMGTPE]i$/

export function validateK8sName(value: string): string | null {
  if (!value) return "Name is required"
  if (value.length > 63) return "Name must be 63 characters or less"
  if (!K8S_NAME_RE.test(value))
    return "Must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric"
  return null
}

export function validateK8sCpu(value: string): string | null {
  if (!value) return "CPU is required"
  if (!CPU_RE.test(value))
    return "Invalid CPU format (e.g., '500m', '1', '2.5')"
  return null
}

export function validateK8sMemory(value: string): string | null {
  if (!value) return "Memory is required"
  if (!MEM_RE.test(value))
    return "Invalid memory format (e.g., '512Mi', '1Gi', '4Gi')"
  return null
}

export function validateImageNotEnterprise(image: string): string | null {
  if (image.toLowerCase().includes("enterprise"))
    return "Enterprise images are not supported (CE only)"
  return null
}

export function parseCpuMillis(cpu: string): number {
  if (cpu.endsWith("m")) return parseFloat(cpu.slice(0, -1))
  return parseFloat(cpu) * 1000
}

const MEMORY_UNITS: Record<string, number> = {
  Ki: 1,
  Mi: 2,
  Gi: 3,
  Ti: 4,
  Pi: 5,
  Ei: 6,
}

export function parseMemoryBytes(mem: string): number {
  const m = mem.match(/^([0-9]+(?:\.[0-9]+)?)([KMGTPE]i)$/)
  if (!m) return 0
  const unit = m[2]
  return parseFloat(m[1]) * Math.pow(1024, MEMORY_UNITS[unit] ?? 0)
}

export function validateNamespaces(
  namespaces: AerospikeNamespaceConfig[],
  clusterSize: number,
): string | null {
  if (namespaces.length === 0) return "At least one namespace is required"
  if (namespaces.length > CE_LIMITS.MAX_CE_NAMESPACES)
    return `Aerospike CE supports at most ${CE_LIMITS.MAX_CE_NAMESPACES} namespaces`
  const names = namespaces.map((ns) => (ns.name ?? "").trim())
  if (names.some((n) => n.length === 0))
    return "All namespace names are required"
  if (new Set(names).size !== names.length)
    return "Namespace names must be unique"
  for (const ns of namespaces) {
    const rf = ns.replicationFactor ?? 1
    if (rf > clusterSize)
      return `Namespace "${ns.name ?? ""}" replication factor (${rf}) exceeds cluster size (${clusterSize})`
  }
  return null
}
