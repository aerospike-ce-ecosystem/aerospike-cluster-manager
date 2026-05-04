import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api/client"
import { listK8sTemplates } from "@/lib/api/k8s"
import type { K8sTemplateSummary } from "@/lib/types/k8s"

import AckoTemplatesPage from "./page"

vi.mock("@/lib/api/k8s", () => ({
  listK8sTemplates: vi.fn(),
}))

const FIXTURE: K8sTemplateSummary[] = [
  {
    name: "single-rack",
    description: "A small dev shape",
    size: 3,
    image: "aerospike/aerospike-server:8.1",
    usedBy: [],
    age: "2d",
  },
]

const mocked = vi.mocked(listK8sTemplates)

beforeEach(() => {
  mocked.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("AckoTemplatesPage — error / empty / loading separation (#270 regression)", () => {
  it("renders the failure row and Retry banner when initial load fails", async () => {
    mocked.mockRejectedValueOnce(new Error("boom"))

    render(<AckoTemplatesPage />)

    expect(
      await screen.findByText("Failed to load templates."),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    // Empty-state row must NOT co-render with the error.
    expect(
      screen.queryByText(/no aerospikeclustertemplates defined/i),
    ).not.toBeInTheDocument()
  })

  it("keeps previously loaded rows visible when a refresh fails (stale-data preservation)", async () => {
    mocked
      .mockResolvedValueOnce(FIXTURE)
      .mockRejectedValueOnce(new Error("boom"))

    render(<AckoTemplatesPage />)

    expect(await screen.findByText("single-rack")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }))

    // Prior data still visible
    expect(await screen.findByText("single-rack")).toBeInTheDocument()
    // Banner with Retry on top
    expect(
      screen.getByText(/showing data from the last successful load/i),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    // The "Failed to load" row must NOT be shown when stale data is present
    expect(
      screen.queryByText("Failed to load templates."),
    ).not.toBeInTheDocument()
  })

  it("Retry click invokes the loader again", async () => {
    mocked
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(FIXTURE)

    render(<AckoTemplatesPage />)

    expect(
      await screen.findByText("Failed to load templates."),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /retry/i }))

    expect(await screen.findByText("single-rack")).toBeInTheDocument()
    expect(mocked).toHaveBeenCalledTimes(2)
  })

  it("shows a 403-with-EE_MSG banner via mapApiError, not the empty state", async () => {
    mocked.mockRejectedValueOnce(
      new ApiError(403, "forbidden", {
        detail: "Security is not enabled. Add a 'security { }' block.",
      }),
    )

    render(<AckoTemplatesPage />)

    // mapApiError prefers the server-provided detail over Error.message.
    expect(
      await screen.findByText(/security is not enabled/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/no aerospikeclustertemplates defined/i),
    ).not.toBeInTheDocument()
  })
})
