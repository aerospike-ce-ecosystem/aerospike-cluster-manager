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

interface CachedResult {
  records: AerospikeRecord[];
  total: number;
  pageSize: number;
  hasMore: boolean;
  totalEstimated: boolean;
  executionTimeMs: number;
  scannedRecords: number;
}

function buildCacheKey(
  connId: string,
  ns: string,
  set: string,
  filters?: FilterGroup,
  pageSize?: number,
  primaryKey?: string,
): string {
  return JSON.stringify({
    connId,
    ns,
    set,
    filters: filters ?? null,
    pageSize,
    primaryKey: primaryKey ?? null,
  });
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

  /** Query-keyed record cache for the current browse session */
  recordCache: Map<string, CachedResult>;

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
    force?: boolean,
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
  clearCache: () => void;
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
  recordCache: new Map<string, CachedResult>(),

  setNamespace: (ns) =>
    set({
      selectedNamespace: ns,
      selectedSet: null,
      records: [],
      recordCache: new Map(),
      pageSize: DEFAULT_PAGE_SIZE,
      total: 0,
      hasMore: false,
      totalEstimated: false,
      executionTimeMs: 0,
      scannedRecords: 0,
    }),
  setSet: (setName) => set({ selectedSet: setName, records: [], recordCache: new Map() }),

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

  fetchFilteredRecords: async (connId, ns, setName, filters, pageSize, primaryKey, force) => {
    const ps = pageSize ?? get().pageSize;
    const cacheKey = buildCacheKey(connId, ns, setName, filters, ps, primaryKey);
    if (!force) {
      const cached = get().recordCache.get(cacheKey);
      if (cached) {
        set({
          records: cached.records,
          total: cached.total,
          pageSize: cached.pageSize,
          hasMore: cached.hasMore,
          totalEstimated: cached.totalEstimated,
          executionTimeMs: cached.executionTimeMs,
          scannedRecords: cached.scannedRecords,
        });
        return;
      }
    }

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
      const entry: CachedResult = {
        records: result.records,
        total: result.total,
        pageSize: result.pageSize,
        hasMore: result.hasMore,
        totalEstimated: result.totalEstimated ?? false,
        executionTimeMs: result.executionTimeMs,
        scannedRecords: result.scannedRecords,
      };

      const cache = new Map(get().recordCache);
      // Limit cache to 10 entries to avoid unbounded growth
      if (cache.size >= 10) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) cache.delete(firstKey);
      }
      cache.set(cacheKey, entry);

      set({
        records: result.records,
        total: result.total,
        pageSize: result.pageSize,
        hasMore: result.hasMore,
        totalEstimated: result.totalEstimated ?? false,
        executionTimeMs: result.executionTimeMs,
        scannedRecords: result.scannedRecords,
        recordCache: cache,
      });
    });
  },

  putRecord: async (connId, data, options) => {
    try {
      await api.putRecord(connId, data);
      set({ recordCache: new Map() });
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
      set({ recordCache: new Map() });
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

  clearCache: () => set({ recordCache: new Map() }),

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
      recordCache: new Map(),
    }),
}));
