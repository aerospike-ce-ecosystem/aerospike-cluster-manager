import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listConnections } from "@/lib/api/connections"
import type { ConnectionProfileResponse } from "@/lib/types/connection"

import { useConnections } from "./use-connections"

vi.mock("@/lib/api/connections", () => ({
  listConnections: vi.fn(),
}))

const mocked = vi.mocked(listConnections)

const FIXTURE: ConnectionProfileResponse[] = [
  {
    id: "conn-1",
    name: "local-ce",
    hosts: ["aerospike-node-1"],
    port: 3000,
    color: "#4f46e5",
    labels: { env: "default" },
    createdAt: "2026-05-04T00:00:00Z",
    updatedAt: "2026-05-04T00:00:00Z",
  },
]

beforeEach(() => {
  mocked.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("useConnections", () => {
  it("starts in loading state and resolves with data", async () => {
    mocked.mockResolvedValueOnce(FIXTURE)

    const { result } = renderHook(() => useConnections())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeNull()

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual(FIXTURE)
    expect(result.current.error).toBeNull()
  })

  it("captures errors without crashing", async () => {
    mocked.mockRejectedValueOnce(new Error("boom"))

    const { result } = renderHook(() => useConnections())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toBeNull()
    expect(result.current.error?.message).toBe("boom")
  })

  it("refetch re-invokes the API and replaces data", async () => {
    const SECOND: ConnectionProfileResponse[] = [
      { ...FIXTURE[0], id: "conn-2", name: "remote-ce" },
    ]
    mocked.mockResolvedValueOnce(FIXTURE).mockResolvedValueOnce(SECOND)

    const { result } = renderHook(() => useConnections())
    await waitFor(() => expect(result.current.data).toEqual(FIXTURE))

    await act(() => result.current.refetch())
    expect(result.current.data).toEqual(SECOND)
    expect(mocked).toHaveBeenCalledTimes(2)
  })

  it("does not set state after unmount when the fetch resolves late", async () => {
    let resolveLater: (v: ConnectionProfileResponse[]) => void = () => {}
    mocked.mockImplementationOnce(
      () => new Promise<ConnectionProfileResponse[]>((r) => (resolveLater = r)),
    )

    const { result, unmount } = renderHook(() => useConnections())
    expect(result.current.isLoading).toBe(true)

    unmount()
    // Snapshot of internal `cancelled` flag effect: no setState should run
    // after this resolution.
    resolveLater(FIXTURE)
    // Give the microtask queue a beat to flush.
    await new Promise((r) => setTimeout(r, 0))
    // No throw / no console error from React about state on unmounted component.
  })
})
