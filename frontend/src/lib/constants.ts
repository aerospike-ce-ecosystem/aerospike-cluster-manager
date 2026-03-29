import type { BinDataType, FilterOperator } from "@/lib/api/types";

export const CE_LIMITS = {
  MAX_NODES: 8,
  MAX_NAMESPACES: 2,
  MAX_DATA_TB: 5,
  DURABLE_DELETE: false,
  XDR: false,
} as const;

export const BRAND_COLORS = {
  primary: "#2563EB",
  accent: "#F59E0B",
  navy: "#111827",
  success: "#059669",
  error: "#DC2626",
} as const;

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export const DEFAULT_PAGE_SIZE = 25;

export const MAX_QUERY_RECORDS = 10_000;

export const METRIC_HISTORY_POINTS = 60;
export const METRIC_INTERVAL_MS = 2000;

export const K8S_DETAIL_POLL_INTERVAL_MS = 5_000;
export const K8S_DETAIL_POLL_MAX_BACKOFF_MS = 60_000;
export const SIDEBAR_HEALTH_POLL_INTERVAL_MS = 30_000;

// SSE (Server-Sent Events) streaming
export const SSE_RECONNECT_BASE_MS = 1_000;
export const SSE_RECONNECT_MAX_MS = 30_000;
export const SSE_HEARTBEAT_TIMEOUT_MS = 45_000;
export const SSE_MAX_RETRIES_BEFORE_FALLBACK = 3;

export const PRESET_COLORS = [
  "#0097D3",
  "#c4373a",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
] as const;

export const BIN_TYPES = [
  "string",
  "integer",
  "float",
  "bool",
  "list",
  "map",
  "bytes",
  "geojson",
] as const;

export type BinType = (typeof BIN_TYPES)[number];

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
};

/** Operators that require NO value input */
export const NO_VALUE_OPERATORS: FilterOperator[] = ["exists", "not_exists", "is_true", "is_false"];

/** Operators that require TWO value inputs */
export const DUAL_VALUE_OPERATORS: FilterOperator[] = ["between"];

export const AEROSPIKE_IMAGES = ["aerospike:ce-8.1.1.1"] as const;

export const BIN_TYPE_COLORS: Record<BinType, string> = {
  string: "bg-[#059669]/10 text-[#059669] border-[#059669]/20",
  integer: "bg-[#2563EB]/10 text-[#2563EB] border-[#2563EB]/20",
  float: "bg-[#7C3AED]/10 text-[#7C3AED] border-[#7C3AED]/20",
  bool: "bg-[#D97706]/10 text-[#D97706] border-[#D97706]/20",
  list: "bg-[#0891B2]/10 text-[#0891B2] border-[#0891B2]/20",
  map: "bg-[#DB2777]/10 text-[#DB2777] border-[#DB2777]/20",
  bytes: "bg-base-200 text-muted-foreground border-base-300",
  geojson: "bg-[#059669]/10 text-[#059669] border-[#059669]/20",
};

export const BIN_TYPE_BORDER_COLORS: Record<BinType, string> = {
  string: "border-l-[#059669]/40",
  integer: "border-l-[#2563EB]/40",
  float: "border-l-[#7C3AED]/40",
  bool: "border-l-[#D97706]/40",
  list: "border-l-[#0891B2]/40",
  map: "border-l-[#DB2777]/40",
  bytes: "border-l-muted-foreground/20",
  geojson: "border-l-[#059669]/40",
};
