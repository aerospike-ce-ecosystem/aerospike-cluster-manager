import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listUdfs } from "@/lib/api/udfs"
import type { UDFModule } from "@/lib/types/udf"

import UdfsPage from "./page"

vi.mock("@/lib/api/udfs", () => ({
  listUdfs: vi.fn(),
}))

const FIXTURE: UDFModule[] = [
  { filename: "scoring.lua", type: "LUA", hash: "abc123" },
]

const mocked = vi.mocked(listUdfs)

beforeEach(() => {
  mocked.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

const PARAMS = { clusterId: "conn-test" }

describe("UdfsPage — error / empty / loading separation (#270 regression)", () => {
  it("renders the failure row and Retry banner when initial load fails", async () => {
    mocked.mockRejectedValueOnce(new Error("boom"))

    render(<UdfsPage params={PARAMS} />)

    expect(
      await screen.findByText("Failed to load UDF modules."),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    expect(
      screen.queryByText(/no udf modules registered/i),
    ).not.toBeInTheDocument()
  })

  it("keeps previously loaded rows visible when a refresh fails", async () => {
    mocked
      .mockResolvedValueOnce(FIXTURE)
      .mockRejectedValueOnce(new Error("boom"))

    render(<UdfsPage params={PARAMS} />)

    expect(await screen.findByText("scoring.lua")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }))

    expect(await screen.findByText("scoring.lua")).toBeInTheDocument()
    expect(
      screen.getByText(/showing data from the last successful load/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Failed to load UDF modules."),
    ).not.toBeInTheDocument()
  })

  it("Retry click invokes the loader again", async () => {
    mocked
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(FIXTURE)

    render(<UdfsPage params={PARAMS} />)

    expect(
      await screen.findByText("Failed to load UDF modules."),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /retry/i }))

    expect(await screen.findByText("scoring.lua")).toBeInTheDocument()
    expect(mocked).toHaveBeenCalledTimes(2)
  })
})
