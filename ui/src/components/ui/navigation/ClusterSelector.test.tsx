import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ClusterSelector } from "./ClusterSelector"
import { useClusterSelectorStore } from "@/stores/cluster-selector-store"

const REGISTRY = {
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

beforeEach(() => {
  useClusterSelectorStore.setState({
    registry: REGISTRY,
    currentClusterId: "dev",
    registryError: null,
  })
  // Make health pings deterministically succeed.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ClusterSelector", () => {
  it("renders the active cluster's displayName", async () => {
    render(<ClusterSelector />)
    expect(screen.getByLabelText("Switch cluster")).toBeInTheDocument()
    expect(screen.getByText("Dev")).toBeInTheDocument()
  })

  it("renders nothing when registry is empty (single-cluster mode)", () => {
    useClusterSelectorStore.setState({
      registry: null,
      currentClusterId: null,
      registryError: null,
    })
    const { container } = render(<ClusterSelector />)
    expect(container).toBeEmptyDOMElement()
  })

  it("changes the active cluster when an item is selected", async () => {
    const user = userEvent.setup()
    render(<ClusterSelector />)

    await user.click(screen.getByLabelText("Switch cluster"))
    const prod = await screen.findByText("Prod")
    await user.click(prod)

    await waitFor(() =>
      expect(useClusterSelectorStore.getState().currentClusterId).toBe("prod"),
    )
  })

  it("pings each cluster /api/health on mount", async () => {
    render(<ClusterSelector />)
    await waitFor(() => {
      const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } })
        .mock.calls
      const urls = calls.map((c) => String(c[0]))
      expect(urls.some((u) => u.startsWith("https://dev-api.example.com"))).toBe(
        true,
      )
      expect(urls.some((u) => u.startsWith("https://prod-api.example.com"))).toBe(
        true,
      )
    })
  })
})
