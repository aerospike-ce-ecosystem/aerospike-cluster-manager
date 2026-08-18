// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  checkCopilotRateLimit,
  copilotRateLimitKey,
  copilotRateLimits,
  resetCopilotRateLimit,
} from "./rate-limit"

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request("http://web.test/copilotkit/agent/default/run", {
    method: "POST",
    headers,
  })
}

/** Charge `n` requests and return the responses (null = allowed). */
function drain(key: string, n: number, now = 1_000): (number | null)[] {
  return Array.from({ length: n }, () => checkCopilotRateLimit(key, now))
}

beforeEach(() => {
  resetCopilotRateLimit()
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetCopilotRateLimit()
})

describe("copilotRateLimitKey", () => {
  it("uses the leftmost X-Forwarded-For hop", () => {
    const req = requestWithHeaders({
      "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2",
    })
    expect(copilotRateLimitKey(req)).toBe("203.0.113.5")
  })

  it("falls back to X-Real-IP", () => {
    expect(
      copilotRateLimitKey(requestWithHeaders({ "x-real-ip": "198.51.100.7" })),
    ).toBe("198.51.100.7")
  })

  it("collapses unattributable requests into one shared bucket", () => {
    // Conservative on purpose: traffic we cannot attribute must not each get
    // its own allowance.
    expect(copilotRateLimitKey(requestWithHeaders({}))).toBe("unattributed")
  })
})

describe("per-key budget", () => {
  it("allows up to the limit then rejects", () => {
    vi.stubEnv("COPILOT_RATE_LIMIT_PER_MINUTE", "3")
    const results = drain("client-a", 4)
    expect(results.slice(0, 3)).toEqual([null, null, null])
    expect(results[3]).toBeGreaterThan(0)
  })

  it("keeps separate clients independent", () => {
    vi.stubEnv("COPILOT_RATE_LIMIT_PER_MINUTE", "2")
    expect(drain("client-a", 3).at(-1)).toBeGreaterThan(0)
    // client-b is untouched by client-a exhausting their own bucket.
    expect(checkCopilotRateLimit("client-b", 1_000)).toBeNull()
  })

  it("rolls over after the window", () => {
    vi.stubEnv("COPILOT_RATE_LIMIT_PER_MINUTE", "1")
    expect(checkCopilotRateLimit("client-a", 1_000)).toBeNull()
    expect(checkCopilotRateLimit("client-a", 1_000)).toBeGreaterThan(0)
    expect(checkCopilotRateLimit("client-a", 1_000 + 60_000)).toBeNull()
  })

  it("reports a usable Retry-After", () => {
    vi.stubEnv("COPILOT_RATE_LIMIT_PER_MINUTE", "1")
    checkCopilotRateLimit("client-a", 0)
    // 30s into a 60s window → ~30s left.
    expect(checkCopilotRateLimit("client-a", 30_000)).toBe(30)
  })
})

describe("global budget", () => {
  it("bounds total spend even when the caller rotates keys", () => {
    // The scenario the global budget exists for: X-Forwarded-For is
    // caller-supplied until proxy.js overwrites it (#473), so per-key alone
    // would be trivially defeated by minting a fresh key per request.
    vi.stubEnv("COPILOT_RATE_LIMIT_PER_MINUTE", "1000")
    vi.stubEnv("COPILOT_GLOBAL_RATE_LIMIT_PER_MINUTE", "5")

    const results = Array.from({ length: 8 }, (_, i) =>
      checkCopilotRateLimit(`spoofed-${i}`, 1_000),
    )

    expect(results.slice(0, 5)).toEqual([null, null, null, null, null])
    expect(results.slice(5).every((r) => typeof r === "number" && r > 0)).toBe(
      true,
    )
  })

  it("does not let a rejected caller consume global headroom", () => {
    // Both budgets are checked before either is charged. Charging as we go
    // would let one hammered key exhaust everyone's budget without a single
    // request reaching the LLM.
    vi.stubEnv("COPILOT_RATE_LIMIT_PER_MINUTE", "1")
    vi.stubEnv("COPILOT_GLOBAL_RATE_LIMIT_PER_MINUTE", "10")

    // client-a burns its single allowance, then bounces 20 times.
    checkCopilotRateLimit("client-a", 1_000)
    for (let i = 0; i < 20; i += 1) {
      expect(checkCopilotRateLimit("client-a", 1_000)).toBeGreaterThan(0)
    }

    // 9 of the 10 global slots must still be there for everyone else.
    const others = Array.from({ length: 9 }, (_, i) =>
      checkCopilotRateLimit(`client-${i}`, 1_000),
    )
    expect(others).toEqual(Array(9).fill(null))
  })
})

describe("limit configuration", () => {
  it("defaults to 60 per key and 300 globally", () => {
    vi.stubEnv("COPILOT_RATE_LIMIT_PER_MINUTE", undefined)
    vi.stubEnv("COPILOT_GLOBAL_RATE_LIMIT_PER_MINUTE", undefined)
    expect(copilotRateLimits()).toEqual({
      perKeyPerMinute: 60,
      globalPerMinute: 300,
    })
  })

  it.each(["0", "-1", "abc", "", " "])(
    "falls back to the default for %j rather than disabling the limit",
    (value) => {
      vi.stubEnv("COPILOT_RATE_LIMIT_PER_MINUTE", value)
      expect(copilotRateLimits().perKeyPerMinute).toBe(60)
    },
  )
})
