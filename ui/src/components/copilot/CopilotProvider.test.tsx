import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CopilotProvider } from "./CopilotProvider"

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubCopilotConfig(response: () => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/copilot-config") return response()
      return Promise.reject(new Error(`unexpected fetch: ${String(input)}`))
    }),
  )
}

describe("CopilotProvider", () => {
  it("renders children unchanged when the probe reports disabled", async () => {
    stubCopilotConfig(() =>
      Promise.resolve(
        new Response(JSON.stringify({ enabled: false }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    const { container } = render(
      <CopilotProvider>
        <span data-testid="app">app</span>
      </CopilotProvider>,
    )
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/copilot-config", expect.anything()),
    )
    expect(screen.getByTestId("app")).toBeInTheDocument()
    // No copilot artifacts: the provider gate renders children only.
    expect(container.querySelectorAll("*")).toHaveLength(1)
  })

  it("renders children unchanged when the probe fails", async () => {
    stubCopilotConfig(() => Promise.reject(new Error("network down")))
    render(
      <CopilotProvider>
        <span data-testid="app">app</span>
      </CopilotProvider>,
    )
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.getByTestId("app")).toBeInTheDocument()
  })

  it("renders children unchanged when the probe returns non-OK", async () => {
    stubCopilotConfig(() =>
      Promise.resolve(new Response("not found", { status: 404 })),
    )
    render(
      <CopilotProvider>
        <span data-testid="app">app</span>
      </CopilotProvider>,
    )
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.getByTestId("app")).toBeInTheDocument()
  })
})
