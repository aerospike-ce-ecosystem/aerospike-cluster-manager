import { create } from "zustand";
import type {
  AerospikeRecord,
  FilteredQueryRequest,
  FilteredQueryResponse,
  FilterGroup,
  RecordListResponse,
  RecordWriteRequest,
} from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { withLoading } from "@/lib/store-utils";
import { getErrorMessage } from "@/lib/utils";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

interface BrowserMutationOptions {
  refresh?: () => Promise<void>;
}

interface BrowserState {
  records: AerospikeRecord[];
  total: number;
  pageSize: number;
  hasMore: boolean;
  totalEstimated: boolean;
  loading: boolean;
  error: string | null;
  executionTimeMs: number;
  scannedRecords: number;

  selectedNamespace: string | null;
  selectedSet: string | null;

  setNamespace: (ns: string | null) => void;
  setSet: (set: string | null) => void;
  fetchRecords: (connId: string, ns: string, set: string, pageSize?: number) => Promise<void>;
  fetchFilteredRecords: (
    connId: string,
    ns: string,
    set: string,
    filters?: FilterGroup,
    pageSize?: number,
    primaryKey?: string,
  ) => Promise<void>;
  putRecord: (
    connId: string,
    data: RecordWriteRequest,
    options?: BrowserMutationOptions,
  ) => Promise<void>;
  deleteRecord: (
    connId: string,
    ns: string,
    set: string,
    pk: string,
    options?: BrowserMutationOptions,
  ) => Promise<void>;
  setPageSize: (size: number) => void;
  reset: () => void;
}

export const useBrowserStore = create<BrowserState>()((set, get) => ({
  records: [],
  total: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  hasMore: false,
  totalEstimated: false,
  loading: false,
  error: null,
  executionTimeMs: 0,
  scannedRecords: 0,
  selectedNamespace: null,
  selectedSet: null,

  setNamespace: (ns) => set({ selectedNamespace: ns, selectedSet: null, records: [] }),
  setSet: (setName) => set({ selectedSet: setName, records: [] }),

  fetchRecords: async (connId, ns, setName, pageSize) => {
    const ps = pageSize ?? get().pageSize;
    await withLoading(set, async () => {
      const result: RecordListResponse = await api.getRecords(connId, ns, setName, 1, ps);
      set({
        records: result.records,
        total: result.total,
        pageSize: result.pageSize,
        hasMore: result.hasMore,
        totalEstimated: result.totalEstimated ?? false,
      });
    });
  },

  fetchFilteredRecords: async (connId, ns, setName, filters, pageSize, primaryKey) => {
    const ps = pageSize ?? get().pageSize;
    await withLoading(set, async () => {
      const body: FilteredQueryRequest = {
        namespace: ns,
        set: setName,
        filters,
        page: 1,
        pageSize: ps,
        primaryKey: primaryKey || undefined,
      };
      const result: FilteredQueryResponse = await api.getFilteredRecords(connId, body);
      set({
        records: result.records,
        total: result.total,
        pageSize: result.pageSize,
        hasMore: result.hasMore,
        totalEstimated: result.totalEstimated ?? false,
        executionTimeMs: result.executionTimeMs,
        scannedRecords: result.scannedRecords,
      });
    });
  },

  putRecord: async (connId, data, options) => {
    try {
      await api.putRecord(connId, data);
      if (options?.refresh) {
        await options.refresh();
      } else {
        await get().fetchRecords(connId, data.key.namespace, data.key.set);
      }
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  deleteRecord: async (connId, ns, setName, pk, options) => {
    try {
      await api.deleteRecord(connId, ns, setName, pk);
      if (options?.refresh) {
        await options.refresh();
      } else {
        await get().fetchRecords(connId, ns, setName);
      }
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  setPageSize: (pageSize) => set({ pageSize }),
  reset: () =>
    set({
      records: [],
      total: 0,
      hasMore: false,
      totalEstimated: false,
      selectedNamespace: null,
      selectedSet: null,
      error: null,
      executionTimeMs: 0,
      scannedRecords: 0,
    }),
}));
