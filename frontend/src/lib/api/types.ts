// === Connection ===
export interface ConnectionProfile {
  id: string;
  name: string;
  hosts: string[];
  port: number;
  clusterName?: string;
  username?: string;
  password?: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionStatus {
  connected: boolean;
  nodeCount: number;
  namespaceCount: number;
  build?: string;
  edition?: string;
}

export interface ConnectionWithStatus extends ConnectionProfile {
  status?: ConnectionStatus;
}

// === Cluster ===
export interface ClusterNode {
  name: string;
  address: string;
  port: number;
  build: string;
  edition: string;
  clusterSize: number;
  uptime: number;
  clientConnections: number;
  statistics: Record<string, string | number>;
}

export interface NamespaceInfo {
  name: string;
  objects: number;
  memoryUsed: number;
  memoryTotal: number;
  memoryFreePct: number;
  deviceUsed: number;
  deviceTotal: number;
  replicationFactor: number;
  stopWrites: boolean;
  hwmBreached: boolean;
  highWaterMemoryPct: number;
  highWaterDiskPct: number;
  nsupPeriod: number;
  defaultTtl: number;
  allowTtlWithoutNsup: boolean;
  sets: SetInfo[];
}

export interface SetInfo {
  name: string;
  namespace: string;
  objects: number;
  tombstones: number;
  memoryDataBytes: number;
  stopWritesCount: number;
  nodeCount?: number;
  totalNodes?: number;
}

export interface ClusterInfo {
  connectionId: string;
  nodes: ClusterNode[];
  namespaces: NamespaceInfo[];
}

export interface ConfigureNamespaceRequest {
  name: string;
  memorySize: number;
  replicationFactor: number;
}

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
}

export interface RecordWriteRequest {
  key: RecordKey;
  bins: Record<string, BinValue>;
  ttl?: number;
}

// === Query ===
export type PredicateOperator =
  | "equals"
  | "between"
  | "contains"
  | "geo_within_region"
  | "geo_contains_point";

export interface QueryPredicate {
  bin: string;
  operator: PredicateOperator;
  value: BinValue;
  value2?: BinValue; // for 'between'
}

export interface QueryRequest {
  namespace: string;
  set?: string;
  predicate?: QueryPredicate;
  selectBins?: string[];
  expression?: string; // raw JSON expression
  maxRecords?: number;
  primaryKey?: string;
}

export interface QueryResponse {
  records: AerospikeRecord[];
  executionTimeMs: number;
  scannedRecords: number;
  returnedRecords: number;
}

// === Filter ===
export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "ge"
  | "lt"
  | "le"
  | "between"
  | "contains"
  | "not_contains"
  | "regex"
  | "exists"
  | "not_exists"
  | "is_true"
  | "is_false"
  | "geo_within"
  | "geo_contains";

export type BinDataType = "integer" | "float" | "string" | "bool" | "list" | "map" | "geo";

export interface FilterCondition {
  id: string;
  bin: string;
  operator: FilterOperator;
  value?: BinValue;
  value2?: BinValue;
  binType: BinDataType;
}

export interface FilterGroup {
  logic: "and" | "or";
  conditions: FilterCondition[];
}

export interface FilteredQueryRequest {
  namespace: string;
  set?: string;
  filters?: FilterGroup;
  predicate?: QueryPredicate;
  selectBins?: string[];
  maxRecords?: number;
  page?: number;
  pageSize?: number;
  primaryKey?: string;
}

export interface FilteredQueryResponse {
  records: AerospikeRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  executionTimeMs: number;
  scannedRecords: number;
  returnedRecords: number;
}

// === Index ===
export type IndexType = "numeric" | "string" | "geo2dsphere";
export type IndexState = "ready" | "building" | "error";

export interface SecondaryIndex {
  name: string;
  namespace: string;
  set: string;
  bin: string;
  type: IndexType;
  state: IndexState;
}

export interface CreateIndexRequest {
  namespace: string;
  set: string;
  bin: string;
  name: string;
  type: IndexType;
}

// === Admin ===
export interface AerospikeUser {
  username: string;
  roles: string[];
  readQuota: number;
  writeQuota: number;
  connections: number;
}

export interface AerospikeRole {
  name: string;
  privileges: Privilege[];
  whitelist: string[];
  readQuota: number;
  writeQuota: number;
}

export interface Privilege {
  code: string;
  namespace?: string;
  set?: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  roles: string[];
}

export interface CreateRoleRequest {
  name: string;
  privileges: Privilege[];
  whitelist?: string[];
  readQuota?: number;
  writeQuota?: number;
}

// === UDF ===
export type UDFType = "LUA";

export interface UDFModule {
  filename: string;
  type: UDFType;
  hash: string;
  content?: string;
}

export interface ApplyUDFRequest {
  key: RecordKey;
  module: string;
  functionName: string;
  args: BinValue[];
}

// === Terminal ===
export interface TerminalCommand {
  id: string;
  command: string;
  output: string;
  timestamp: string;
  success: boolean;
}

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

// === Sample Data ===
export interface CreateSampleDataRequest {
  namespace: string;
  setName?: string;
  recordCount?: number;
  createIndexes?: boolean;
  registerUdfs?: boolean;
}

export interface CreateSampleDataResponse {
  recordsCreated: number;
  indexesCreated: string[];
  indexesSkipped: string[];
  udfsRegistered: string[];
  elapsedMs: number;
}

// === K8s ACL & Rolling Update ===
export interface ACLRoleSpec {
  name: string;
  privileges: string[];
  whitelist?: string[];
}

export interface ACLUserSpec {
  name: string;
  secretName: string;
  roles: string[];
}

export interface ACLConfig {
  enabled: boolean;
  roles: ACLRoleSpec[];
  users: ACLUserSpec[];
  adminPolicyTimeout: number;
}

export interface RollingUpdateConfig {
  batchSize?: number;
  maxUnavailable?: string;
  disablePDB: boolean;
}

export interface OperationStatusResponse {
  id: string;
  kind: string;
  phase: string;
  completedPods: string[];
  failedPods: string[];
}

// === K8s Cluster Management ===
export type K8sClusterPhase =
  | "InProgress"
  | "Completed"
  | "Error"
  | "ScalingUp"
  | "ScalingDown"
  | "WaitingForMigration"
  | "RollingRestart"
  | "ACLSync"
  | "Paused"
  | "Deleting"
  | "Unknown";

/** Phases that indicate the cluster is transitioning and should trigger auto-refresh. */
export const TRANSITIONAL_PHASES: K8sClusterPhase[] = [
  "InProgress",
  "ScalingUp",
  "ScalingDown",
  "WaitingForMigration",
  "RollingRestart",
  "ACLSync",
  "Deleting",
];

export interface K8sClusterCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface K8sClusterEvent {
  type?: string;
  reason?: string;
  message?: string;
  count?: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  source?: string;
}

export interface K8sPodStatus {
  name: string;
  podIP: string | null;
  hostIP: string | null;
  isReady: boolean;
  phase: string;
  image: string | null;
  dynamicConfigStatus?: "Applied" | "Failed" | "Pending";
  lastRestartReason?: string;
  lastRestartTime?: string;
}

export interface K8sClusterSummary {
  name: string;
  namespace: string;
  size: number;
  image: string;
  phase: K8sClusterPhase;
  age: string | null;
  connectionId: string | null;
  autoConnectWarning: string | null;
}

export interface K8sClusterDetail {
  name: string;
  namespace: string;
  size: number;
  image: string;
  phase: K8sClusterPhase;
  phaseReason?: string;
  age: string | null;
  spec: Record<string, unknown>;
  status: Record<string, unknown>;
  pods: K8sPodStatus[];
  conditions: K8sClusterCondition[];
  connectionId: string | null;
  operationStatus?: OperationStatusResponse;
  failedReconcileCount: number;
  lastReconcileError?: string;
}

export interface AerospikeNamespaceStorage {
  type: "memory" | "device";
  dataSize?: number;
  file?: string;
  filesize?: number;
}

export interface AerospikeNamespaceConfig {
  name: string;
  replicationFactor: number;
  storageEngine: AerospikeNamespaceStorage;
}

export interface StorageVolumeConfig {
  storageClass: string;
  size: string;
  mountPath: string;
}

export interface ResourceSpec {
  cpu: string;
  memory: string;
}

export interface ResourceConfig {
  requests: ResourceSpec;
  limits: ResourceSpec;
}

export interface MonitoringConfig {
  enabled: boolean;
  port: number;
}

export interface CreateK8sClusterRequest {
  name: string;
  namespace: string;
  size: number;
  image: string;
  namespaces: AerospikeNamespaceConfig[];
  storage?: StorageVolumeConfig;
  resources?: ResourceConfig;
  monitoring?: MonitoringConfig;
  templateRef?: string;
  enableDynamicConfig?: boolean;
  autoConnect: boolean;
  acl?: ACLConfig;
  rollingUpdate?: RollingUpdateConfig;
}

export interface UpdateK8sClusterRequest {
  size?: number;
  image?: string;
  resources?: ResourceConfig;
  monitoring?: MonitoringConfig;
  paused?: boolean;
  enableDynamicConfig?: boolean;
  aerospikeConfig?: Record<string, unknown>;
}

export interface ScaleK8sClusterRequest {
  size: number;
}

export interface OperationRequest {
  kind: "WarmRestart" | "PodRestart";
  id?: string;
  podList?: string[];
}

export interface K8sTemplateSummary {
  name: string;
  namespace: string;
  image?: string;
  size?: number;
  age?: string;
}

export interface K8sTemplateDetail {
  name: string;
  namespace: string;
  spec: Record<string, unknown>;
  age?: string;
}
