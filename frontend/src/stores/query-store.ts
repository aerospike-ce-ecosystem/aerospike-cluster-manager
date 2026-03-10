import { create } from "zustand";
import type { AerospikeRecord, QueryPredicate, QueryResponse } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/utils";

interface QueryState {
  namespace: string;
  set: string;
  predicate: QueryPredicate | null;
  selectBins: string[];
  expression: string;
  maxRecords: number;
  primaryKey: string;

  results: AerospikeRecord[];
  executionTimeMs: number;
  scannedRecords: number;
  returnedRecords: number;
  loading: boolean;
  error: string | null;
  hasExecuted: boolean;

  setNamespace: (ns: string) => void;
  setSet: (set: string) => void;
  setPredicate: (pred: QueryPredicate | null) => void;
  setSelectBins: (bins: string[]) => void;
  setExpression: (expr: string) => void;
  setMaxRecords: (max: number) => void;
  setPrimaryKey: (pk: string) => void;
  executeQuery: (connId: string) => Promise<void>;
  reset: () => void;
}

export const useQueryStore = create<QueryState>()((set, get) => ({
  namespace: "",
  set: "",
  predicate: null,
  selectBins: [],
  expression: "",
  maxRecords: 100,
  primaryKey: "",

  results: [],
  executionTimeMs: 0,
  scannedRecords: 0,
  returnedRecords: 0,
  loading: false,
  error: null,
  hasExecuted: false,

  setNamespace: (ns) => set({ namespace: ns, results: [], error: null, hasExecuted: false }),
  setSet: (s) => set({ set: s, results: [], error: null, hasExecuted: false }),
  setPredicate: (pred) => set({ predicate: pred }),
  setSelectBins: (bins) => set({ selectBins: bins }),
  setExpression: (expr) => set({ expression: expr }),
  setMaxRecords: (max) => set({ maxRecords: max }),
  setPrimaryKey: (pk) => set({ primaryKey: pk }),

  executeQuery: async (connId) => {
    const state = get();
    set({ loading: true, error: null });
    try {
      const result: QueryResponse = await api.executeQuery(connId, {
        namespace: state.namespace,
        set: state.set || undefined,
        predicate: state.predicate || undefined,
        selectBins: state.selectBins.length > 0 ? state.selectBins : undefined,
        expression: state.expression || undefined,
        maxRecords: state.maxRecords,
        primaryKey: state.primaryKey || undefined,
      });
      set({
        results: result.records,
        executionTimeMs: result.executionTimeMs,
        scannedRecords: result.scannedRecords,
        returnedRecords: result.returnedRecords,
        loading: false,
        hasExecuted: true,
      });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  reset: () =>
    set({
      namespace: "",
      set: "",
      predicate: null,
      selectBins: [],
      expression: "",
      primaryKey: "",
      results: [],
      executionTimeMs: 0,
      scannedRecords: 0,
      returnedRecords: 0,
      hasExecuted: false,
      error: null,
    }),
}));
