import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listIndexes } from "@/lib/api/indexes"
import { filterRecords } from "@/lib/api/records"
import type { FilteredQueryResponse } from "@/lib/types/query"

import RecordBrowserPage from "./page"

vi.mock("@/lib/api/records", () => ({
  filterRecords: vi.fn(),
}))
vi.mock("@/lib/api/indexes", () => ({
  listIndexes: vi.fn(),
}))

const PARAMS = { clusterId: "conn-test", namespace: "test", set: "sample_set" }

const mockedFilter = vi.mocked(filterRecords)
const mockedIndexes = vi.mocked(listIndexes)

function fixtureResponse(records: number): FilteredQueryResponse {
  return {
    records: Array.from({ length: records }, (_, i) => ({
      key: { namespace: "test", set: "sample_set", pk: `pk-${i}` },
      meta: { generation: 1, ttl: 0 },
      bins: { score: i },
    })),
    total: records,
    page: 1,
    pageSize: 50,
    hasMore: false,
    executionTimeMs: 12,
    scannedRecords: records,
    returnedRecords: records,
    totalEstimated: false,
  }
}

beforeEach(() => {
  mockedFilter.mockReset()
  mockedIndexes.mockReset()
  mockedIndexes.mockResolvedValue([])
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("RecordBrowserPage — error / empty / loading separation (#270 regression)", () => {
  it("renders the failure row and Retry banner when initial load fails", async () => {
    mockedFilter.mockRejectedValueOnce(new Error("boom"))

    render(<RecordBrowserPage params={PARAMS} />)

    expect(
      await screen.findByText("Failed to load records."),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    // Empty-state row must NOT co-render with the error.
    expect(
      screen.queryByText(/no records in this set/i),
    ).not.toBeInTheDocument()
  })

  it("preserves prior records and meta on a refresh failure (stale-data preservation)", async () => {
    mockedFilter
      .mockResolvedValueOnce(fixtureResponse(2))
      .mockRejectedValueOnce(new Error("boom"))

    render(<RecordBrowserPage params={PARAMS} />)

    expect(await screen.findByText("pk-0")).toBeInTheDocument()
    // StatusBar shows the successful execution time after the first load.
    expect(await screen.findByText("12ms")).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole("button", { name: /refresh records/i }),
    )

    // Prior data still visible
    expect(await screen.findByText("pk-0")).toBeInTheDocument()
    expect(screen.getByText("pk-1")).toBeInTheDocument()
    // Banner with stale-data subtext on top
    expect(
      screen.getByText(/showing data from the last successful load/i),
    ).toBeInTheDocument()
    // Meta NOT reset — StatusBar still shows the previous execution time.
    expect(screen.getByText("12ms")).toBeInTheDocument()
    // Failure row NOT shown when stale data is present.
    expect(
      screen.queryByText("Failed to load records."),
    ).not.toBeInTheDocument()
  })

  it("Retry click invokes the loader again", async () => {
    mockedFilter
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(fixtureResponse(1))

    render(<RecordBrowserPage params={PARAMS} />)

    expect(
      await screen.findByText("Failed to load records."),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /retry/i }))

    expect(await screen.findByText("pk-0")).toBeInTheDocument()
    expect(mockedFilter).toHaveBeenCalledTimes(2)
  })
})

describe("RecordBrowserPage — PK match mode (#287)", () => {
  it("defaults to exact mode and sends pkMatchMode=exact in the request", async () => {
    mockedFilter.mockResolvedValueOnce(fixtureResponse(1))
    render(<RecordBrowserPage params={PARAMS} />)
    await screen.findByText("pk-0")

    expect(mockedFilter).toHaveBeenLastCalledWith(
      "conn-test",
      expect.objectContaining({
        pkMatchMode: "exact",
        pkPattern: null,
      }),
    )
  })

  it("switching to prefix mode updates placeholder and reveals the caveat banner", async () => {
    mockedFilter.mockResolvedValue(fixtureResponse(0))
    render(<RecordBrowserPage params={PARAMS} />)

    // Wait for initial load to settle.
    await screen.findByText(/no records in this set/i)

    // Default placeholder is exact-mode.
    expect(screen.getByPlaceholderText("Primary key...")).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText(/pk match mode/i))
    await userEvent.click(screen.getByRole("option", { name: /prefix/i }))

    expect(
      screen.getByPlaceholderText(/Prefix \(e.g\., user_\)/i),
    ).toBeInTheDocument()
    // InfoBanner caveat is rendered.
    expect(screen.getByRole("status")).toHaveTextContent(/full set scan/i)
    expect(screen.getByRole("status")).toHaveTextContent(/POLICY_KEY_SEND/)
  })

  it("submitting in prefix mode sends pkPattern + pkMatchMode=prefix and no legacy primaryKey", async () => {
    mockedFilter
      .mockResolvedValueOnce(fixtureResponse(0)) // initial load
      .mockResolvedValueOnce(fixtureResponse(2)) // after Search

    render(<RecordBrowserPage params={PARAMS} />)
    await screen.findByText(/no records in this set/i)

    await userEvent.click(screen.getByLabelText(/pk match mode/i))
    await userEvent.click(screen.getByRole("option", { name: /prefix/i }))

    const input = screen.getByPlaceholderText(/Prefix \(e.g\., user_\)/i)
    await userEvent.type(input, "acct_")

    await userEvent.click(screen.getByRole("button", { name: /^search$/i }))

    expect(mockedFilter).toHaveBeenLastCalledWith(
      "conn-test",
      expect.objectContaining({
        pkPattern: "acct_",
        pkMatchMode: "prefix",
      }),
    )
    // Belt-and-braces: no dual-field send. Backend rejects pkPattern +
    // primaryKey simultaneously, so this assertion would catch a regression
    // where the page accidentally re-introduces the legacy field.
    const lastCallBody = mockedFilter.mock.lastCall?.[1] ?? {}
    expect(lastCallBody).not.toHaveProperty("primaryKey")
  })

  it("disables the Search button and surfaces an inline error for an invalid regex", async () => {
    mockedFilter.mockResolvedValueOnce(fixtureResponse(0))
    render(<RecordBrowserPage params={PARAMS} />)
    await screen.findByText(/no records in this set/i)

    await userEvent.click(screen.getByLabelText(/pk match mode/i))
    await userEvent.click(screen.getByRole("option", { name: /regex/i }))

    const input = screen.getByPlaceholderText(/Regex/i)
    // userEvent.type treats `[` as a special key sequence — paste a literal value instead.
    input.focus()
    await userEvent.paste("[unclosed")

    // Inline error visible (alert role).
    expect(await screen.findByRole("alert")).toBeInTheDocument()
    // Search button is disabled because the draft is invalid.
    expect(screen.getByRole("button", { name: /^search$/i })).toBeDisabled()
    // No call past the initial mount.
    expect(mockedFilter).toHaveBeenCalledTimes(1)
  })

  it("disables Search when prefix/regex mode is selected with an empty input", async () => {
    mockedFilter.mockResolvedValueOnce(fixtureResponse(0))
    render(<RecordBrowserPage params={PARAMS} />)
    await screen.findByText(/no records in this set/i)

    await userEvent.click(screen.getByLabelText(/pk match mode/i))
    await userEvent.click(screen.getByRole("option", { name: /prefix/i }))

    // Input is still empty in prefix mode.
    expect(screen.getByRole("button", { name: /^search$/i })).toBeDisabled()
  })
})
