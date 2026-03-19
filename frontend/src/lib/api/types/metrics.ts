// === Metrics ===
export interface MetricPoint {
  timestamp: number;
  value: number;
}

export interface MetricSeries {
  name: string;
  label: string;
  data: MetricPoint[];
  color?: string;
}

export interface NamespaceMetrics {
  namespace: string;
  objects: number;
  memoryUsed: number;
  memoryTotal: number;
  deviceUsed: number;
  deviceTotal: number;
  readReqs: number;
  writeReqs: number;
  readSuccess: number;
  writeSuccess: number;
}

export interface ClusterMetrics {
  connectionId: string;
  timestamp: number;
  connected: boolean;
  uptime: number;
  clientConnections: number;
  totalReadReqs: number;
  totalWriteReqs: number;
  totalReadSuccess: number;
  totalWriteSuccess: number;
  namespaces: NamespaceMetrics[];
  readTps: MetricPoint[];
  writeTps: MetricPoint[];
  connectionHistory: MetricPoint[];
  memoryUsageByNs: MetricSeries[];
  deviceUsageByNs: MetricSeries[];
}

export interface PrometheusMetric {
  name: string;
  type: "counter" | "gauge" | "histogram" | "summary";
  help: string;
  value: number;
  labels: Record<string, string>;
  category: string;
}
