/**
 * K8s / AerospikeCluster CR types mirrored from backend Pydantic models.
 * See: backend/src/aerospike_cluster_manager_api/models/k8s/*.py
 *
 * All request/response field names use camelCase matching the backend
 * alias configuration (populate_by_name + alias).
 */

// ---------------------------------------------------------------------------
// Security / ACL (security.py)
// ---------------------------------------------------------------------------

export interface ACLRoleSpec {
  name: string
  privileges?: string[]
  whitelist?: string[] | null
}

export interface ACLUserSpec {
  name: string
  secretName: string
  roles?: string[]
}

export interface ACLConfig {
  enabled?: boolean
  roles?: ACLRoleSpec[]
  users?: ACLUserSpec[]
  adminPolicyTimeout?: number
}

// ---------------------------------------------------------------------------
// Storage (storage.py)
// ---------------------------------------------------------------------------

export interface AerospikeNamespaceStorage {
  type?: "memory" | "device"
  dataSize?: number | null
  file?: string | null
  filesize?: number | null
}

export interface AerospikeNamespaceConfig {
  name?: string
  replicationFactor?: number
  storageEngine?: AerospikeNamespaceStorage
}

export interface StorageVolumeConfig {
  storageClass?: string
  size?: string
  mountPath?: string
  initMethod?:
    | "none"
    | "deleteFiles"
    | "dd"
    | "blkdiscard"
    | "headerCleanup"
    | null
  wipeMethod?:
    | "none"
    | "deleteFiles"
    | "dd"
    | "blkdiscard"
    | "headerCleanup"
    | "blkdiscardWithHeaderCleanup"
    | null
  cascadeDelete?: boolean
  cleanupThreads?: number | null
  filesystemVolumePolicy?: Record<string, unknown> | null
  blockVolumePolicy?: Record<string, unknown> | null
}

export interface PersistentVolumeClaimSource {
  storageClass?: string | null
  size?: string
  accessModes?: string[]
  volumeMode?: "Filesystem" | "Block"
  labels?: Record<string, string> | null
  annotations?: Record<string, string> | null
  selector?: Record<string, unknown> | null
}

export interface AerospikeVolumeAttachment {
  path: string
  readOnly?: boolean
  subPath?: string | null
  subPathExpr?: string | null
  mountPropagation?: string | null
}

export interface VolumeAttachment extends AerospikeVolumeAttachment {
  containerName: string
}

export interface VolumeSpec {
  name: string
  source?: "persistentVolume" | "emptyDir" | "secret" | "configMap" | "hostPath"
  persistentVolume?: PersistentVolumeClaimSource | null
  emptyDir?: Record<string, unknown> | null
  secret?: Record<string, unknown> | null
  configMap?: Record<string, unknown> | null
  hostPath?: Record<string, unknown> | null
  aerospike?: AerospikeVolumeAttachment | null
  sidecars?: VolumeAttachment[] | null
  initContainers?: VolumeAttachment[] | null
  initMethod?: StorageVolumeConfig["initMethod"]
  wipeMethod?: StorageVolumeConfig["wipeMethod"]
  cascadeDelete?: boolean
}

export interface StorageSpec {
  volumes?: VolumeSpec[]
  filesystemVolumePolicy?: Record<string, unknown> | null
  blockVolumePolicy?: Record<string, unknown> | null
  cleanupThreads?: number | null
  localStorageClasses?: string[] | null
  deleteLocalStorageOnRestart?: boolean
}

export interface TemplateStorageConfig {
  storageClassName?: string | null
  volumeMode?: "Filesystem" | "Block" | null
  accessModes?: string[] | null
  size?: string | null
  localPVRequired?: boolean | null
}

// ---------------------------------------------------------------------------
// Scheduling / resources (scheduling.py)
// ---------------------------------------------------------------------------

export interface ResourceSpec {
  cpu?: string
  memory?: string
}

export interface ResourceConfig {
  requests?: ResourceSpec
  limits?: ResourceSpec
}

export interface TolerationConfig {
  key?: string | null
  operator?: "Exists" | "Equal"
  value?: string | null
  effect?: "NoSchedule" | "PreferNoSchedule" | "NoExecute" | "" | null
  tolerationSeconds?: number | null
}

export interface PodMetadataConfig {
  labels?: Record<string, string> | null
  annotations?: Record<string, string> | null
}

export interface PodSchedulingConfig {
  nodeSelector?: Record<string, string> | null
  tolerations?: TolerationConfig[] | null
  multiPodPerHost?: boolean | null
  hostNetwork?: boolean | null
  serviceAccountName?: string | null
  terminationGracePeriodSeconds?: number | null
  readinessGateEnabled?: boolean | null
  podManagementPolicy?: "OrderedReady" | "Parallel" | null
  dnsPolicy?: string | null
  imagePullSecrets?: Record<string, string>[] | null
  securityContext?: Record<string, unknown> | null
  topologySpreadConstraints?: Record<string, unknown>[] | null
  metadata?: PodMetadataConfig | null
  affinity?: Record<string, unknown> | null
  priorityClassName?: string | null
}

export interface RackPodSpecConfig {
  affinity?: Record<string, unknown> | null
  tolerations?: TolerationConfig[] | null
  nodeSelector?: Record<string, string> | null
}

export interface RackStorageConfig {
  volumes?: Record<string, unknown>[] | null
}

export interface RackConfig {
  id: number
  zone?: string | null
  region?: string | null
  rackLabel?: string | null
  nodeName?: string | null
  aerospikeConfig?: Record<string, unknown> | null
  storage?: RackStorageConfig | null
  podSpec?: RackPodSpecConfig | null
  revision?: string | null
}

export interface RackAwareConfig {
  racks?: RackConfig[]
  namespaces?: string[] | null
  scaleDownBatchSize?: string | null
  maxIgnorablePods?: string | null
  rollingUpdateBatchSize?: string | null
}

export interface TemplateSchedulingConfig {
  podAntiAffinityLevel?: "none" | "preferred" | "required" | null
  podManagementPolicy?: "OrderedReady" | "Parallel" | null
  tolerations?: Record<string, unknown>[] | null
  nodeAffinity?: Record<string, unknown> | null
  topologySpreadConstraints?: Record<string, unknown>[] | null
}

export interface TemplateRackConfig {
  maxRacksPerNode?: number | null
}

export interface SidecarConfig {
  name: string
  image: string
  command?: string[] | null
  args?: string[] | null
  ports?: Record<string, unknown>[] | null
  env?: Record<string, unknown>[] | null
  volumeMounts?: Record<string, unknown>[] | null
  resources?: Record<string, unknown> | null
  securityContext?: Record<string, unknown> | null
}

// ---------------------------------------------------------------------------
// Network (network.py)
// ---------------------------------------------------------------------------

export type NetworkAccessType =
  | "pod"
  | "hostInternal"
  | "hostExternal"
  | "configuredIP"

export interface NetworkAccessConfig {
  accessType?: NetworkAccessType
  alternateAccessType?: NetworkAccessType | null
  fabricType?: NetworkAccessType | null
  customAccessNetworkNames?: string[] | null
  customAlternateAccessNetworkNames?: string[] | null
  customFabricNetworkNames?: string[] | null
}

export interface LoadBalancerSpec {
  annotations?: Record<string, string> | null
  labels?: Record<string, string> | null
  externalTrafficPolicy?: "Cluster" | "Local" | null
  port?: number
  targetPort?: number
  loadBalancerSourceRanges?: string[] | null
}

export interface SeedsFinderServicesConfig {
  loadBalancer?: LoadBalancerSpec | null
}

export interface NetworkPolicyAutoConfig {
  enabled?: boolean
  type?: "kubernetes" | "cilium"
}

export interface BandwidthConfig {
  ingress?: string | null
  egress?: string | null
}

export interface ValidationPolicyConfig {
  skipWorkDirValidate?: boolean
}

export interface ServiceMetadataConfig {
  annotations?: Record<string, string> | null
  labels?: Record<string, string> | null
}

export interface TemplateNetworkConfig {
  heartbeatMode?: "mesh" | "multicast" | null
  heartbeatPort?: number | null
  heartbeatInterval?: number | null
  heartbeatTimeout?: number | null
}

// ---------------------------------------------------------------------------
// Monitoring / HPA (monitoring.py)
// ---------------------------------------------------------------------------

export interface ServiceMonitorConfig {
  enabled?: boolean
  interval?: string | null
  labels?: Record<string, string> | null
}

export interface PrometheusRuleConfig {
  enabled?: boolean
  labels?: Record<string, string> | null
  customRules?: Record<string, unknown>[] | null
}

export interface MonitoringConfig {
  enabled?: boolean
  port?: number
  exporterImage?: string | null
  resources?: ResourceConfig | null
  metricLabels?: Record<string, string> | null
  serviceMonitor?: ServiceMonitorConfig | null
  prometheusRule?: PrometheusRuleConfig | null
  exporterEnv?: Record<string, string>[] | null
}

export interface HPAConfig {
  minReplicas: number
  maxReplicas: number
  cpuTargetPercent?: number | null
  memoryTargetPercent?: number | null
}

export interface HPACondition {
  type: string
  status: string
  reason?: string | null
  message?: string | null
  lastTransitionTime?: string | null
}

export interface HPAStatus {
  currentReplicas: number
  desiredReplicas: number
  conditions: HPACondition[]
}

export interface HPAResponse {
  enabled: boolean
  config: HPAConfig
  status: HPAStatus
}

// ---------------------------------------------------------------------------
// Operations (operations.py)
// ---------------------------------------------------------------------------

export interface RollingUpdateConfig {
  batchSize?: number | null
  maxUnavailable?: string | null
  disablePDB?: boolean
}

export interface OperationStatusResponse {
  id?: string | null
  kind?: string | null
  phase?: string | null
  completedPods?: string[]
  failedPods?: string[]
  podList?: string[]
}

export interface OperationRequest {
  kind: "WarmRestart" | "PodRestart"
  id?: string | null
  podList?: string[] | null
}

export interface RackDistribution {
  id: number
  total: number
  ready: number
}

export interface ClusterHealthResponse {
  phase: string
  totalPods: number
  readyPods: number
  desiredPods: number
  migrating: boolean
  available: boolean
  configApplied: boolean
  aclSynced: boolean
  failedReconcileCount: number
  pendingRestartCount: number
  rackDistribution: RackDistribution[]
  splitBrainDetected: boolean
}

export interface PodHashGroup {
  configHash?: string | null
  podSpecHash?: string | null
  pods: string[]
  isCurrent: boolean
}

export interface ConfigDriftResponse {
  hasDrift: boolean
  inSync: boolean
  changedFields: string[]
  podHashGroups: PodHashGroup[]
  desiredConfigHash?: string | null
  desiredConfig?: Record<string, unknown> | null
  appliedConfig?: Record<string, unknown> | null
}

export interface PodMigrationStatus {
  podName: string
  migratingPartitions: number
}

export interface MigrationStatusResponse {
  inProgress: boolean
  remainingPartitions: number
  lastChecked?: string | null
  pods: PodMigrationStatus[]
}

export interface ReconciliationStatus {
  circuitBreakerActive: boolean
  failedReconcileCount: number
  circuitBreakerThreshold: number
  lastReconcileError?: string | null
  lastReconcileTime?: string | null
  estimatedBackoffSeconds?: number | null
  phase: string
}

export interface ReconciliationHealthResponse {
  failedReconcileCount: number
  lastReconcileError?: string | null
  phase: string
  phaseReason?: string | null
  operatorVersion?: string | null
  healthStatus: string
}

export interface PVCInfo {
  name: string
  namespace: string
  storageClass?: string | null
  capacity: string
  requestedSize: string
  status: string
  volumeName?: string | null
  accessModes: string[]
  volumeMode?: string | null
  createdAt?: string | null
  boundPod?: string | null
  isOrphan: boolean
}

export interface ImportClusterRequest {
  cr: Record<string, unknown>
  namespace?: string | null
}

export interface NodeBlocklistRequest {
  nodeNames: string[]
}

// ---------------------------------------------------------------------------
// Top-level cluster & template request/response (cluster.py + template.py)
// ---------------------------------------------------------------------------

export interface TemplateOverrides {
  image?: string | null
  size?: number | null
  resources?: ResourceConfig | null
  monitoring?: MonitoringConfig | null
  networkPolicy?: NetworkAccessConfig | null
  enableDynamicConfig?: boolean | null
  scheduling?: TemplateSchedulingConfig | null
  storage?: TemplateStorageConfig | null
  rackConfig?: TemplateRackConfig | null
  aerospikeConfig?: Record<string, unknown> | null
}

export interface TemplateRefConfig {
  name: string
}

export interface CreateK8sClusterRequest {
  name: string
  namespace?: string
  size: number
  image?: string
  namespaces?: AerospikeNamespaceConfig[]
  storage?: StorageVolumeConfig | StorageSpec | null
  resources?: ResourceConfig | null
  monitoring?: MonitoringConfig | null
  templateRef?: TemplateRefConfig | string | null
  templateOverrides?: TemplateOverrides | null
  acl?: ACLConfig | null
  rollingUpdate?: RollingUpdateConfig | null
  rackConfig?: RackAwareConfig | null
  enableDynamicConfig?: boolean
  autoConnect?: boolean
  networkPolicy?: NetworkAccessConfig | null
  k8sNodeBlockList?: string[] | null
  podScheduling?: PodSchedulingConfig | null
  seedsFinderServices?: SeedsFinderServicesConfig | null
  networkPolicyConfig?: NetworkPolicyAutoConfig | null
  bandwidthConfig?: BandwidthConfig | null
  validationPolicy?: ValidationPolicyConfig | null
  headlessService?: ServiceMetadataConfig | null
  podService?: ServiceMetadataConfig | null
  enableRackIDOverride?: boolean | null
  podMetadata?: PodMetadataConfig | null
  sidecars?: SidecarConfig[] | null
  initContainers?: SidecarConfig[] | null
  aerospikeContainerSecurityContext?: Record<string, unknown> | null
}

export interface UpdateK8sClusterRequest {
  size?: number | null
  image?: string | null
  storage?: StorageSpec | null
  resources?: ResourceConfig | null
  monitoring?: MonitoringConfig | null
  paused?: boolean | null
  enableDynamicConfig?: boolean | null
  aerospikeConfig?: Record<string, unknown> | null
  rollingUpdateBatchSize?: number | null
  maxUnavailable?: string | null
  disablePDB?: boolean | null
  rackConfig?: RackAwareConfig | null
  networkPolicy?: NetworkAccessConfig | null
  k8sNodeBlockList?: string[] | null
  podScheduling?: PodSchedulingConfig | null
  seedsFinderServices?: SeedsFinderServicesConfig | null
  networkPolicyConfig?: NetworkPolicyAutoConfig | null
  acl?: ACLConfig | null
  bandwidthConfig?: BandwidthConfig | null
  validationPolicy?: ValidationPolicyConfig | null
  headlessService?: ServiceMetadataConfig | null
  podService?: ServiceMetadataConfig | null
  enableRackIDOverride?: boolean | null
  podMetadata?: PodMetadataConfig | null
  sidecars?: SidecarConfig[] | null
  initContainers?: SidecarConfig[] | null
  aerospikeContainerSecurityContext?: Record<string, unknown> | null
}

export interface ScaleK8sClusterRequest {
  size: number
}

export interface K8sPodStatus {
  name: string
  podIP?: string | null
  hostIP?: string | null
  isReady?: boolean
  phase?: string
  image?: string | null
  dynamicConfigStatus?: string | null
  lastRestartReason?: string | null
  lastRestartTime?: string | null
  nodeId?: string | null
  rackId?: number | null
  configHash?: string | null
  podSpecHash?: string | null
  accessEndpoints?: string[] | null
  readinessGateSatisfied?: boolean | null
  unstableSince?: string | null
  servicePort?: number | null
  podPort?: number | null
  clusterName?: string | null
  dirtyVolumes?: string[] | null
  initializedVolumes?: string[] | null
}

export interface K8sClusterSummary {
  name: string
  namespace: string
  size: number
  image: string
  phase: string
  age?: string | null
  connectionId?: string | null
  autoConnectWarning?: string | null
  templateDrifted?: boolean | null
  failedReconcileCount?: number
}

export interface K8sClusterListResponse {
  items: K8sClusterSummary[]
  continueToken?: string | null
  hasMore: boolean
}

export interface K8sClusterCondition {
  type: string
  status: string
  reason?: string | null
  message?: string | null
  lastTransitionTime?: string | null
}

export interface TemplateSnapshotStatus {
  name?: string | null
  resourceVersion?: string | null
  snapshotTimestamp?: string | null
  synced?: boolean | null
}

export interface K8sClusterDetail {
  name: string
  namespace: string
  size: number
  image: string
  phase: string
  phaseReason?: string | null
  age?: string | null
  spec: Record<string, unknown>
  status: Record<string, unknown>
  pods: K8sPodStatus[]
  conditions: K8sClusterCondition[]
  connectionId?: string | null
  operationStatus?: OperationStatusResponse | null
  failedReconcileCount: number
  lastReconcileError?: string | null
  aerospikeClusterSize?: number | null
  pendingRestartPods: string[]
  lastReconcileTime?: string | null
  operatorVersion?: string | null
  templateSnapshot?: TemplateSnapshotStatus | null
  splitBrainDetected: boolean
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
  | "Other"

export interface K8sClusterEvent {
  type?: string | null
  reason?: string | null
  message?: string | null
  count?: number | null
  firstTimestamp?: string | null
  lastTimestamp?: string | null
  source?: string | null
  category?: string | null
}

export interface K8sTemplateSummary {
  name: string
  image?: string | null
  size?: number | null
  age?: string | null
  description?: string | null
  usedBy: string[]
}

export interface K8sTemplateDetail {
  name: string
  spec: Record<string, unknown>
  status: Record<string, unknown>
  age?: string | null
}

export interface TemplateServiceConfig {
  featureKeyFile?: string | null
  protoFdMax?: number | null
  extraParams?: Record<string, unknown> | null
}

export interface CreateK8sTemplateRequest {
  name: string
  image?: string | null
  size?: number | null
  resources?: ResourceConfig | null
  monitoring?: MonitoringConfig | null
  scheduling?: TemplateSchedulingConfig | null
  storage?: TemplateStorageConfig | null
  description?: string | null
  networkPolicy?: NetworkAccessConfig | null
  aerospikeConfig?: Record<string, unknown> | null
  serviceConfig?: TemplateServiceConfig | null
  networkConfig?: TemplateNetworkConfig | null
  rackConfig?: TemplateRackConfig | null
}

export interface UpdateK8sTemplateRequest {
  description?: string | null
  image?: string | null
  size?: number | null
  resources?: ResourceConfig | null
  monitoring?: MonitoringConfig | null
  scheduling?: TemplateSchedulingConfig | null
  storage?: TemplateStorageConfig | null
  networkPolicy?: NetworkAccessConfig | null
  aerospikeConfig?: Record<string, unknown> | null
  serviceConfig?: TemplateServiceConfig | null
  networkConfig?: TemplateNetworkConfig | null
  rackConfig?: TemplateRackConfig | null
}

export interface CloneClusterRequest {
  name: string
  namespace?: string | null
}

export interface PodLogsResponse {
  pod: string
  logs: string
  tailLines: number
}

export interface K8sNodeInfo {
  name?: string
  zone?: string | null
  region?: string | null
  labels?: Record<string, string>
  ready?: boolean
  [k: string]: unknown
}
