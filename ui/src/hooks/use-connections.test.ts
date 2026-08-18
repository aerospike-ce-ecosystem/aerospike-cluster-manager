import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listConnections } from "@/lib/api/connections"
import type { ConnectionProfileResponse } from "@/lib/types/connection"

import {
  resetConnectionsFetchCoalescing,
  useConnections,
} from "./use-connections"

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
    workspaceId: "ws-default",
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

describe("useConnections — request coalescing (#474)", () => {
  beforeEach(() => {
    resetConnectionsFetchCoalescing()
  })

  it("five simultaneous consumers produce exactly one network call", async () => {
    // The reported behaviour: useConnections has 5 call sites, all mounting in
    // the same tick with no shared state, so one navigation fired five
    // identical requests.
    mocked.mockResolvedValue([])

    const hooks = Array.from({ length: 5 }, () =>
      renderHook(() => useConnections()),
    )
    await waitFor(() =>
      hooks.forEach((h) => expect(h.result.current.isLoading).toBe(false)),
    )

    expect(mocked).toHaveBeenCalledTimes(1)
    // And every consumer still got the data.
    hooks.forEach((h) => expect(h.result.current.data).toEqual([]))
  })

  it("a rejection reaches every joined consumer", async () => {
    mocked.mockRejectedValue(new Error("boom"))

    const hooks = Array.from({ length: 3 }, () =>
      renderHook(() => useConnections()),
    )
    await waitFor(() =>
      hooks.forEach((h) => expect(h.result.current.isLoading).toBe(false)),
    )

    expect(mocked).toHaveBeenCalledTimes(1)
    hooks.forEach((h) => expect(h.result.current.error?.message).toBe("boom"))
  })

  it("a later mount fetches fresh rather than reusing a settled result", async () => {
    // Coalescing must not become caching: once the request settles, the entry
    // is dropped, so a consumer mounting afterwards asks again.
    mocked.mockResolvedValue([])

    const first = renderHook(() => useConnections())
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    expect(mocked).toHaveBeenCalledTimes(1)

    const second = renderHook(() => useConnections())
    await waitFor(() => expect(second.result.current.isLoading).toBe(false))
    expect(mocked).toHaveBeenCalledTimes(2)
  })

  it("refetch always issues its own request", async () => {
    // An explicit refetch is a user asking for fresh data; joining an
    // in-flight call would hand them a response that started before they
    // clicked.
    mocked.mockResolvedValue([])

    const { result } = renderHook(() => useConnections())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mocked).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.refetch()
    })
    expect(mocked).toHaveBeenCalledTimes(2)
  })
})
