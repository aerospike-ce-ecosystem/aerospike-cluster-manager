/**
 * Filter store — holds primary-key lookup value and the list of filter
 * conditions (with client-side ids) that drive the record browser's
 * filter toolbar / chips.
 *
 * The backend `FilterCondition` model has no `id`; we add one on the client
 * to identify chips for edit / remove. `toFilterGroup()` strips ids before
 * sending to the API.
 */

import { create } from "zustand"

import { FILTER_OPERATORS_BY_TYPE } from "@/lib/constants"
import type {
  BinDataType,
  FilterCondition,
  FilterGroup,
  FilterOperator,
} from "@/lib/types/query"

export interface FilterConditionWithId extends FilterCondition {
  id: string
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `fc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

interface FilterState {
  conditions: FilterConditionWithId[]
  logic: "and" | "or"
  primaryKey: string

  addCondition: (bin: string, binType: BinDataType) => FilterConditionWithId
  updateCondition: (
    id: string,
    updates: Partial<Omit<FilterConditionWithId, "id">>,
  ) => void
  removeCondition: (id: string) => void
  clearAll: () => void
  setLogic: (logic: "and" | "or") => void
  setPrimaryKey: (pk: string) => void
  /** Serialize for API — drops client-side `id` and returns `undefined` when empty. */
  toFilterGroup: () => FilterGroup | undefined
  reset: () => void
}

export const useFilterStore = create<FilterState>()((set, get) => ({
  conditions: [],
  logic: "and",
  primaryKey: "",

  addCondition: (bin, binType) => {
    const operators = FILTER_OPERATORS_BY_TYPE[binType]
    const defaultOp = operators[0]?.value ?? ("eq" as FilterOperator)
    const condition: FilterConditionWithId = {
      id: uuid(),
      bin,
      operator: defaultOp,
      binType,
    }
    set((state) => ({ conditions: [...state.conditions, condition] }))
    return condition
  },

  updateCondition: (id, updates) => {
    set((state) => ({
      conditions: state.conditions.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    }))
  },

  removeCondition: (id) => {
    set((state) => ({
      conditions: state.conditions.filter((c) => c.id !== id),
    }))
  },

  clearAll: () => set({ conditions: [], primaryKey: "" }),

  setLogic: (logic) => set({ logic }),

  setPrimaryKey: (pk) => set({ primaryKey: pk }),

  toFilterGroup: () => {
    const { conditions, logic } = get()
    if (conditions.length === 0) return undefined
    return {
      logic,
      conditions: conditions.map(({ id: _id, ...rest }) => rest),
    }
  },

  reset: () => set({ conditions: [], logic: "and", primaryKey: "" }),
}))
