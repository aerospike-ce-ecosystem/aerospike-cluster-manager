// @vitest-environment node
import { exportJWK, generateKeyPair, SignJWT } from "jose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { assertCopilotAuth, resetJwksCache } from "./verify-jwt"

const ISSUER = "https://keycloak.test/realms/acko"
const AUDIENCE = "acko-api"

function requestWithAuth(header?: string): Request {
  return new Request("http://web.test/copilotkit/agent/default/run", {
    method: "POST",
    headers: header ? { Authorization: header } : {},
  })
}

async function expectStatus(promise: Promise<void>, status: number) {
  try {
    await promise
    expect.unreachable(`expected a thrown Response(${status})`)
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(status)
  }
}

beforeEach(() => {
  resetJwksCache()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("assertCopilotAuth — bearer presence", () => {
  it("rejects a missing Authorization header with 401", async () => {
    await expectStatus(assertCopilotAuth(requestWithAuth()), 401)
  })

  it("rejects a non-bearer Authorization header with 401", async () => {
    await expectStatus(assertCopilotAuth(requestWithAuth("Basic abc")), 401)
  })

  it("rejects an empty bearer token with 401", async () => {
    await expectStatus(assertCopilotAuth(requestWithAuth("Bearer ")), 401)
  })

  it("accepts any bearer token in presence-only mode (no issuer)", async () => {
    vi.stubEnv("COPILOT_OIDC_ISSUER_URL", "")
    await expect(
      assertCopilotAuth(requestWithAuth("Bearer anything")),
    ).resolves.toBeUndefined()
  })
})

describe("assertCopilotAuth — JWKS signature verification", () => {
  async function setUpIssuer() {
    const { publicKey, privateKey } = await generateKeyPair("RS256", {
      modulusLength: 2048,
    })
    const jwk = await exportJWK(publicKey)
    jwk.alg = "RS256"
    jwk.use = "sig"
    jwk.kid = "test-key"

    vi.stubEnv("COPILOT_OIDC_ISSUER_URL", ISSUER)
    vi.stubEnv("COPILOT_OIDC_AUDIENCE", AUDIENCE)
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === `${ISSUER}/.well-known/openid-configuration`) {
          return Response.json({ jwks_uri: `${ISSUER}/certs` })
        }
        if (url === `${ISSUER}/certs`) {
          return Response.json({ keys: [jwk] })
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )
    return privateKey
  }

  async function signToken(
    privateKey: CryptoKey,
    claims: { issuer?: string; audience?: string; expiresIn?: string },
  ) {
    return new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(claims.issuer ?? ISSUER)
      .setAudience(claims.audience ?? AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(claims.expiresIn ?? "5m")
      .sign(privateKey)
  }

  it("accepts a token signed by the issuer's JWKS", async () => {
    const privateKey = await setUpIssuer()
    const token = await signToken(privateKey, {})
    await expect(
      assertCopilotAuth(requestWithAuth(`Bearer ${token}`)),
    ).resolves.toBeUndefined()
  })

  it("rejects a token with the wrong issuer", async () => {
    const privateKey = await setUpIssuer()
    const token = await signToken(privateKey, {
      issuer: "https://evil.test/realms/acko",
    })
    await expectStatus(
      assertCopilotAuth(requestWithAuth(`Bearer ${token}`)),
      401,
    )
  })

  it("rejects a token with the wrong audience", async () => {
    const privateKey = await setUpIssuer()
    const token = await signToken(privateKey, { audience: "other-api" })
    await expectStatus(
      assertCopilotAuth(requestWithAuth(`Bearer ${token}`)),
      401,
    )
  })

  it("rejects a token signed by a different key", async () => {
    await setUpIssuer()
    const { privateKey: foreignKey } = await generateKeyPair("RS256", {
      modulusLength: 2048,
    })
    const token = await signToken(foreignKey, {})
    await expectStatus(
      assertCopilotAuth(requestWithAuth(`Bearer ${token}`)),
      401,
    )
  })

  it("rejects garbage tokens with 401", async () => {
    await setUpIssuer()
    await expectStatus(
      assertCopilotAuth(requestWithAuth("Bearer not.a.jwt")),
      401,
    )
  })
})
