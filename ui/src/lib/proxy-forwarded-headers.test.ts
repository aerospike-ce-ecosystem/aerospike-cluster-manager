// @vitest-environment node
/**
 * Tests for the forwarded-header normalisation in `ui/proxy.js` (#473).
 *
 * `proxy.js` is CommonJS and lives at the ui root because the Dockerfile
 * copies it beside the Next.js standalone bundle. It guards its side effects
 * behind `require.main === module`, so requiring it here spawns nothing and
 * binds no port — see the comment at the bottom of that file.
 */
import { createRequire } from "node:module"

import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const { buildForwardedHeaders, normalizeAddress } =
  require("../../proxy.js") as {
    buildForwardedHeaders: (
      req: {
        headers: Record<string, string>
        socket: { remoteAddress?: string }
      },
      options?: { dropHost?: boolean },
    ) => Record<string, string>
    normalizeAddress: (address: unknown) => string | null
  }

function request(
  headers: Record<string, string>,
  remoteAddress: string | undefined = "203.0.113.9",
) {
  return { headers, socket: { remoteAddress } }
}

describe("normalizeAddress", () => {
  it("unwraps an IPv4-mapped IPv6 literal", () => {
    // Node reports a dual-stack IPv4 peer this way. Python's ipaddress parses
    // it as IPv6, so it would not match a TRUSTED_PROXIES entry of 10.0.0.0/8
    // and the trust check would silently fail.
    expect(normalizeAddress("::ffff:10.0.0.5")).toBe("10.0.0.5")
  })

  it("leaves a real IPv6 address alone", () => {
    expect(normalizeAddress("2001:db8::1")).toBe("2001:db8::1")
  })

  it("leaves a plain IPv4 address alone", () => {
    expect(normalizeAddress("10.0.0.5")).toBe("10.0.0.5")
  })

  it("returns null for a missing address", () => {
    expect(normalizeAddress(undefined)).toBeNull()
    expect(normalizeAddress("")).toBeNull()
  })
})

describe("buildForwardedHeaders (#473)", () => {
  it("sets X-Forwarded-For from the real socket address", () => {
    // Without this the API saw the web pod as the peer for every request, so
    // with TRUSTED_PROXIES empty (the default) the whole team shared one
    // 60/min bucket.
    const headers = buildForwardedHeaders(request({}, "203.0.113.9"))
    expect(headers["x-forwarded-for"]).toBe("203.0.113.9")
    expect(headers["x-real-ip"]).toBe("203.0.113.9")
  })

  it("REPLACES a forged inbound X-Forwarded-For", () => {
    // The heart of the issue: the old code copied headers verbatim, so adding
    // the web pod to TRUSTED_PROXIES — the documented remedy — would have made
    // the bucket key caller-controlled.
    const headers = buildForwardedHeaders(
      request({ "x-forwarded-for": "1.2.3.4" }, "203.0.113.9"),
    )
    expect(headers["x-forwarded-for"]).toBe("203.0.113.9")
    expect(headers["x-forwarded-for"]).not.toContain("1.2.3.4")
  })

  it("replaces a forged inbound X-Real-IP too", () => {
    const headers = buildForwardedHeaders(
      request({ "x-real-ip": "1.2.3.4" }, "203.0.113.9"),
    )
    expect(headers["x-real-ip"]).toBe("203.0.113.9")
  })

  it("drops a forged header supplied under different casing", () => {
    // Node lower-cases incoming header names, but the object is ours to
    // mutate and a mixed-case key would otherwise survive the delete and be
    // sent alongside the one we set.
    const headers = buildForwardedHeaders(
      request(
        { "X-Forwarded-For": "1.2.3.4", "X-Real-IP": "5.6.7.8" },
        "203.0.113.9",
      ),
    )
    const values = Object.entries(headers)
      .filter(
        ([k]) =>
          k.toLowerCase().startsWith("x-forwarded-for") ||
          k.toLowerCase() === "x-real-ip",
      )
      .map(([, v]) => v)
    expect(values).toEqual(["203.0.113.9", "203.0.113.9"])
  })

  it("does not append to a multi-hop chain the client claims", () => {
    // This proxy IS the edge. An inbound chain is a claim, not a hop record.
    const headers = buildForwardedHeaders(
      request({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }, "203.0.113.9"),
    )
    expect(headers["x-forwarded-for"]).toBe("203.0.113.9")
  })

  it("normalises an IPv4-mapped peer before forwarding", () => {
    const headers = buildForwardedHeaders(request({}, "::ffff:10.0.0.5"))
    expect(headers["x-forwarded-for"]).toBe("10.0.0.5")
  })

  it("still strips the forged header when the socket address is unavailable", () => {
    // Better to send nothing (API falls back to the peer) than to forward a
    // value the caller chose. Built inline rather than via `request` so the
    // default parameter cannot fill the address back in.
    const headers = buildForwardedHeaders({
      headers: { "x-forwarded-for": "1.2.3.4" },
      socket: {},
    })
    expect(headers["x-forwarded-for"]).toBeUndefined()
    expect(headers["x-real-ip"]).toBeUndefined()
  })

  it("passes every other header through untouched", () => {
    const headers = buildForwardedHeaders(
      request({
        authorization: "Bearer abc",
        "content-type": "application/json",
      }),
    )
    expect(headers.authorization).toBe("Bearer abc")
    expect(headers["content-type"]).toBe("application/json")
  })

  it("keeps host by default and drops it when asked", () => {
    // proxyToApi drops host (the upstream is a different origin); proxyToNext
    // keeps it, because Next.js routes on it.
    expect(
      buildForwardedHeaders(request({ host: "ui.example.com" })).host,
    ).toBe("ui.example.com")
    expect(
      buildForwardedHeaders(request({ host: "ui.example.com" }), {
        dropHost: true,
      }).host,
    ).toBeUndefined()
  })
})
