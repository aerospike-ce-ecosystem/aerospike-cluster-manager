/**
 * Browser store — owns the current page of records, pagination, loading /
 * error state, and a per-session query-keyed cache.
 *
 * Wraps `filterRecords` (POST /api/records/{conn_id}/filter) as the canonical
 * list API because it supports filters + pagination in one call. Plain list
 * (`listRecords`) is only used in fallback paths.
 */

import { create } from "zustand"

import { deleteRecord, filterRecords, putRecord } from "@/lib/api/records"
import { DEFAULT_PAGE_SIZE } from "@/lib/constants"
import type {
  FilteredQueryRequest,
  FilteredQueryResponse,
  FilterGroup,
} from "@/lib/types/query"
import type { AerospikeRecord, RecordWriteRequest } from "@/lib/types/record"

interface BrowserMutationOptions {
  refresh?: () => Promise<void>
}

interface CachedResult {
  records: AerospikeRecord[]
  total: number
  pageSize: number
  hasMore: boolean
  totalEstimated: boolean
  executionTimeMs: number
  scannedRecords: number
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
  })
}

interface BrowserState {
  records: AerospikeRecord[]
  total: number
  pageSize: number
  hasMore: boolean
  totalEstimated: boolean
  loading: boolean
  error: string | null
  executionTimeMs: number
  scannedRecords: number

  selectedNamespace: string | null
  selectedSet: string | null

  /** Query-keyed record cache for the current browse session */
  recordCache: Map<string, CachedResult>

  setNamespace: (ns: string | null) => void
  setSet: (set: string | null) => void
  fetchFilteredRecords: (
    connId: string,
    ns: string,
    set: string,
    filters?: FilterGroup,
    pageSize?: number,
    primaryKey?: string,
    force?: boolean,
  ) => Promise<void>
  putRecord: (
    connId: string,
    data: RecordWriteRequest,
    options?: BrowserMutationOptions,
  ) => Promise<void>
  deleteRecord: (
    connId: string,
    ns: string,
    set: string,
    pk: string,
    options?: BrowserMutationOptions,
  ) => Promise<void>
  clearCache: () => void
  reset: () => void
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  return "Unknown error"
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

  setSet: (setName) =>
    set({ selectedSet: setName, records: [], recordCache: new Map() }),

  fetchFilteredRecords: async (
    connId,
    ns,
    setName,
    filters,
    pageSize,
    primaryKey,
    force,
  ) => {
    const ps = pageSize ?? get().pageSize
    const cacheKey = buildCacheKey(connId, ns, setName, filters, ps, primaryKey)
    if (!force) {
      const cached = get().recordCache.get(cacheKey)
      if (cached) {
        set({
          records: cached.records,
          total: cached.total,
          pageSize: cached.pageSize,
          hasMore: cached.hasMore,
          totalEstimated: cached.totalEstimated,
          executionTimeMs: cached.executionTimeMs,
          scannedRecords: cached.scannedRecords,
        })
        return
      }
    }

    set({ loading: true, error: null })
    try {
      const body: FilteredQueryRequest = {
        namespace: ns,
        set: setName,
        filters,
        page: 1,
        pageSize: ps,
        primaryKey: primaryKey || undefined,
      }
      const result: FilteredQueryResponse = await filterRecords(connId, body)
      const entry: CachedResult = {
        records: result.records,
        total: result.total,
        pageSize: result.pageSize,
        hasMore: result.hasMore,
        totalEstimated: result.totalEstimated ?? false,
        executionTimeMs: result.executionTimeMs,
        scannedRecords: result.scannedRecords,
      }

      const cache = new Map(get().recordCache)
      if (cache.size >= 10) {
        const firstKey = cache.keys().next().value
        if (firstKey !== undefined) cache.delete(firstKey)
      }
      cache.set(cacheKey, entry)

      set({
        records: entry.records,
        total: entry.total,
        pageSize: entry.pageSize,
        hasMore: entry.hasMore,
        totalEstimated: entry.totalEstimated,
        executionTimeMs: entry.executionTimeMs,
        scannedRecords: entry.scannedRecords,
        recordCache: cache,
        loading: false,
      })
    } catch (err) {
      set({ loading: false, error: getErrorMessage(err) })
    }
  },

  putRecord: async (connId, data, options) => {
    try {
      await putRecord(connId, data)
      set({ recordCache: new Map() })
      if (options?.refresh) {
        await options.refresh()
      }
    } catch (error) {
      set({ error: getErrorMessage(error) })
      throw error
    }
  },

  deleteRecord: async (connId, ns, setName, pk, options) => {
    try {
      await deleteRecord(connId, { ns, set: setName, pk })
      set({ recordCache: new Map() })
      if (options?.refresh) {
        await options.refresh()
      }
    } catch (error) {
      set({ error: getErrorMessage(error) })
      throw error
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
}))
