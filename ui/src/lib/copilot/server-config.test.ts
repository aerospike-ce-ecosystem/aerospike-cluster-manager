import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resolveCopilotServerConfig } from "./server-config"

const ENV_KEYS = [
  "COPILOT_ENABLED",
  "COPILOT_MODEL",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
] as const

beforeEach(() => {
  // The host shell may export real LLM keys — neutralize them first.
  for (const key of ENV_KEYS) vi.stubEnv(key, "")
  // Misconfiguration warnings are expected output of disabled(); silence
  // them so test logs stay clean (warn-once behavior is per-reason and
  // module-global, so individual tests can't assert call counts reliably).
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("resolveCopilotServerConfig", () => {
  it("is disabled by default (no model, no key)", () => {
    expect(resolveCopilotServerConfig().enabled).toBe(false)
  })

  it("enables anthropic models when the anthropic key is present", () => {
    vi.stubEnv("COPILOT_MODEL", "anthropic/claude-sonnet-4-5")
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test")
    const config = resolveCopilotServerConfig()
    expect(config.enabled).toBe(true)
    expect(config.provider).toBe("anthropic")
    expect(config.modelId).toBe("claude-sonnet-4-5")
  })

  it("enables openai models when the openai key is present", () => {
    vi.stubEnv("COPILOT_MODEL", "openai/gpt-4o")
    vi.stubEnv("OPENAI_API_KEY", "sk-test")
    expect(resolveCopilotServerConfig().enabled).toBe(true)
  })

  it("stays disabled when the model targets a provider without a key", () => {
    vi.stubEnv("COPILOT_MODEL", "anthropic/claude-sonnet-4-5")
    vi.stubEnv("OPENAI_API_KEY", "sk-test")
    const config = resolveCopilotServerConfig()
    expect(config.enabled).toBe(false)
    expect(config.reason).toContain("ANTHROPIC_API_KEY")
  })

  it("stays disabled for unsupported providers", () => {
    vi.stubEnv("COPILOT_MODEL", "google/gemini-2.5-pro")
    expect(resolveCopilotServerConfig().enabled).toBe(false)
  })

  it("COPILOT_ENABLED=false force-disables even with model and key", () => {
    vi.stubEnv("COPILOT_ENABLED", "false")
    vi.stubEnv("COPILOT_MODEL", "anthropic/claude-sonnet-4-5")
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test")
    expect(resolveCopilotServerConfig().enabled).toBe(false)
  })

  it("reports a reason when a key is set but the model is missing", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test")
    const config = resolveCopilotServerConfig()
    expect(config.enabled).toBe(false)
    expect(config.reason).toContain("COPILOT_MODEL")
  })
})
