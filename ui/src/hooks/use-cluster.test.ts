import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getCluster } from "@/lib/api/clusters"
import type { ClusterInfo } from "@/lib/types/cluster"

import { useCluster } from "./use-cluster"

vi.mock("@/lib/api/clusters", () => ({
  getCluster: vi.fn(),
}))

const mocked = vi.mocked(getCluster)

const FIXTURE: ClusterInfo = {
  connectionId: "conn-1",
  nodes: [],
  namespaces: [],
}

beforeEach(() => {
  mocked.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("useCluster", () => {
  it("skips the fetch entirely when connId is null", async () => {
    const { result } = renderHook(() => useCluster(null))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeNull()
    expect(mocked).not.toHaveBeenCalled()
  })

  it("fetches and resolves on a non-null connId", async () => {
    mocked.mockResolvedValueOnce(FIXTURE)

    const { result } = renderHook(() => useCluster("conn-1"))
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual(FIXTURE)
    expect(result.current.error).toBeNull()
  })

  it("captures errors", async () => {
    mocked.mockRejectedValueOnce(new Error("boom"))

    const { result } = renderHook(() => useCluster("conn-1"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error?.message).toBe("boom")
  })

  it("re-fetches when connId changes", async () => {
    mocked
      .mockResolvedValueOnce({ ...FIXTURE, connectionId: "conn-1" })
      .mockResolvedValueOnce({ ...FIXTURE, connectionId: "conn-2" })

    const { result, rerender } = renderHook(({ id }) => useCluster(id), {
      initialProps: { id: "conn-1" as string | null },
    })
    await waitFor(() =>
      expect(result.current.data?.connectionId).toBe("conn-1"),
    )

    rerender({ id: "conn-2" })
    await waitFor(() =>
      expect(result.current.data?.connectionId).toBe("conn-2"),
    )
    expect(mocked).toHaveBeenCalledTimes(2)
  })
})

describe("useCluster — polling (#474)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("re-reads without user interaction after the interval elapses", async () => {
    // The reported bug: the overview refreshed only on a Refresh click, so
    // metrics were frozen from page load with nothing to say so.
    mocked.mockResolvedValue(FIXTURE)

    const { result } = renderHook(() => useCluster("conn-1"))
    await vi.waitFor(() => expect(result.current.data).toEqual(FIXTURE))
    expect(mocked).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(mocked).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(mocked).toHaveBeenCalledTimes(3)
  })

  it("records lastUpdatedAt so staleness is visible", async () => {
    // A frozen TPS reading looks exactly like a genuinely idle cluster, so
    // the data cannot show its own staleness — the timestamp is what does.
    mocked.mockResolvedValue(FIXTURE)

    const { result } = renderHook(() => useCluster("conn-1"))
    await vi.waitFor(() => expect(result.current.lastUpdatedAt).not.toBeNull())
    expect(typeof result.current.lastUpdatedAt).toBe("number")
  })

  it("does not poll while the tab is hidden", async () => {
    mocked.mockResolvedValue(FIXTURE)
    const { result } = renderHook(() => useCluster("conn-1"))
    await vi.waitFor(() => expect(result.current.data).toEqual(FIXTURE))
    expect(mocked).toHaveBeenCalledTimes(1)

    vi.spyOn(document, "hidden", "get").mockReturnValue(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    // Three ticks elapsed and none of them asked.
    expect(mocked).toHaveBeenCalledTimes(1)
  })

  it("stops polling after unmount", async () => {
    mocked.mockResolvedValue(FIXTURE)
    const { result, unmount } = renderHook(() => useCluster("conn-1"))
    await vi.waitFor(() => expect(result.current.data).toEqual(FIXTURE))

    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(mocked).toHaveBeenCalledTimes(1)
  })

  it("a failed poll keeps the last good data instead of erroring the page", async () => {
    // One dropped request must not replace a working dashboard with an error
    // state; the next tick usually recovers.
    mocked
      .mockResolvedValueOnce(FIXTURE)
      .mockRejectedValueOnce(new Error("blip"))

    const { result } = renderHook(() => useCluster("conn-1"))
    await vi.waitFor(() => expect(result.current.data).toEqual(FIXTURE))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(result.current.data).toEqual(FIXTURE)
    expect(result.current.error).toBeNull()
  })

  it("polling never toggles isLoading", async () => {
    // isLoading drives the Refresh button's disabled state; flickering it
    // every 5s would be worse than the staleness this fixes.
    mocked.mockResolvedValue(FIXTURE)
    const { result } = renderHook(() => useCluster("conn-1"))
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(result.current.isLoading).toBe(false)
  })

  it("pollIntervalMs=0 disables polling", async () => {
    mocked.mockResolvedValue(FIXTURE)
    const { result } = renderHook(() =>
      useCluster("conn-1", { pollIntervalMs: 0 }),
    )
    await vi.waitFor(() => expect(result.current.data).toEqual(FIXTURE))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(mocked).toHaveBeenCalledTimes(1)
  })
})
