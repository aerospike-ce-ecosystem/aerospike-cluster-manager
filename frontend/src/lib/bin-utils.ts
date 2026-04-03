import type { AerospikeRecord, BinValue, BinEntry } from "@/lib/api/types";
import type { BinType } from "@/lib/constants";
import { uuid } from "@/lib/utils";

export function parseBinValue(value: string, type: BinType): BinValue {
  switch (type) {
    case "integer": {
      const n = parseInt(value, 10);
      return isNaN(n) ? 0 : n;
    }
    case "float": {
      const f = parseFloat(value);
      return isNaN(f) ? 0 : f;
    }
    case "bool":
      return value.toLowerCase() === "true";
    case "list":
    case "map":
    case "geojson":
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    case "bytes":
      return value;
    default:
      return value;
  }
}

export function detectBinType(value: BinValue | undefined): BinType {
  if (value === null || value === undefined) return "string";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "float";
  if (Array.isArray(value)) return "list";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("type" in obj && "coordinates" in obj) return "geojson";
    return "map";
  }
  return "string";
}

export function serializeBinValue(value: BinValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function createEmptyBinEntry(): BinEntry {
  return { id: uuid(), name: "", value: "", type: "string" };
}

export function buildBinEntriesFromRecord(record: AerospikeRecord): BinEntry[] {
  return Object.entries(record.bins).map(([name, value]) => ({
    id: uuid(),
    name,
    value: serializeBinValue(value),
    type: detectBinType(value),
  }));
}
