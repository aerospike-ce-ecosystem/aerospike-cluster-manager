import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { apiFetch, ApiError } from "./client"
import { useAuthStore } from "@/stores/auth-store"
import { useClusterSelectorStore } from "@/stores/cluster-selector-store"

vi.mock("@/lib/auth/keycloak", () => ({
  refreshToken: vi.fn(),
  login: vi.fn(),
}))

const REGISTRY = {
  defaultClusterId: "dev",
  clusters: [
    {
      id: "dev",
      displayName: "Dev",
      apiUrl: "https://dev-api.example.com",
      labels: { env: "dev" },
    },
  ],
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

beforeEach(() => {
  useAuthStore.setState({
    accessToken: null,
    claims: null,
    refreshing: false,
  })
  useClusterSelectorStore.setState({
    registry: REGISTRY,
    currentClusterId: "dev",
    registryError: null,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("apiFetch (multi-cluster + auth)", () => {
  it("prepends the active cluster apiUrl and attaches Authorization", async () => {
    useAuthStore.setState({ accessToken: "tok-1", claims: null, refreshing: false })

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal("fetch", fetchMock)

    await apiFetch("/clusters")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://dev-api.example.com/api/clusters")
    const headers = new Headers(init.headers as HeadersInit)
    expect(headers.get("Authorization")).toBe("Bearer tok-1")
  })

  it("does not attach Authorization when no token is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal("fetch", fetchMock)

    await apiFetch("/clusters")

    const headers = new Headers(
      fetchMock.mock.calls[0][1].headers as HeadersInit,
    )
    expect(headers.get("Authorization")).toBeNull()
  })

  it("falls back to relative path when registry is null (single-cluster mode)", async () => {
    useClusterSelectorStore.setState({
      registry: null,
      currentClusterId: null,
      registryError: null,
    })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal("fetch", fetchMock)

    await apiFetch("/clusters")

    expect(fetchMock.mock.calls[0][0]).toBe("/api/clusters")
  })

  it("retries once after refreshing on 401", async () => {
    useAuthStore.setState({
      accessToken: "stale",
      claims: null,
      refreshing: false,
    })

    const keycloak = await import("@/lib/auth/keycloak")
    vi.mocked(keycloak.refreshToken).mockImplementation(async () => {
      useAuthStore.setState({
        accessToken: "fresh",
        claims: null,
        refreshing: false,
      })
      return "fresh"
    })

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await apiFetch<{ ok: boolean }>("/clusters")

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(keycloak.refreshToken).toHaveBeenCalledOnce()
    const retryHeaders = new Headers(
      fetchMock.mock.calls[1][1].headers as HeadersInit,
    )
    expect(retryHeaders.get("Authorization")).toBe("Bearer fresh")
  })

  it("kicks off login redirect after permanent 401", async () => {
    useAuthStore.setState({
      accessToken: "stale",
      claims: null,
      refreshing: false,
    })

    const keycloak = await import("@/lib/auth/keycloak")
    vi.mocked(keycloak.refreshToken).mockResolvedValue(undefined)
    vi.mocked(keycloak.login).mockResolvedValue(undefined)

    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: "expired" }, 401))
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiFetch("/clusters")).rejects.toBeInstanceOf(ApiError)
    // Single attempt because refresh returned undefined.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
