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
  /** Human-readable reason when disabled (logged, never sent to clients). */
  reason: string | null
}

let warnedReason: string | null = null

function disabled(reason: string | null): CopilotServerConfig {
  // Warn once per distinct misconfiguration, only when the operator clearly
  // tried to turn the feature on.
  if (reason && reason !== warnedReason) {
    warnedReason = reason
    console.warn(`[copilot] disabled: ${reason}`)
  }
  return { enabled: false, provider: null, modelId: null, reason }
}

export function resolveCopilotServerConfig(): CopilotServerConfig {
  if (process.env.COPILOT_ENABLED === "false") {
    return { enabled: false, provider: null, modelId: null, reason: null }
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

  return { enabled: true, provider, modelId, reason: null }
}

export function copilotRequiresAuth(): boolean {
  return process.env.COPILOT_REQUIRE_AUTH === "true"
}
