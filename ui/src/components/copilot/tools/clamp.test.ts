import { describe, expect, it } from "vitest"

import type { AerospikeRecord } from "@/lib/types/record"

import {
  clampLimit,
  clampRecords,
  MAX_BIN_CHARS,
  MAX_RESULT_ROWS,
} from "./clamp"

function makeRecord(
  pk: string,
  bins: Record<string, unknown>,
): AerospikeRecord {
  return {
    key: { namespace: "test", set: "s", pk },
    meta: { generation: 1, ttl: -1 },
    bins,
  }
}

describe("clampLimit", () => {
  it("defaults to the maximum when unset", () => {
    expect(clampLimit(undefined)).toBe(MAX_RESULT_ROWS)
  })

  it("clamps requests above the maximum", () => {
    expect(clampLimit(10_000)).toBe(MAX_RESULT_ROWS)
  })

  it("floors and lower-bounds invalid values", () => {
    expect(clampLimit(0)).toBe(MAX_RESULT_ROWS)
    expect(clampLimit(-5)).toBe(1)
    expect(clampLimit(3.9)).toBe(3)
  })
})

describe("clampRecords", () => {
  it("keeps at most MAX_RESULT_ROWS records and reports the rest", () => {
    const records = Array.from({ length: MAX_RESULT_ROWS + 7 }, (_, i) =>
      makeRecord(`pk-${i}`, { value: i }),
    )
    const clamped = clampRecords(records)
    expect(clamped.records).toHaveLength(MAX_RESULT_ROWS)
    expect(clamped.truncatedRows).toBe(7)
  })

  it("truncates oversized string bins", () => {
    const clamped = clampRecords([
      makeRecord("pk", { big: "x".repeat(MAX_BIN_CHARS * 2), small: "ok" }),
    ])
    const bins = clamped.records[0].bins
    expect(String(bins.big)).toHaveLength(
      MAX_BIN_CHARS + "… [truncated]".length,
    )
    expect(bins.small).toBe("ok")
    expect(clamped.truncatedBins).toBe(true)
  })

  it("truncates oversized nested objects via JSON length", () => {
    const clamped = clampRecords([
      makeRecord("pk", { nested: { data: "y".repeat(MAX_BIN_CHARS * 2) } }),
    ])
    expect(typeof clamped.records[0].bins.nested).toBe("string")
    expect(String(clamped.records[0].bins.nested)).toContain("[truncated]")
  })

  it("leaves small payloads untouched", () => {
    const clamped = clampRecords([makeRecord("pk", { n: 42, s: "hi" })])
    expect(clamped.records[0].bins).toEqual({ n: 42, s: "hi" })
    expect(clamped.truncatedRows).toBe(0)
    expect(clamped.truncatedBins).toBe(false)
  })
})
