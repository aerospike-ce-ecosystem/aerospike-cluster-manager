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
  page: number;
  pageSize: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  executionTimeMs: number;
  scannedRecords: number;

  selectedNamespace: string | null;
  selectedSet: string | null;

  setNamespace: (ns: string | null) => void;
  setSet: (set: string | null) => void;
  fetchRecords: (
    connId: string,
    ns: string,
    set: string,
    page?: number,
    pageSize?: number,
  ) => Promise<void>;
  fetchFilteredRecords: (
    connId: string,
    ns: string,
    set: string,
    filters?: FilterGroup,
    page?: number,
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
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  reset: () => void;
}

export const useBrowserStore = create<BrowserState>()((set, get) => ({
  records: [],
  total: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  hasMore: false,
  loading: false,
  error: null,
  executionTimeMs: 0,
  scannedRecords: 0,
  selectedNamespace: null,
  selectedSet: null,

  setNamespace: (ns) => set({ selectedNamespace: ns, selectedSet: null, records: [], page: 1 }),
  setSet: (setName) => set({ selectedSet: setName, records: [], page: 1 }),

  fetchRecords: async (connId, ns, setName, page, pageSize) => {
    const p = page ?? get().page;
    const ps = pageSize ?? get().pageSize;
    await withLoading(set, async () => {
      const result: RecordListResponse = await api.getRecords(connId, ns, setName, p, ps);
      set({
        records: result.records,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        hasMore: result.hasMore,
      });
    });
  },

  fetchFilteredRecords: async (connId, ns, setName, filters, page, pageSize, primaryKey) => {
    const p = page ?? get().page;
    const ps = pageSize ?? get().pageSize;
    await withLoading(set, async () => {
      const body: FilteredQueryRequest = {
        namespace: ns,
        set: setName,
        filters,
        page: p,
        pageSize: ps,
        primaryKey: primaryKey || undefined,
      };
      const result: FilteredQueryResponse = await api.getFilteredRecords(connId, body);
      set({
        records: result.records,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        hasMore: result.hasMore,
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
        const { page, pageSize } = get();
        await get().fetchRecords(connId, data.key.namespace, data.key.set, page, pageSize);
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
        const { page, pageSize } = get();
        await get().fetchRecords(connId, ns, setName, page, pageSize);
      }
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize, page: 1 }),
  reset: () =>
    set({
      records: [],
      total: 0,
      page: 1,
      hasMore: false,
      selectedNamespace: null,
      selectedSet: null,
      error: null,
      executionTimeMs: 0,
      scannedRecords: 0,
    }),
}));
