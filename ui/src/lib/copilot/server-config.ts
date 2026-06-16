/**
 * Server-side resolution of the embedded AI copilot configuration.
 *
 * The copilot is OFF unless the deployment explicitly provides a model and
 * the matching provider API key. Misconfiguration (model without key, key
 * without model, unknown provider) logs a warning once and resolves to
 * disabled — it must never fail the container.
 *
 * Env contract (web container only — keys never reach the browser):
 *   COPILOT_ENABLED       "false" force-disables; any other value defers to
 *                         model+key presence (default: enabled when usable)
 *   COPILOT_MODEL         "<provider>/<model>", e.g. "anthropic/claude-sonnet-4-5"
 *                         or "openai/gpt-4o"
 *   COPILOT_BASE_URL      optional — overrides the provider endpoint so the
 *                         OpenAI/Anthropic-compatible client targets a gateway
 *                         instead of the public API — e.g. a self-hosted or
 *                         enterprise OpenAI-compatible LLM gateway
 *                         (COPILOT_MODEL=openai/<model>,
 *                         COPILOT_BASE_URL=https://llm-gateway.example.com).
 *                         Unset → the provider's default public endpoint.
 *   ANTHROPIC_API_KEY     required for anthropic/* models
 *   OPENAI_API_KEY        required for openai/* models
 *   COPILOT_REQUIRE_AUTH  "true" → /copilotkit requires a Bearer token
 *                         (see verify-jwt.ts for signature verification)
 */

export type CopilotProvider = "anthropic" | "openai"

export interface CopilotServerConfig {
  enabled: boolean
  /** Provider parsed from COPILOT_MODEL, when usable. */
  provider: CopilotProvider | null
  /** Model id without the provider prefix, when usable. */
  modelId: string | null
  /**
   * Custom endpoint from COPILOT_BASE_URL (OpenAI/Anthropic-compatible
   * gateway). null → the provider default endpoint.
   */
  baseUrl: string | null
  /** Human-readable reason when disabled (logged, never sent to clients). */
  reason: string | null
}

let warnedReason: string | null = null

function warnOnce(reason: string): void {
  if (reason !== warnedReason) {
    warnedReason = reason
    console.warn(`[copilot] ${reason}`)
  }
}

function disabled(reason: string | null): CopilotServerConfig {
  // Warn once per distinct misconfiguration, only when the operator clearly
  // tried to turn the feature on.
  if (reason) warnOnce(`disabled: ${reason}`)
  return {
    enabled: false,
    provider: null,
    modelId: null,
    baseUrl: null,
    reason,
  }
}

/**
 * Optional gateway endpoint. Trailing slashes are trimmed (the AI SDK appends
 * the route path). A non-empty value that is not http(s) is ignored with a
 * one-time warning — a malformed base URL must never fail the container.
 */
function resolveBaseUrl(): string | null {
  const raw = (process.env.COPILOT_BASE_URL ?? "").trim()
  if (!raw) return null
  if (!/^https?:\/\//i.test(raw)) {
    warnOnce(
      `COPILOT_BASE_URL=${JSON.stringify(raw)} is not an http(s) URL; ignoring`,
    )
    return null
  }
  return raw.replace(/\/+$/, "")
}

export function resolveCopilotServerConfig(): CopilotServerConfig {
  if (process.env.COPILOT_ENABLED === "false") {
    return {
      enabled: false,
      provider: null,
      modelId: null,
      baseUrl: null,
      reason: null,
    }
  }

  const model = process.env.COPILOT_MODEL ?? ""
  const hasAnyKey =
    !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY

  if (!model) {
    return disabled(
      hasAnyKey
        ? "an LLM API key is set but COPILOT_MODEL is missing " +
            "(expected <provider>/<model>, e.g. anthropic/claude-sonnet-4-5)"
        : null,
    )
  }

  const slash = model.indexOf("/")
  const provider = slash > 0 ? model.slice(0, slash) : ""
  const modelId = slash > 0 ? model.slice(slash + 1) : ""
  if (!modelId || (provider !== "anthropic" && provider !== "openai")) {
    return disabled(
      `COPILOT_MODEL=${JSON.stringify(model)} is not supported ` +
        "(expected anthropic/<model> or openai/<model>)",
    )
  }

  const keyVar =
    provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"
  if (!process.env[keyVar]) {
    return disabled(
      `COPILOT_MODEL targets ${provider} but ${keyVar} is not set`,
    )
  }

  return {
    enabled: true,
    provider,
    modelId,
    baseUrl: resolveBaseUrl(),
    reason: null,
  }
}

export function copilotRequiresAuth(): boolean {
  return process.env.COPILOT_REQUIRE_AUTH === "true"
}
