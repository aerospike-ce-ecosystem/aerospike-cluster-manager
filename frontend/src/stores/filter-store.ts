import { create } from "zustand";
import type { BinDataType, FilterCondition, FilterGroup, FilterOperator } from "@/lib/api/types";
import { FILTER_OPERATORS_BY_TYPE } from "@/lib/constants";
import { uuid } from "@/lib/utils";

interface FilterState {
  conditions: FilterCondition[];
  logic: "and" | "or";
  primaryKey: string;

  addCondition: (bin: string, binType: BinDataType) => FilterCondition;
  updateCondition: (id: string, updates: Partial<Omit<FilterCondition, "id">>) => void;
  removeCondition: (id: string) => void;
  clearAll: () => void;
  setLogic: (logic: "and" | "or") => void;
  setPrimaryKey: (pk: string) => void;
  toFilterGroup: () => FilterGroup | undefined;
  reset: () => void;
}

export const useFilterStore = create<FilterState>()((set, get) => ({
  conditions: [],
  logic: "and",
  primaryKey: "",

  addCondition: (bin, binType) => {
    const operators = FILTER_OPERATORS_BY_TYPE[binType];
    const defaultOp = operators[0]?.value ?? ("eq" as FilterOperator);
    const condition: FilterCondition = {
      id: uuid(),
      bin,
      operator: defaultOp,
      binType,
    };
    set((state) => ({ conditions: [...state.conditions, condition] }));
    return condition;
  },

  updateCondition: (id, updates) => {
    set((state) => ({
      conditions: state.conditions.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
  },

  removeCondition: (id) => {
    set((state) => ({ conditions: state.conditions.filter((c) => c.id !== id) }));
  },

  clearAll: () => set({ conditions: [], primaryKey: "" }),

  setLogic: (logic) => set({ logic }),

  setPrimaryKey: (pk) => set({ primaryKey: pk }),

  toFilterGroup: () => {
    const { conditions, logic } = get();
    if (conditions.length === 0) return undefined;
    // Strip client-side `id` field before sending to API
    return {
      logic,
      conditions: conditions.map(({ id: _id, ...rest }) => rest) as Omit<FilterCondition, "id">[],
    } as FilterGroup;
  },

  reset: () => set({ conditions: [], logic: "and", primaryKey: "" }),
}));
