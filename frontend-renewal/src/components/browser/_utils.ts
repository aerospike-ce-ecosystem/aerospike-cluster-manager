// NOTE(stream-a): inline until Stream E merges — minimal ports of
// frontend/src/lib/{bin-utils,bin-type-detector,formatters,utils}.ts
// that the record browser dialogs / cells need. Delete this file and
// migrate to `@/lib/*` once Stream E lands canonical versions.

import type { BinType } from "@/lib/constants"
import type { BinDataType } from "@/lib/types/query"
import type { AerospikeRecord, BinValue } from "@/lib/types/record"

/* ─── ids ───────────────────────────────────────────── */

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/* ─── errors ────────────────────────────────────────── */

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  return "Unknown error"
}

/* ─── bin value editing ─────────────────────────────── */

export interface BinEntry {
  id: string
  name: string
  value: string
  type: BinType
}

export function parseBinValue(value: string, type: BinType): BinValue {
  switch (type) {
    case "integer": {
      const n = parseInt(value, 10)
      return isNaN(n) ? 0 : n
    }
    case "float": {
      const f = parseFloat(value)
      return isNaN(f) ? 0 : f
    }
    case "bool":
      return value.toLowerCase() === "true"
    case "list":
    case "map":
    case "geojson":
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    case "bytes":
      return value
    default:
      return value
  }
}

export function detectBinType(value: BinValue | undefined): BinType {
  if (value === null || value === undefined) return "string"
  if (typeof value === "boolean") return "bool"
  if (typeof value === "number")
    return Number.isInteger(value) ? "integer" : "float"
  if (Array.isArray(value)) return "list"
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    if ("type" in obj && "coordinates" in obj) return "geojson"
    return "map"
  }
  return "string"
}

export function serializeBinValue(value: BinValue): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value, null, 2)
  return String(value)
}

export function createEmptyBinEntry(): BinEntry {
  return { id: uuid(), name: "", value: "", type: "string" }
}

export function buildBinEntriesFromRecord(record: AerospikeRecord): BinEntry[] {
  return Object.entries(record.bins).map(([name, value]) => ({
    id: uuid(),
    name,
    value: serializeBinValue(value),
    type: detectBinType(value),
  }))
}

/* ─── per-page bin-type detection (for filter column types) ── */

export function detectBinTypes(
  records: AerospikeRecord[],
): Record<string, BinDataType> {
  const types: Record<string, BinDataType> = {}
  for (const record of records) {
    for (const [bin, value] of Object.entries(record.bins)) {
      if (types[bin]) continue
      if (value === null || value === undefined) continue

      if (typeof value === "boolean") {
        types[bin] = "bool"
      } else if (typeof value === "number") {
        types[bin] = Number.isInteger(value) ? "integer" : "float"
      } else if (typeof value === "string") {
        types[bin] = "string"
      } else if (Array.isArray(value)) {
        types[bin] = "list"
      } else if (typeof value === "object") {
        const obj = value as Record<string, unknown>
        if ("type" in obj && "coordinates" in obj) {
          types[bin] = "geo"
        } else {
          types[bin] = "map"
        }
      }
    }
  }
  return types
}

/* ─── formatters ────────────────────────────────────── */

export const NEVER_EXPIRE_TTL = 4_294_967_295

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatTTLAsExpiry(
  ttl: number,
  includeSeconds = false,
): string {
  if (ttl === -1 || ttl === NEVER_EXPIRE_TTL) return "Never"
  if (ttl === 0) return "Default"

  const expiry = new Date(Date.now() + ttl * 1000)
  const y = expiry.getFullYear()
  const mo = String(expiry.getMonth() + 1).padStart(2, "0")
  const d = String(expiry.getDate()).padStart(2, "0")
  const h = String(expiry.getHours()).padStart(2, "0")
  const mi = String(expiry.getMinutes()).padStart(2, "0")
  if (!includeSeconds) return `${y}-${mo}-${d} ${h}:${mi}`
  const s = String(expiry.getSeconds()).padStart(2, "0")
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`
}

export function formatTTLHuman(ttl: number): string {
  if (ttl === -1 || ttl === NEVER_EXPIRE_TTL) return "Never expires"
  if (ttl === 0) return "Default namespace TTL"
  return formatUptime(ttl)
}

export function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  const half = Math.floor((maxLen - 3) / 2)
  return `${str.slice(0, half)}...${str.slice(-half)}`
}
