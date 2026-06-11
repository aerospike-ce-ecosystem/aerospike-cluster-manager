/**
 * Runtime feature probe for the embedded AI copilot.
 *
 * The browser fetches this before mounting any CopilotKit code; deployments
 * without an LLM key (the self-hosted default) get `{ enabled: false }` and
 * the UI renders byte-identical to a build without the feature.
 *
 * Deliberately NOT under /api/ — proxy.js forwards /api/* to FastAPI in
 * production, so this must live where the Next.js standalone server serves it.
 */

import { resolveCopilotServerConfig } from "@/lib/copilot/server-config"

export const dynamic = "force-dynamic"

export async function GET() {
  const config = resolveCopilotServerConfig()
  return Response.json({ enabled: config.enabled })
}
