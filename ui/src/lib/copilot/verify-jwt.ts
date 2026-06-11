/**
 * Keycloak JWT verification for the copilot runtime endpoint.
 *
 * Purpose: gate LLM spend, not data. Every tool call the copilot makes is an
 * ordinary browser fetch to the FastAPI backend carrying the user's live
 * Keycloak JWT, where OIDCAuthMiddleware + the workspace ACL authorize it —
 * exactly as if the user clicked the UI. This module only prevents an
 * unauthenticated caller from burning LLM tokens through /copilotkit.
 *
 * Modes (COPILOT_REQUIRE_AUTH=true):
 *   - COPILOT_OIDC_ISSUER_URL set → full signature verification against the
 *     issuer's JWKS (discovered via OIDC metadata, cached per process), plus
 *     issuer and optional audience (COPILOT_OIDC_AUDIENCE) checks.
 *   - issuer unset → Bearer-presence check only, with a one-time warning
 *     (useful for deployments that terminate auth in front of the web pod).
 */

import { createRemoteJWKSet, jwtVerify } from "jose"

type JWKSResolver = ReturnType<typeof createRemoteJWKSet>

let jwks: JWKSResolver | null = null
let jwksIssuer: string | null = null
let warnedPresenceOnly = false

async function getJwks(issuer: string): Promise<JWKSResolver> {
  if (jwks && jwksIssuer === issuer) return jwks
  const metadataUrl = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`
  // Fail fast when the IdP is unreachable instead of stalling the request
  // until the runtime's own timeout fires.
  const res = await fetch(metadataUrl, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) {
    throw new Error(`OIDC metadata fetch failed: ${res.status} ${metadataUrl}`)
  }
  const metadata = (await res.json()) as { jwks_uri?: string }
  if (!metadata.jwks_uri) {
    throw new Error(`OIDC metadata has no jwks_uri: ${metadataUrl}`)
  }
  jwks = createRemoteJWKSet(new URL(metadata.jwks_uri))
  jwksIssuer = issuer
  return jwks
}

/** Test seam: drop the cached JWKS resolver. */
export function resetJwksCache(): void {
  jwks = null
  jwksIssuer = null
}

/**
 * Verify the Authorization header of a copilot runtime request.
 * Throws a `Response` (401) when the request must be rejected — the runtime
 * hooks contract short-circuits with a thrown Response.
 */
export async function assertCopilotAuth(request: Request): Promise<void> {
  const header = request.headers.get("authorization") ?? ""
  if (!header.startsWith("Bearer ") || header.length <= 7) {
    throw new Response("Unauthorized", { status: 401 })
  }

  const issuer = process.env.COPILOT_OIDC_ISSUER_URL
  if (!issuer) {
    if (!warnedPresenceOnly) {
      warnedPresenceOnly = true
      console.warn(
        "[copilot] COPILOT_REQUIRE_AUTH=true without COPILOT_OIDC_ISSUER_URL — " +
          "only Bearer presence is checked at /copilotkit; set the issuer to " +
          "enable JWT signature verification",
      )
    }
    return
  }

  const token = header.slice("Bearer ".length)
  try {
    const resolver = await getJwks(issuer)
    await jwtVerify(token, resolver, {
      issuer,
      audience: process.env.COPILOT_OIDC_AUDIENCE || undefined,
    })
  } catch (err) {
    if (err instanceof Response) throw err
    console.warn(
      `[copilot] JWT verification failed: ${err instanceof Error ? err.message : err}`,
    )
    throw new Response("Unauthorized", { status: 401 })
  }
}
