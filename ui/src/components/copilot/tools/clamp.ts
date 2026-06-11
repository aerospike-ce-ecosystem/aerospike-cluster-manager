/**
 * Result clamping for copilot read tools.
 *
 * Tool results become LLM context and transit to the configured LLM provider.
 * Clamping bounds both context stuffing and data egress: at most
 * MAX_RESULT_ROWS records per result, and oversized bin values are truncated.
 */

import type { AerospikeRecord, BinValue } from "@/lib/types/record"

export const MAX_RESULT_ROWS = 20
export const MAX_BIN_CHARS = 256

export interface ClampedRecords {
  records: AerospikeRecord[]
  /** Rows dropped beyond MAX_RESULT_ROWS (0 when nothing was dropped). */
  truncatedRows: number
  /** True when at least one bin value was shortened. */
  truncatedBins: boolean
}

function clampBin(value: BinValue): { value: BinValue; truncated: boolean } {
  if (typeof value === "string" && value.length > MAX_BIN_CHARS) {
    return {
      value: `${value.slice(0, MAX_BIN_CHARS)}… [truncated]`,
      truncated: true,
    }
  }
  if (value !== null && typeof value === "object") {
    const json = JSON.stringify(value)
    if (json.length > MAX_BIN_CHARS) {
      return {
        value: `${json.slice(0, MAX_BIN_CHARS)}… [truncated]`,
        truncated: true,
      }
    }
  }
  return { value, truncated: false }
}

export function clampRecords(records: AerospikeRecord[]): ClampedRecords {
  const kept = records.slice(0, MAX_RESULT_ROWS)
  let truncatedBins = false
  const clamped = kept.map((record) => {
    const bins: Record<string, BinValue> = {}
    for (const [name, value] of Object.entries(record.bins)) {
      const result = clampBin(value)
      truncatedBins ||= result.truncated
      bins[name] = result.value
    }
    return { ...record, bins }
  })
  return {
    records: clamped,
    truncatedRows: Math.max(0, records.length - MAX_RESULT_ROWS),
    truncatedBins,
  }
}

/** Clamp a requested page size / record limit into [1, MAX_RESULT_ROWS]. */
export function clampLimit(requested: number | undefined): number {
  if (!requested || !Number.isFinite(requested)) return MAX_RESULT_ROWS
  return Math.min(Math.max(1, Math.floor(requested)), MAX_RESULT_ROWS)
}
