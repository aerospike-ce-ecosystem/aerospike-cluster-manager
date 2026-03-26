// === Records ===
export type BinValue =
  | string
  | number
  | boolean
  | null
  | BinValue[]
  | { [key: string]: BinValue }
  | GeoJSON;

export interface GeoJSON {
  type: "Point" | "Polygon" | "AeroCircle";
  coordinates: number[] | number[][] | number[][][];
}

export interface RecordKey {
  namespace: string;
  set: string;
  pk: string;
  digest?: string;
}

export interface RecordMeta {
  generation: number;
  ttl: number;
  lastUpdateMs?: number;
}

export interface AerospikeRecord {
  key: RecordKey;
  meta: RecordMeta;
  bins: Record<string, BinValue>;
}

export interface RecordListResponse {
  records: AerospikeRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalEstimated?: boolean;
}

export interface RecordWriteRequest {
  key: RecordKey;
  bins: Record<string, BinValue>;
  ttl?: number;
}

// === Bin Editor ===
export interface BinEntry {
  id: string;
  name: string;
  value: string;
  type: "string" | "integer" | "float" | "bool" | "list" | "map" | "bytes" | "geojson";
}
