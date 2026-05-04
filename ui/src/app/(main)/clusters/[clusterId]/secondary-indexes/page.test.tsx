import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listIndexes } from "@/lib/api/indexes"
import type { SecondaryIndex } from "@/lib/types/index"

import SecondaryIndexesPage from "./page"

vi.mock("@/lib/api/indexes", () => ({
  listIndexes: vi.fn(),
}))

const FIXTURE: SecondaryIndex[] = [
  {
    name: "idx_bin_int",
    namespace: "test",
    set: "sample_set",
    bin: "bin_int",
    type: "numeric",
    state: "ready",
  },
]

const mocked = vi.mocked(listIndexes)

beforeEach(() => {
  mocked.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

const PARAMS = { clusterId: "conn-test" }

describe("SecondaryIndexesPage — error / empty / loading separation (#270 regression)", () => {
  it("renders the failure row and Retry banner when initial load fails", async () => {
    mocked.mockRejectedValueOnce(new Error("boom"))

    render(<SecondaryIndexesPage params={PARAMS} />)

    expect(
      await screen.findByText("Failed to load secondary indexes."),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    expect(
      screen.queryByText(/no secondary indexes defined/i),
    ).not.toBeInTheDocument()
  })

  it("keeps previously loaded rows visible when a refresh fails", async () => {
    mocked
      .mockResolvedValueOnce(FIXTURE)
      .mockRejectedValueOnce(new Error("boom"))

    render(<SecondaryIndexesPage params={PARAMS} />)

    expect(await screen.findByText("idx_bin_int")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }))

    expect(await screen.findByText("idx_bin_int")).toBeInTheDocument()
    expect(
      screen.getByText(/showing data from the last successful load/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Failed to load secondary indexes."),
    ).not.toBeInTheDocument()
  })

  it("Retry click invokes the loader again", async () => {
    mocked
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(FIXTURE)

    render(<SecondaryIndexesPage params={PARAMS} />)

    expect(
      await screen.findByText("Failed to load secondary indexes."),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /retry/i }))

    expect(await screen.findByText("idx_bin_int")).toBeInTheDocument()
    expect(mocked).toHaveBeenCalledTimes(2)
  })

  it("third empty-state branch is reachable when a filter matches nothing on a non-empty list", async () => {
    mocked.mockResolvedValueOnce(FIXTURE)

    render(<SecondaryIndexesPage params={PARAMS} />)

    await screen.findByText("idx_bin_int")
    const filter = screen.getByPlaceholderText(/filter indexes/i)
    await userEvent.type(filter, "zzz")

    expect(
      await screen.findByText(/no indexes match the filter/i),
    ).toBeInTheDocument()
  })
})
