/**
 * Keycloak JWT verification for the copilot runtime endpoint.
 *
 * Purpose: gate LLM spend, not data. Every tool call the copilot makes is an
 * ordinary browser fetch to the FastAPI backend carrying the user's live
 * Keycloak JWT, where OIDCAuthMiddleware + the workspace ACL authorize it —
 * exactly as if the user clicked the UI. This module only prevents an
 * unauthenticated caller from burning LLM tokens through /copilotkit.
 *
 * When auth is required (the default — see `copilotRequiresAuth`),
 * COPILOT_OIDC_ISSUER_URL must be set. The token is then verified against the
 * issuer's JWKS (discovered via OIDC metadata, cached per process), with
 * issuer and optional audience (COPILOT_OIDC_AUDIENCE) checks.
 *
 * With the issuer unset this used to warn and degrade to checking that *some*
 * Bearer token was present — which any non-empty string satisfies, so the gate
 * was decorative (#472). It now refuses to serve instead. A deployment that
 * genuinely terminates auth upstream should say so explicitly with
 * COPILOT_REQUIRE_AUTH=false rather than leave a check installed that does
 * nothing.
 */

import { createRemoteJWKSet, jwtVerify } from "jose"

type JWKSResolver = ReturnType<typeof createRemoteJWKSet>

let jwks: JWKSResolver | null = null
let jwksIssuer: string | null = null
let warnedMisconfigured = false

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

/** Test seam: drop the cached JWKS resolver and the one-time warning latch. */
export function resetJwksCache(): void {
  jwks = null
  jwksIssuer = null
  warnedMisconfigured = false
}

/**
 * Verify the Authorization header of a copilot runtime request.
 * Throws a `Response` (401) when the request must be rejected — the runtime
 * hooks contract short-circuits with a thrown Response.
 */
export async function assertCopilotAuth(request: Request): Promise<void> {
  const issuer = process.env.COPILOT_OIDC_ISSUER_URL
  if (!issuer) {
    // Misconfiguration, not a client failure: no token the caller could
    // present would help, so 401 ("try again with credentials") would be a
    // lie. 503 matches what the route already returns for "this deployment
    // cannot serve copilot", which is exactly the situation.
    if (!warnedMisconfigured) {
      warnedMisconfigured = true
      console.error(
        "[copilot] refusing to serve /copilotkit: auth is required but " +
          "COPILOT_OIDC_ISSUER_URL is unset, so tokens cannot be verified. " +
          "Set the issuer, or set COPILOT_REQUIRE_AUTH=false if an upstream " +
          "layer already authenticates every request.",
      )
    }
    throw new Response("Copilot auth is misconfigured", { status: 503 })
  }

  const header = request.headers.get("authorization") ?? ""
  if (!header.startsWith("Bearer ") || header.length <= 7) {
    throw new Response("Unauthorized", { status: 401 })
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
