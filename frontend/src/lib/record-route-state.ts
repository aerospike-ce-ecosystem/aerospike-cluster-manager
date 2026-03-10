import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type { BinDataType, FilterCondition, FilterOperator } from "@/lib/api/types";

type FilterLogic = "and" | "or";

export interface RecordFilterRouteState {
  logic: FilterLogic;
  conditions: FilterCondition[];
}

export interface RecordListRouteState {
  page: number;
  pageSize: number;
  primaryKey: string;
  filters?: RecordFilterRouteState;
}

function encodeUtf8Base64Url(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeUtf8Base64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }

  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeLogic(value: unknown): FilterLogic {
  return value === "or" ? "or" : "and";
}

const VALID_OPERATORS: readonly FilterOperator[] = [
  "eq",
  "ne",
  "gt",
  "ge",
  "lt",
  "le",
  "between",
  "contains",
  "not_contains",
  "regex",
  "exists",
  "not_exists",
  "is_true",
  "is_false",
  "geo_within",
  "geo_contains",
] as const;

const VALID_BIN_TYPES: readonly BinDataType[] = [
  "integer",
  "float",
  "string",
  "bool",
  "list",
  "map",
  "geo",
] as const;

function isValidOperator(value: string): value is FilterOperator {
  return (VALID_OPERATORS as readonly string[]).includes(value);
}

function isValidBinType(value: string): value is BinDataType {
  return (VALID_BIN_TYPES as readonly string[]).includes(value);
}

function sanitizeConditions(value: unknown): FilterCondition[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((condition, index) => {
    if (!condition || typeof condition !== "object") return [];

    const candidate = condition as Partial<FilterCondition>;
    if (
      typeof candidate.bin !== "string" ||
      typeof candidate.operator !== "string" ||
      typeof candidate.binType !== "string"
    ) {
      return [];
    }

    if (!isValidOperator(candidate.operator) || !isValidBinType(candidate.binType)) {
      return [];
    }

    return [
      {
        ...candidate,
        id:
          typeof candidate.id === "string" && candidate.id.length > 0
            ? candidate.id
            : `restored-${index}`,
        bin: candidate.bin,
        operator: candidate.operator,
        binType: candidate.binType,
      } as FilterCondition,
    ];
  });
}

export function serializeRecordFilters(filters: RecordFilterRouteState | undefined) {
  if (!filters || filters.conditions.length === 0) return undefined;

  return encodeUtf8Base64Url(
    JSON.stringify({
      logic: sanitizeLogic(filters.logic),
      conditions: filters.conditions,
    }),
  );
}

export function deserializeRecordFilters(value: string | null | undefined) {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(decodeUtf8Base64Url(value)) as {
      logic?: unknown;
      conditions?: unknown;
    };

    const conditions = sanitizeConditions(parsed.conditions);
    if (conditions.length === 0) return undefined;

    return {
      logic: sanitizeLogic(parsed.logic),
      conditions,
    } satisfies RecordFilterRouteState;
  } catch {
    return undefined;
  }
}

export function readRecordListRouteState(
  searchParams: URLSearchParams,
  defaultPageSize = DEFAULT_PAGE_SIZE,
): RecordListRouteState {
  return {
    page: parsePositiveInteger(searchParams.get("page"), 1),
    pageSize: parsePositiveInteger(searchParams.get("pageSize"), defaultPageSize),
    primaryKey: searchParams.get("primaryKey")?.trim() ?? "",
    filters: deserializeRecordFilters(searchParams.get("filters")),
  };
}

export function buildRecordListSearchParams(
  state: RecordListRouteState,
  defaultPageSize = DEFAULT_PAGE_SIZE,
) {
  const params = new URLSearchParams();

  if (state.page > 1) {
    params.set("page", String(state.page));
  }

  if (state.pageSize !== defaultPageSize) {
    params.set("pageSize", String(state.pageSize));
  }

  if (state.primaryKey.trim()) {
    params.set("primaryKey", state.primaryKey.trim());
  }

  const encodedFilters = serializeRecordFilters(state.filters);
  if (encodedFilters) {
    params.set("filters", encodedFilters);
  }

  return params;
}

function buildSetPath(connId: string, namespace: string, setName: string) {
  return `/browser/${encodeURIComponent(connId)}/${encodeURIComponent(namespace)}/${encodeURIComponent(setName)}`;
}

export function buildRecordDetailHref(input: {
  connId: string;
  namespace: string;
  setName: string;
  pk: string;
  intent?: "edit";
  returnTo?: string;
}) {
  const params = new URLSearchParams({ pk: input.pk });

  if (input.intent === "edit") {
    params.set("intent", input.intent);
  }

  if (input.returnTo) {
    params.set("returnTo", input.returnTo);
  }

  return `${buildSetPath(input.connId, input.namespace, input.setName)}/record?${params.toString()}`;
}

export function buildNewRecordHref(input: {
  connId: string;
  namespace: string;
  setName: string;
  returnTo?: string;
}) {
  const basePath = `${buildSetPath(input.connId, input.namespace, input.setName)}/record/new`;
  if (!input.returnTo) return basePath;

  const params = new URLSearchParams({ returnTo: input.returnTo });
  return `${basePath}?${params.toString()}`;
}

export function buildDefaultReturnTo(connId: string, namespace: string, setName: string) {
  return buildSetPath(connId, namespace, setName);
}

export function buildCurrentListReturnTo(
  pathname: string,
  searchParams: Pick<URLSearchParams, "toString">,
) {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function resolveReturnTo(returnTo: string | null | undefined, fallback: string) {
  if (!returnTo) return fallback;
  return returnTo.startsWith("/") ? returnTo : fallback;
}
