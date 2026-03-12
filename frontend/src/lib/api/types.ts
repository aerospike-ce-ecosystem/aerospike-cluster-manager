// === Pagination ===

/**
 * Standardized paginated response envelope.
 * Matches the backend's PaginatedResponse[T] model.
 * New endpoints should return this shape; existing endpoints (e.g. RecordListResponse)
 * keep their current shape for backward compatibility.
 */
export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number | null;
  hasMore: boolean;
}

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

export interface RackPodSpecConfig {
  affinity?: Record<string, unknown>;
  tolerations?: TolerationConfig[];
  nodeSelector?: Record<string, string>;
}

export interface RackStorageConfig {
  volumes?: Record<string, unknown>[];
}

export interface RackConfig {
  id: number;
  zone?: string;
  region?: string;
  rackLabel?: string;
  nodeName?: string;
  aerospikeConfig?: Record<string, unknown>;
  storage?: RackStorageConfig;
  podSpec?: RackPodSpecConfig;
}

export interface RackAwareConfig {
  racks: RackConfig[];
  namespaces?: string[];
  scaleDownBatchSize?: string;
  maxIgnorablePods?: string;
  rollingUpdateBatchSize?: string;
}

export interface ClusterHealthSummary {
  phase: K8sClusterPhase;
  totalPods: number;
  readyPods: number;
  desiredPods: number;
  migrating: boolean;
  available: boolean;
  configApplied: boolean;
  aclSynced: boolean;
  failedReconcileCount: number;
  pendingRestartCount: number;
  rackDistribution: { id: number; total: number; ready: number }[];
}

export interface K8sNodeInfo {
  name: string;
  zone: string;
  region: string;
  ready: boolean;
}

export interface OperationStatusResponse {
  id: string;
  kind: string;
  phase: string;
  completedPods: string[];
  failedPods: string[];
  podList: string[];
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

export type EventCategory =
  | "Rolling Restart"
  | "Configuration"
  | "ACL Security"
  | "Rack Management"
  | "Scaling"
  | "Lifecycle"
  | "Monitoring"
  | "Network"
  | "Template"
  | "Circuit Breaker"
  | "Other";

export const EVENT_CATEGORIES: EventCategory[] = [
  "Lifecycle",
  "Rolling Restart",
  "Configuration",
  "ACL Security",
  "Scaling",
  "Rack Management",
  "Network",
  "Monitoring",
  "Template",
  "Circuit Breaker",
  "Other",
];

export interface K8sClusterEvent {
  type?: string;
  reason?: string;
  message?: string;
  count?: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  source?: string;
  category?: EventCategory;
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
  nodeId?: string;
  rackId?: number;
  configHash?: string;
  podSpecHash?: string;
  accessEndpoints?: string[] | null;
  readinessGateSatisfied?: boolean | null;
  unstableSince?: string | null;
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
  spec: AerospikeClusterSpec;
  status: Record<string, unknown>;
  pods: K8sPodStatus[];
  conditions: K8sClusterCondition[];
  connectionId: string | null;
  operationStatus?: OperationStatusResponse;
  failedReconcileCount: number;
  lastReconcileError?: string;
  aerospikeClusterSize?: number;
  pendingRestartPods: string[];
  lastReconcileTime?: string;
  operatorVersion?: string;
  templateSnapshot?: TemplateSnapshot;
}

export interface ReconciliationStatus {
  circuitBreakerActive: boolean;
  failedReconcileCount: number;
  circuitBreakerThreshold: number;
  lastReconcileError: string | null;
  lastReconcileTime: string | null;
  estimatedBackoffSeconds: number | null;
  phase: string;
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
  initMethod?: "none" | "deleteFiles" | "dd" | "blkdiscard" | "headerCleanup";
  wipeMethod?:
    | "none"
    | "deleteFiles"
    | "dd"
    | "blkdiscard"
    | "headerCleanup"
    | "blkdiscardWithHeaderCleanup";
  cascadeDelete?: boolean;
  localStorageClasses?: string[];
  deleteLocalStorageOnRestart?: boolean;
}

// --- Multi-volume storage types (matching operator CRD) ---

export type VolumeSourceType =
  | "persistentVolume"
  | "emptyDir"
  | "secret"
  | "configMap"
  | "hostPath";

export type VolumeInitMethod = "none" | "deleteFiles" | "dd" | "blkdiscard" | "headerCleanup";

export type VolumeWipeMethod =
  | "none"
  | "deleteFiles"
  | "dd"
  | "blkdiscard"
  | "headerCleanup"
  | "blkdiscardWithHeaderCleanup";

export interface AerospikeVolumeAttachment {
  path: string;
  readOnly?: boolean;
  subPath?: string;
  subPathExpr?: string;
  mountPropagation?: string;
}

export interface VolumeAttachment extends AerospikeVolumeAttachment {
  containerName: string;
}

export interface PersistentVolumeClaimSource {
  storageClass?: string;
  size: string;
  accessModes?: string[];
  volumeMode?: "Filesystem" | "Block";
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  selector?: Record<string, unknown>;
}

export interface VolumeSpec {
  name: string;
  source: VolumeSourceType;
  persistentVolume?: PersistentVolumeClaimSource;
  emptyDir?: Record<string, unknown>;
  secret?: Record<string, unknown>;
  configMap?: Record<string, unknown>;
  hostPath?: Record<string, unknown>;
  aerospike?: AerospikeVolumeAttachment;
  sidecars?: VolumeAttachment[];
  initContainers?: VolumeAttachment[];
  initMethod?: VolumeInitMethod;
  wipeMethod?: VolumeWipeMethod;
  cascadeDelete?: boolean;
}

export interface StorageSpec {
  volumes: VolumeSpec[];
  filesystemVolumePolicy?: Record<string, unknown>;
  blockVolumePolicy?: Record<string, unknown>;
  cleanupThreads?: number;
  localStorageClasses?: string[];
  deleteLocalStorageOnRestart?: boolean;
}

export type NetworkAccessType = "pod" | "hostInternal" | "hostExternal" | "configuredIP";

export interface NetworkAccessConfig {
  accessType: NetworkAccessType;
  alternateAccessType?: NetworkAccessType;
  fabricType?: NetworkAccessType;
  customAccessNetworkNames?: string[];
  customAlternateAccessNetworkNames?: string[];
  customFabricNetworkNames?: string[];
}

export interface LoadBalancerSpec {
  annotations?: Record<string, string>;
  labels?: Record<string, string>;
  externalTrafficPolicy?: "Cluster" | "Local";
  port: number;
  targetPort: number;
  loadBalancerSourceRanges?: string[];
}

export interface SeedsFinderServicesConfig {
  loadBalancer?: LoadBalancerSpec;
}

export type NetworkPolicyType = "kubernetes" | "cilium";

export interface NetworkPolicyAutoConfig {
  enabled: boolean;
  type: NetworkPolicyType;
}

export interface ResourceSpec {
  cpu: string;
  memory: string;
}

export interface ResourceConfig {
  requests: ResourceSpec;
  limits: ResourceSpec;
}

export interface TolerationConfig {
  key?: string;
  operator?: "Exists" | "Equal";
  value?: string;
  effect?: "NoSchedule" | "PreferNoSchedule" | "NoExecute" | "";
  tolerationSeconds?: number;
}

export interface PodMetadataConfig {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface TopologySpreadConstraintConfig {
  maxSkew: number;
  topologyKey: string;
  whenUnsatisfiable: "DoNotSchedule" | "ScheduleAnyway";
  labelSelector?: Record<string, string>;
}

export interface PodSecurityContextConfig {
  runAsUser?: number;
  runAsGroup?: number;
  runAsNonRoot?: boolean;
  fsGroup?: number;
  supplementalGroups?: number[];
}

export interface PodSchedulingConfig {
  nodeSelector?: Record<string, string>;
  tolerations?: TolerationConfig[];
  multiPodPerHost?: boolean;
  hostNetwork?: boolean;
  serviceAccountName?: string;
  terminationGracePeriodSeconds?: number;
  imagePullSecrets?: string[];
  readinessGateEnabled?: boolean;
  podManagementPolicy?: "OrderedReady" | "Parallel";
  dnsPolicy?: string;
  metadata?: PodMetadataConfig;
  topologySpreadConstraints?: TopologySpreadConstraintConfig[];
  podSecurityContext?: PodSecurityContextConfig;
}

export interface ServiceMonitorConfig {
  enabled: boolean;
  interval?: string;
  labels?: Record<string, string>;
}

export interface PrometheusRuleConfig {
  enabled: boolean;
  labels?: Record<string, string>;
  customRules?: Record<string, unknown>[];
}

export interface MonitoringConfig {
  enabled: boolean;
  port: number;
  exporterImage?: string;
  serviceMonitor?: ServiceMonitorConfig;
  prometheusRule?: PrometheusRuleConfig;
  resources?: ResourceConfig;
  metricLabels?: Record<string, string>;
  exporterEnv?: Record<string, string>[];
}

export interface BandwidthConfig {
  ingress?: string;
  egress?: string;
}

export interface ValidationPolicyConfig {
  skipWorkDirValidate?: boolean;
}

export interface ServiceMetadataConfig {
  annotations?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface ContainerPortConfig {
  name?: string;
  containerPort: number;
  protocol?: string;
}

export interface ContainerEnvConfig {
  name: string;
  value?: string;
  valueFrom?: Record<string, unknown>;
}

export interface ContainerVolumeMountConfig {
  name: string;
  mountPath: string;
  readOnly?: boolean;
}

export interface SidecarConfig {
  name: string;
  image: string;
  ports?: ContainerPortConfig[];
  env?: ContainerEnvConfig[];
  volumeMounts?: ContainerVolumeMountConfig[];
  resources?: ResourceConfig;
  securityContext?: Record<string, unknown>;
  command?: string[];
  args?: string[];
}

export interface CreateK8sClusterRequest {
  name: string;
  namespace: string;
  size: number;
  image: string;
  namespaces: AerospikeNamespaceConfig[];
  storage?: StorageVolumeConfig | StorageSpec;
  resources?: ResourceConfig;
  monitoring?: MonitoringConfig;
  templateRef?: { name: string };
  templateOverrides?: TemplateOverrides;
  enableDynamicConfig?: boolean;
  autoConnect: boolean;
  acl?: ACLConfig;
  rollingUpdate?: RollingUpdateConfig;
  rackConfig?: RackAwareConfig;
  networkPolicy?: NetworkAccessConfig;
  k8sNodeBlockList?: string[];
  podScheduling?: PodSchedulingConfig;
  seedsFinderServices?: SeedsFinderServicesConfig;
  networkPolicyConfig?: NetworkPolicyAutoConfig;
  bandwidthConfig?: BandwidthConfig;
  validationPolicy?: ValidationPolicyConfig;
  headlessService?: ServiceMetadataConfig;
  podService?: ServiceMetadataConfig;
  enableRackIDOverride?: boolean;
  podMetadata?: PodMetadataConfig;
  sidecars?: SidecarConfig[];
  initContainers?: SidecarConfig[];
}

export interface UpdateK8sClusterRequest {
  size?: number;
  image?: string;
  storage?: StorageSpec;
  resources?: ResourceConfig;
  monitoring?: MonitoringConfig;
  paused?: boolean;
  enableDynamicConfig?: boolean;
  aerospikeConfig?: Record<string, unknown>;
  rollingUpdateBatchSize?: number;
  maxUnavailable?: string;
  disablePDB?: boolean;
  rackConfig?: RackAwareConfig;
  networkPolicy?: NetworkAccessConfig;
  k8sNodeBlockList?: string[];
  podScheduling?: PodSchedulingConfig;
  seedsFinderServices?: SeedsFinderServicesConfig;
  networkPolicyConfig?: NetworkPolicyAutoConfig;
  acl?: ACLConfig;
  bandwidthConfig?: BandwidthConfig;
  validationPolicy?: ValidationPolicyConfig;
  headlessService?: ServiceMetadataConfig;
  podService?: ServiceMetadataConfig;
  enableRackIDOverride?: boolean;
  podMetadata?: PodMetadataConfig;
  sidecars?: SidecarConfig[];
  initContainers?: SidecarConfig[];
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
  image?: string;
  size?: number;
  age?: string;
  description?: string;
  usedBy?: string[];
}

export interface K8sTemplateDetail {
  name: string;
  spec: Record<string, unknown>;
  status?: Record<string, unknown>;
  age?: string;
}

export interface TemplateSchedulingConfig {
  podAntiAffinityLevel?: "none" | "preferred" | "required";
  podManagementPolicy?: "OrderedReady" | "Parallel";
  tolerations?: Record<string, unknown>[];
  nodeAffinity?: Record<string, unknown>;
  topologySpreadConstraints?: Record<string, unknown>[];
}

export interface TemplateStorageConfig {
  storageClassName?: string;
  volumeMode?: "Filesystem" | "Block";
  accessModes?: string[];
  size?: string;
}

export interface TemplateNetworkConfig {
  heartbeatMode?: "mesh" | "multicast";
  heartbeatPort?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
}

export interface TemplateRackConfig {
  maxRacksPerNode?: number;
}

export interface CreateK8sTemplateRequest {
  name: string;
  description?: string;
  image?: string;
  size?: number;
  resources?: ResourceConfig;
  monitoring?: MonitoringConfig;
  scheduling?: TemplateSchedulingConfig;
  storage?: TemplateStorageConfig;
  networkPolicy?: NetworkAccessConfig;
  aerospikeConfig?: Record<string, unknown>;
  networkConfig?: TemplateNetworkConfig;
  rackConfig?: TemplateRackConfig;
}

export interface UpdateK8sTemplateRequest {
  description?: string;
  image?: string;
  size?: number;
  resources?: ResourceConfig;
  monitoring?: MonitoringConfig;
  scheduling?: TemplateSchedulingConfig;
  storage?: TemplateStorageConfig;
  networkPolicy?: NetworkAccessConfig;
  aerospikeConfig?: Record<string, unknown>;
  networkConfig?: TemplateNetworkConfig;
  rackConfig?: TemplateRackConfig;
}

export interface TemplateSnapshot {
  synced?: boolean;
  name?: string;
  resourceVersion?: string;
  snapshotTimestamp?: string;
  spec?: unknown;
}

export interface TemplateOverrides {
  image?: string;
  size?: number;
  resources?: ResourceConfig;
  monitoring?: MonitoringConfig;
  networkPolicy?: NetworkAccessConfig;
  enableDynamicConfig?: boolean;
  scheduling?: TemplateSchedulingConfig;
  storage?: TemplateStorageConfig;
  rackConfig?: TemplateRackConfig;
  aerospikeConfig?: Record<string, unknown>;
}

export interface PodLogsResponse {
  pod: string;
  logs: string;
  tailLines: number;
}

export interface ClusterYamlResponse {
  yaml: Record<string, unknown>;
}

// === Bin Editor ===
export interface BinEntry {
  id: string;
  name: string;
  value: string;
  type: "string" | "integer" | "float" | "bool" | "list" | "map" | "bytes" | "geojson";
}

// === Config Drift ===
export interface PodHashGroup {
  configHash: string | null;
  podSpecHash: string | null;
  pods: string[];
  isCurrent: boolean;
}

export interface ConfigDriftResponse {
  hasDrift: boolean;
  changedFields: string[];
  podHashGroups: PodHashGroup[];
  desiredConfigHash: string | null;
}

// === HPA (HorizontalPodAutoscaler) ===
export interface HPAConfig {
  minReplicas: number;
  maxReplicas: number;
  cpuTargetPercent?: number | null;
  memoryTargetPercent?: number | null;
}

export interface HPACondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface HPAStatus {
  currentReplicas: number;
  desiredReplicas: number;
  conditions: HPACondition[];
}

export interface HPAResponse {
  enabled: boolean;
  config: HPAConfig;
  status: HPAStatus;
}

// === AerospikeCluster Spec (typed subset of the CRD spec) ===
export interface AerospikeNetworkPolicySpec {
  accessType?: string;
  alternateAccessType?: string;
  fabricType?: string;
  customAccessNetworkNames?: string[];
  customAlternateAccessNetworkNames?: string[];
  customFabricNetworkNames?: string[];
}

export interface AerospikeClusterSpec {
  image?: string;
  size?: number;
  aerospikeConfig?: Record<string, unknown>;
  rackConfig?: RackAwareConfig;
  storage?: StorageSpec | StorageVolumeConfig;
  podSpec?: Record<string, unknown>;
  operationsList?: Record<string, unknown>[];
  rollingUpdateBatchSize?: number;
  maxUnavailable?: string | number;
  disablePDB?: boolean;
  enableDynamicConfigUpdate?: boolean;
  aerospikeNetworkPolicy?: AerospikeNetworkPolicySpec;
  k8sNodeBlockList?: string[];
  monitoring?: MonitoringConfig;
  podScheduling?: PodSchedulingConfig;
  acl?: ACLConfig;
  resources?: ResourceConfig;
  seedsFinderServices?: SeedsFinderServicesConfig;
  networkPolicyConfig?: NetworkPolicyAutoConfig;
  bandwidthConfig?: BandwidthConfig;
  validationPolicy?: ValidationPolicyConfig;
  headlessService?: {
    metadata?: { annotations?: Record<string, string>; labels?: Record<string, string> };
  };
  podService?: {
    metadata?: { annotations?: Record<string, string>; labels?: Record<string, string> };
  };
  enableRackIDOverride?: boolean;
  templateRef?: { name: string };
  [key: string]: unknown;
}
