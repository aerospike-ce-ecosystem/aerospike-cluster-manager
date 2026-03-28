import { describe, it, expect, vi, beforeEach } from "vitest";
import { useBrowserStore } from "../browser-store";

vi.mock("@/lib/api/client", () => ({
  api: {
    getRecords: vi.fn(),
    getFilteredRecords: vi.fn(),
    putRecord: vi.fn(),
    deleteRecord: vi.fn(),
  },
}));

vi.mock("@/lib/constants", () => ({
  DEFAULT_PAGE_SIZE: 25,
}));

import { api } from "@/lib/api/client";
const mockApi = vi.mocked(api);

describe("useBrowserStore", () => {
  beforeEach(() => {
    useBrowserStore.getState().reset();
    vi.clearAllMocks();
  });

  it("has correct initial state", () => {
    const state = useBrowserStore.getState();
    expect(state.records).toEqual([]);
    expect(state.total).toBe(0);
    expect(state.loading).toBe(false);
  });

  it("setNamespace resets related state", () => {
    useBrowserStore.setState({ selectedSet: "test", records: [{ key: {} } as any] });
    useBrowserStore.getState().setNamespace("test-ns");
    const state = useBrowserStore.getState();
    expect(state.selectedNamespace).toBe("test-ns");
    expect(state.selectedSet).toBeNull();
    expect(state.records).toEqual([]);
  });

  it("fetchRecords populates state", async () => {
    const mockResult = {
      records: [{ key: { pk: "1" }, meta: {}, bins: {} }],
      total: 100,
      page: 1,
      pageSize: 25,
      hasMore: true,
    };
    mockApi.getRecords.mockResolvedValue(mockResult as any);

    await useBrowserStore.getState().fetchRecords("conn-1", "ns", "set");

    const state = useBrowserStore.getState();
    expect(state.records).toEqual(mockResult.records);
    expect(state.total).toBe(100);
    expect(state.loading).toBe(false);
  });

  it("fetchRecords sets error on failure", async () => {
    mockApi.getRecords.mockRejectedValue(new Error("Fetch failed"));

    await useBrowserStore.getState().fetchRecords("conn-1", "ns", "set");

    expect(useBrowserStore.getState().error).toBe("Fetch failed");
  });

  it("putRecord uses custom refresh callback instead of default list fetch", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    mockApi.putRecord.mockResolvedValue(undefined as any);

    await useBrowserStore.getState().putRecord(
      "conn-1",
      {
        key: { namespace: "ns", set: "users", pk: "pk-1" },
        bins: { name: "alice" },
      } as any,
      { refresh },
    );

    expect(mockApi.putRecord).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mockApi.getRecords).not.toHaveBeenCalled();
  });

  it("deleteRecord uses custom refresh callback instead of default list fetch", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    mockApi.deleteRecord.mockResolvedValue(undefined as any);

    await useBrowserStore.getState().deleteRecord("conn-1", "ns", "users", "pk-1", { refresh });

    expect(mockApi.deleteRecord).toHaveBeenCalledWith("conn-1", "ns", "users", "pk-1");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mockApi.getRecords).not.toHaveBeenCalled();
  });

  it("fetchFilteredRecords populates state", async () => {
    const mockResult = {
      records: [{ key: { pk: "1" }, meta: {}, bins: { name: "test" } }],
      total: 50,
      page: 1,
      pageSize: 25,
      hasMore: true,
      scannedRecords: 50,
      executionTimeMs: 12,
    };
    mockApi.getFilteredRecords.mockResolvedValue(mockResult as any);

    await useBrowserStore.getState().fetchFilteredRecords("conn-1", "ns", "set");

    const state = useBrowserStore.getState();
    expect(state.records).toEqual(mockResult.records);
    expect(state.total).toBe(50);
    expect(state.scannedRecords).toBe(50);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("fetchFilteredRecords sets error on failure", async () => {
    mockApi.getFilteredRecords.mockRejectedValue(new Error("Query failed"));

    await useBrowserStore.getState().fetchFilteredRecords("conn-1", "ns", "set");

    expect(useBrowserStore.getState().error).toBe("Query failed");
    expect(useBrowserStore.getState().loading).toBe(false);
  });

  it("fetchFilteredRecords passes filters and primaryKey", async () => {
    const mockResult = {
      records: [],
      total: 0,
      page: 1,
      pageSize: 25,
      hasMore: false,
      scannedRecords: 0,
      executionTimeMs: 5,
    };
    mockApi.getFilteredRecords.mockResolvedValue(mockResult as any);

    const filters = { operator: "AND" as const, conditions: [] };
    await useBrowserStore
      .getState()
      .fetchFilteredRecords("conn-1", "ns", "set", filters, 50, "key-1");

    expect(mockApi.getFilteredRecords).toHaveBeenCalledWith(
      "conn-1",
      expect.objectContaining({
        namespace: "ns",
        set: "set",
        filters,
        pageSize: 50,
        primaryKey: "key-1",
      }),
    );
  });

  it("reset clears all state", () => {
    useBrowserStore.setState({
      records: [{ key: {} } as any],
      total: 100,
      selectedNamespace: "ns",
      selectedSet: "set",
      error: "some error",
    });
    useBrowserStore.getState().reset();
    const state = useBrowserStore.getState();
    expect(state.records).toEqual([]);
    expect(state.total).toBe(0);
    expect(state.selectedNamespace).toBeNull();
    expect(state.error).toBeNull();
  });
});
