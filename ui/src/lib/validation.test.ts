import { describe, expect, it } from "vitest"

import { validateBinName } from "./validation"

describe("validateBinName", () => {
  it("rejects empty name", () => {
    expect(validateBinName("")).toMatch(/required/)
  })

  it("rejects name longer than 15 chars", () => {
    expect(validateBinName("x".repeat(16))).toMatch(/at most 15/)
  })

  it("accepts max-length boundary (15 chars)", () => {
    expect(validateBinName("x".repeat(15))).toBeNull()
  })

  it("rejects leading whitespace", () => {
    expect(validateBinName(" bin")).toMatch(/whitespace/)
  })

  it("rejects trailing whitespace", () => {
    expect(validateBinName("bin ")).toMatch(/whitespace/)
  })

  it("rejects control character (NUL)", () => {
    expect(validateBinName("bad\x00name")).toMatch(/control characters/)
  })

  it("rejects DEL character (0x7F)", () => {
    expect(validateBinName("bad\x7fname")).toMatch(/control characters/)
  })

  it("accepts a valid bin name", () => {
    expect(validateBinName("age")).toBeNull()
  })

  it("accepts the PK placeholder sentinel", () => {
    // ``__pk__`` is the bin sentinel used by FilterCondition PK operators
    // and must round-trip through this validator unchanged.
    expect(validateBinName("__pk__")).toBeNull()
  })
})
