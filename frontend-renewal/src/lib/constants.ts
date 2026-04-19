import type { BinDataType, FilterOperator } from "@/lib/types/query"

export const CE_LIMITS = {
  MAX_NODES: 8,
  MAX_NAMESPACES: 2,
  MAX_DATA_TB: 5,
  DURABLE_DELETE: false,
  XDR: false,
} as const

export const BRAND_COLORS = {
  primary: "#2563EB",
  accent: "#F59E0B",
  navy: "#111827",
  success: "#059669",
  error: "#DC2626",
} as const

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

export const DEFAULT_PAGE_SIZE = 25

export const MAX_QUERY_RECORDS = 10_000

export const METRIC_HISTORY_POINTS = 60
export const METRIC_INTERVAL_MS = 5000

export const K8S_DETAIL_POLL_INTERVAL_MS = 5_000
export const K8S_DETAIL_POLL_MAX_BACKOFF_MS = 60_000
export const SIDEBAR_HEALTH_POLL_INTERVAL_MS = 30_000

// SSE (Server-Sent Events) streaming
export const SSE_RECONNECT_BASE_MS = 1_000
export const SSE_RECONNECT_MAX_MS = 30_000
export const SSE_HEARTBEAT_TIMEOUT_MS = 45_000
export const SSE_MAX_RETRIES_BEFORE_FALLBACK = 3

export const PRESET_COLORS = [
  "#0097D3",
  "#c4373a",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
] as const

export const BIN_TYPES = [
  "string",
  "integer",
  "float",
  "bool",
  "list",
  "map",
  "bytes",
  "geojson",
] as const

export type BinType = (typeof BIN_TYPES)[number]

export const FILTER_OPERATORS_BY_TYPE: Record<
  BinDataType,
  { value: FilterOperator; label: string }[]
> = {
  integer: [
    { value: "eq", label: "=" },
    { value: "ne", label: "≠" },
    { value: "gt", label: ">" },
    { value: "ge", label: "≥" },
    { value: "lt", label: "<" },
    { value: "le", label: "≤" },
    { value: "between", label: "Between" },
    { value: "exists", label: "Exists" },
    { value: "not_exists", label: "Not Exists" },
  ],
  float: [
    { value: "eq", label: "=" },
    { value: "ne", label: "≠" },
    { value: "gt", label: ">" },
    { value: "ge", label: "≥" },
    { value: "lt", label: "<" },
    { value: "le", label: "≤" },
    { value: "between", label: "Between" },
    { value: "exists", label: "Exists" },
    { value: "not_exists", label: "Not Exists" },
  ],
  string: [
    { value: "eq", label: "Equals" },
    { value: "ne", label: "Not Equals" },
    { value: "contains", label: "Contains" },
    { value: "not_contains", label: "Not Contains" },
    { value: "regex", label: "Regex" },
    { value: "exists", label: "Exists" },
    { value: "not_exists", label: "Not Exists" },
  ],
  bool: [
    { value: "is_true", label: "Is True" },
    { value: "is_false", label: "Is False" },
    { value: "exists", label: "Exists" },
  ],
  geo: [
    { value: "geo_within", label: "Within Region" },
    { value: "geo_contains", label: "Contains Point" },
    { value: "exists", label: "Exists" },
  ],
  list: [
    { value: "exists", label: "Exists" },
    { value: "not_exists", label: "Not Exists" },
  ],
  map: [
    { value: "exists", label: "Exists" },
    { value: "not_exists", label: "Not Exists" },
  ],
}

/** Operators that require NO value input */
export const NO_VALUE_OPERATORS: FilterOperator[] = [
  "exists",
  "not_exists",
  "is_true",
  "is_false",
]

/** Operators that require TWO value inputs */
export const DUAL_VALUE_OPERATORS: FilterOperator[] = ["between"]

export const AEROSPIKE_IMAGES = ["aerospike:ce-8.1.1.1"] as const

export const BIN_TYPE_COLORS: Record<BinType, string> = {
  string:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/30 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/30",
  integer:
    "bg-blue-50 text-blue-700 ring-blue-600/30 dark:bg-blue-400/10 dark:text-blue-400 dark:ring-blue-400/30",
  float:
    "bg-violet-50 text-violet-700 ring-violet-600/30 dark:bg-violet-400/10 dark:text-violet-400 dark:ring-violet-400/30",
  bool: "bg-amber-50 text-amber-700 ring-amber-600/30 dark:bg-amber-400/10 dark:text-amber-400 dark:ring-amber-400/30",
  list: "bg-cyan-50 text-cyan-700 ring-cyan-600/30 dark:bg-cyan-400/10 dark:text-cyan-400 dark:ring-cyan-400/30",
  map: "bg-pink-50 text-pink-700 ring-pink-600/30 dark:bg-pink-400/10 dark:text-pink-400 dark:ring-pink-400/30",
  bytes:
    "bg-gray-50 text-gray-700 ring-gray-500/30 dark:bg-gray-400/10 dark:text-gray-300 dark:ring-gray-400/30",
  geojson:
    "bg-rose-50 text-rose-700 ring-rose-600/30 dark:bg-rose-400/10 dark:text-rose-400 dark:ring-rose-400/30",
}

export const BIN_TYPE_BORDER_COLORS: Record<BinType, string> = {
  string: "border-l-emerald-500/40",
  integer: "border-l-blue-500/40",
  float: "border-l-violet-500/40",
  bool: "border-l-amber-500/40",
  list: "border-l-cyan-500/40",
  map: "border-l-pink-500/40",
  bytes: "border-l-gray-400/20",
  geojson: "border-l-rose-500/40",
}
