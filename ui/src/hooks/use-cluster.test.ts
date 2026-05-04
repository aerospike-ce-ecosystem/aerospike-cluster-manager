import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

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
