import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  hydrateClusterRegistry,
  useClusterSelectorStore,
  type ClusterRegistry,
} from "./cluster-selector-store"

const REGISTRY: ClusterRegistry = {
  defaultClusterId: "dev",
  clusters: [
    {
      id: "dev",
      displayName: "Dev",
      apiUrl: "https://dev-api.example.com",
      labels: { env: "dev" },
    },
    {
      id: "prod",
      displayName: "Prod",
      apiUrl: "https://prod-api.example.com",
      labels: { env: "prod" },
    },
  ],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  useClusterSelectorStore.setState({
    registry: null,
    currentClusterId: null,
    registryError: null,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("cluster-selector-store", () => {
  it("hydrates registry from /cluster-registry.json and picks default", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(REGISTRY))

    await hydrateClusterRegistry(fetcher as unknown as typeof fetch)

    expect(fetcher).toHaveBeenCalledWith(
      "/cluster-registry.json",
      expect.objectContaining({ cache: "no-store" }),
    )
    const state = useClusterSelectorStore.getState()
    expect(state.registry).toEqual(REGISTRY)
    expect(state.currentClusterId).toBe("dev")
    expect(state.registryError).toBeNull()
  })

  it("preserves a persisted currentClusterId when it exists in the registry", async () => {
    useClusterSelectorStore.setState({ currentClusterId: "prod" })
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(REGISTRY))

    await hydrateClusterRegistry(fetcher as unknown as typeof fetch)

    expect(useClusterSelectorStore.getState().currentClusterId).toBe("prod")
  })

  it("falls back to defaultClusterId when persisted id is stale", async () => {
    useClusterSelectorStore.setState({ currentClusterId: "staging-removed" })
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(REGISTRY))

    await hydrateClusterRegistry(fetcher as unknown as typeof fetch)

    expect(useClusterSelectorStore.getState().currentClusterId).toBe("dev")
  })

  it("records an error and throws when /cluster-registry.json is missing", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("Not Found", { status: 404 }))

    await expect(
      hydrateClusterRegistry(fetcher as unknown as typeof fetch),
    ).rejects.toThrow(/cluster-registry\.json/)
    expect(useClusterSelectorStore.getState().registryError).toMatch(/404/)
  })

  it("rejects malformed registry payloads", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ defaultClusterId: "x" }))

    await expect(
      hydrateClusterRegistry(fetcher as unknown as typeof fetch),
    ).rejects.toThrow(/invalid shape/)
  })
})
