# Kubernetes Cluster Management Guide

This guide covers the Kubernetes cluster lifecycle management features of the Aerospike Cluster Manager, including the creation wizard, template management, operations, and monitoring.

## Prerequisites

- Kubernetes cluster with the [Aerospike CE Kubernetes Operator](https://github.com/KimSoungRyoul/aerospike-ce-kubernetes-operator) installed.
- `K8S_MANAGEMENT_ENABLED=true` environment variable set on the backend.
- Service account with RBAC permissions for AerospikeCluster and AerospikeClusterTemplate CRDs (see [Architecture Guide](architecture.md)).

## Cluster Creation Wizard

The wizard guides you through creating an AerospikeCluster resource in up to 10 steps. You can start from scratch or use a template.

### Step 0: Creation Mode

Choose between:
- **From Scratch** -- Configure everything manually.
- **From Template** -- Select an existing AerospikeClusterTemplate and override only the fields you need. The template pre-fills default values for image, size, resources, storage, monitoring, and scheduling.

### Step 1: Basic Configuration

| Field | Description | Default |
|-------|-------------|---------|
| Cluster Name | K8s DNS-compatible name (1-63 chars, lowercase alphanumeric + hyphens) | -- |
| Namespace | Target Kubernetes namespace (must already exist) | `aerospike` |
| Size | Number of Aerospike nodes (1-8 for CE) | `3` |
| Image | Aerospike container image | `aerospike:ce-8.1.0.3_1` |

### Step 2: Namespace & Storage

Configure the Aerospike namespace (not to be confused with K8s namespace):

- **Namespace Name** -- Aerospike data namespace (e.g., `test`, `production`).
- **Replication Factor** -- Number of data copies (1-8).
- **Storage Engine** -- `memory` (in-memory only) or `device` (PVC-backed persistent storage).

For persistent storage, each volume supports:

| Field | Description |
|-------|-------------|
| Storage Class | Kubernetes StorageClass for PVC provisioning |
| Size | Volume capacity (e.g., `10Gi`, `100Gi`) |
| Volume Mode | `Filesystem` or `Block` |
| Mount Path | Container mount path |
| Init Method | Volume initialization on first use (`none`, `deleteFiles`, `dd`, `blkdiscard`, `headerCleanup`) |
| Wipe Method | Volume cleanup method |
| Cascade Delete | Delete PVC when cluster is deleted |

Multiple volumes can be configured independently with different storage classes and sizes.

### Step 3: Monitoring & Options

- **Prometheus Exporter** -- Enable/disable the Aerospike Prometheus exporter sidecar with custom image, resource limits, metric labels, and environment variables.
- **ServiceMonitor** -- Auto-create a Prometheus ServiceMonitor resource (enabled/disabled, scrape interval, custom labels).
- **PrometheusRule** -- Auto-create alerting rules (built-in alerts or fully custom rule groups).
- **Template Reference** -- Optionally reference an AerospikeClusterTemplate for shared defaults.
- **Dynamic Config** -- Enable runtime config updates without pod restarts.
- **Network Access** -- Configure pod access type: Pod IP, Host Internal, Host External, or Configured IP with custom network names.
- **NetworkPolicy** -- Auto-generate standard Kubernetes NetworkPolicy or Cilium NetworkPolicy.
- **Seeds Finder Services** -- Configure a LoadBalancer service for external seed discovery with service port, target port, external traffic policy, annotations, labels, and source range restrictions.

### Step 4: Resources

| Field | Description |
|-------|-------------|
| CPU Requests | Minimum CPU allocation |
| CPU Limits | Maximum CPU allocation |
| Memory Requests | Minimum memory allocation |
| Memory Limits | Maximum memory allocation |
| Auto-connect | Automatically create a connection profile after cluster creation |

### Step 5: Security (ACL)

When ACL is enabled:

- **Roles** -- Define roles with granular privileges (read, write, read-write, per-namespace, per-set) and optional CIDR allowlists.
- **Users** -- Create users with role assignments and K8s Secret-backed passwords. Select existing secrets from the target namespace via the secrets picker.

### Step 6: Rolling Update Strategy

| Field | Description |
|-------|-------------|
| Batch Size | Number of pods to update simultaneously |
| Max Unavailable | Maximum number (or percentage) of unavailable pods during update |
| PDB Control | PodDisruptionBudget settings for the cluster |

### Step 7: Rack Configuration

Configure multi-rack deployments for topology-aware data placement:

- **Rack ID & Zone** -- Assign each rack to an availability zone using node labels (`topology.kubernetes.io/zone`).
- **Per-Rack Storage Overrides** -- Different StorageClass and volume size per rack.
- **Per-Rack Scheduling** -- Tolerations, node affinity, and nodeSelector overrides per rack.
- **Per-Rack Aerospike Config** -- Override Aerospike configuration per rack.
- **Batch Scaling** -- Configure `maxIgnorablePods`, `rollingUpdateBatchSize`, and `scaleDownBatchSize`.

### Step 8: Sidecars & Init Containers

Add custom sidecar containers (e.g., log shippers, backup agents) and init containers (e.g., data loaders, certificate generators) with full configuration: image, command, args, env, volume mounts, and resources.

### Step 9: Advanced Configuration

| Field | Description |
|-------|-------------|
| Pod Management Policy | `OrderedReady` or `Parallel` |
| DNS Policy | Pod DNS policy |
| Readiness Gate | Enable operator readiness gate (`acko.io/aerospike-ready`) |
| Pod Metadata | Custom labels and annotations on pods |
| Headless Service Metadata | Custom annotations/labels on the headless service |
| Per-Pod Service Metadata | Custom annotations/labels on individual pod services |
| Bandwidth Throttling | CNI-based ingress/egress bandwidth limits |
| Node Block List | Select K8s nodes to exclude from scheduling |
| Validation Policy | Cluster validation settings |
| Rack ID Override | Enable manual rack ID assignment |
| NodeSelector | Constrain pods to specific nodes |
| Tolerations | Allow scheduling on tainted nodes |
| Host Network | Use host networking |
| Multi-Pod Per Host | Allow multiple Aerospike pods per node |
| Image Pull Secrets | Private registry credentials |
| Service Account | Pod service account name |
| Termination Grace Period | Graceful shutdown timeout |
| Topology Spread Constraints | Distribute pods across zones/nodes (maxSkew, topologyKey, whenUnsatisfiable, labelSelector) |
| Security Context | Pod-level security (runAsUser, runAsNonRoot, fsGroup, seccompProfile) |

### Step 10: Review

Summary of all configured settings. The wizard displays the full configuration including Seeds Finder Services, storage volumes, monitoring, and ACL before submission.

## Cluster Operations

From the cluster detail page (`/k8s/clusters/{namespace}/{name}`), the following operations are available:

### Scale

Change the cluster size (1-8 nodes for CE). The operator handles rolling scale-up and scale-down with data migration.

### Edit

Modify running cluster settings with diff-based patching. The edit dialog supports all wizard fields plus:
- Seeds Finder Services configuration
- Sidecar and init container management
- Security context configuration
- Topology spread constraints
- Service metadata

### HPA (Horizontal Pod Autoscaler)

Create, view, and delete HPAs targeting the AerospikeCluster resource for automatic scaling based on CPU and/or memory utilization. Configure min/max replicas and target utilization percentages.

### Operations (Warm Restart / Pod Restart)

- **Warm Restart** -- Restart Aerospike process without killing the pod (preserves in-flight connections).
- **Pod Restart** -- Full pod restart (kills and recreates the container).
- Both support **pod selection** via checkboxes to target specific pods.
- Operation progress is tracked in real-time with a progress bar showing completed/failed pods.

### Pause / Resume

Pause reconciliation for maintenance windows. While paused, the operator will not make changes. Resume to re-enable reconciliation.

### Delete

Delete the cluster with a confirmation dialog. Associated connection profiles are automatically cleaned up.

## Monitoring & Observability

### Cluster Health Dashboard

Displays rack distribution and data migration status across the cluster.

### Migration Status

The cluster detail page includes a dedicated **Migration Status** card that shows real-time data migration progress. This is useful when scaling, rebalancing, or performing rolling restarts that trigger data redistribution.

- **Idle state** -- When no migration is active, a green "No Active Migration" badge is displayed.
- **Active migration** -- Shows overall remaining records count and a progress indicator. Each pod's migration state is displayed in the pod table with per-pod remaining record counts.
- **Auto-refresh** -- During active migration, the migration status automatically refreshes every **5 seconds** so you can monitor progress without manual page reloads.
- **Graceful fallback** -- If the operator's CR does not include a `status.migrationStatus` field (e.g., older operator versions), the UI gracefully falls back to an "Unknown" state instead of erroring.

The backend exposes `GET /api/k8s/clusters/{namespace}/{name}/migration-status` which extracts migration information from the AerospikeCluster CR status. See the [K8s API Endpoints](../README.md#k8s-api-endpoints) table for details.

### Migration Status Monitoring

The migration status monitoring system provides comprehensive visibility into Aerospike data migrations across the cluster. Migrations occur whenever the data distribution across nodes needs to change -- for example, during scale-down, scale-up, rolling restarts, or rack rebalancing.

#### Migration Status Card

The migration status card on the cluster detail page displays the following information:

| Element | Description |
|---------|-------------|
| **Remaining Records** | Total number of records still being migrated across the cluster. This count decreases as migrations complete. |
| **Activity Indicator** | A visual indicator (spinner or progress animation) that shows whether migration is actively in progress. |
| **Status Badge** | Color-coded badge: green for "No Active Migration", yellow/orange for "Migrating", gray for "Unknown". |
| **Auto-Refresh** | The card automatically refreshes every 5 seconds while migration is active, stopping once the migration completes. |

#### Per-Pod Migration Column

The pod status table includes a **Migration** column that shows per-pod remaining record counts during active migration. This helps identify which specific pods are still sending or receiving data, making it easier to pinpoint bottlenecks or stalled migrations.

#### How Migration Data Is Fetched

The UI retrieves migration data from the AerospikeCluster custom resource's `status.migrationStatus` field, which is populated by the Aerospike CE Kubernetes Operator. The data flow is:

1. The operator queries each Aerospike node for migration statistics via the Aerospike info protocol.
2. The operator writes aggregated migration status into the CR's `status.migrationStatus` field.
3. The backend reads the CR status via the Kubernetes API and exposes it at `GET /api/k8s/clusters/{namespace}/{name}/migration-status`.
4. The frontend polls this endpoint every 5 seconds during active migration.

#### When Migration Status Appears

Migration status becomes active during the following operations:

- **Scale-down** -- Records from removed nodes are redistributed to remaining nodes.
- **Scale-up** -- Existing data is rebalanced to include the new nodes.
- **Rolling restart** -- As pods restart one by one, data temporarily migrates to maintain replication factor.
- **Rack rebalancing** -- When rack configuration changes, data redistributes to satisfy rack-aware placement rules.
- **Replication factor changes** -- Increasing or decreasing the replication factor triggers data redistribution.

Once all remaining records reach zero across all pods, the status returns to idle and auto-refresh stops.

### Rack Topology Visualization

The rack topology view provides a visual diagram of how Aerospike pods are distributed across racks and availability zones. This is accessible from the cluster detail page when rack configuration is enabled.

#### Topology Diagram

The diagram presents a hierarchical layout:

- **Zones** -- Top-level grouping by Kubernetes availability zone (e.g., `us-east-1a`, `us-east-1b`). Each zone is displayed as a labeled container.
- **Racks** -- Within each zone, racks are shown with their rack ID. Each rack groups the pods assigned to it.
- **Pods** -- Individual pods are displayed within their assigned rack, showing the pod name and current status.

#### Pod Color-Coding by Status

Pods in the topology view are color-coded to provide at-a-glance health information:

| Color | Status | Description |
|-------|--------|-------------|
| **Green** | Ready | Pod is fully running and the readiness gate is satisfied. |
| **Yellow** | Not Ready | Pod exists but is not yet ready (e.g., starting up, failing readiness checks). |
| **Orange** | Migrating | Pod is involved in active data migration (sending or receiving records). |
| **Red** | Unstable | Pod has been not-ready for an extended period (has an `unstableSince` timestamp). |

#### Rack-Level Statistics

Each rack in the topology view displays summary statistics:

- **Pod count** -- Number of pods assigned to the rack (e.g., "3/3 Ready").
- **Zone label** -- The availability zone the rack is mapped to.
- **Rack ID** -- The numeric rack identifier used by Aerospike for data placement.

#### Interpreting the Topology View

The topology visualization helps operators:

- **Verify even distribution** -- Confirm that pods are spread evenly across racks and zones as expected by the rack configuration.
- **Identify zone imbalances** -- Spot situations where one zone has more pods than others, which could affect fault tolerance.
- **Locate unhealthy pods** -- Quickly find pods that are not ready, unstable, or actively migrating by scanning for non-green colors.
- **Validate rack assignments** -- Ensure that rack-to-zone mappings match the intended topology, especially after scaling or configuration changes.
- **Monitor rolling operations** -- During rolling restarts or scale operations, watch how pod states change across racks in real time.

### Pod Status Table

Per-pod details including:
- Phase (Running, Pending, etc.)
- Ready status
- Access endpoints
- Readiness gate satisfaction
- Stability indicator (unstableSince timestamp)
- Config hash and pod spec hash for drift detection
- Last restart reason and timestamp
- Migration status (remaining records per pod during active migration)

### Events Timeline

Kubernetes events categorized into 11 categories:
- Lifecycle, Rolling Restart, Configuration, ACL Security, Scaling, Rack Management, Network, Monitoring, Template, Circuit Breaker, Other

Events auto-refresh during transitional phases and support category filtering.

### Configuration Drift Detection

Compares desired spec vs applied spec and detects configuration drift. Per-pod config hash groups show which pods are running identical configurations and which have diverged.

### Reconciliation Health Dashboard

Shows the operator's reconciliation circuit breaker state:
- Visual progress bar toward the circuit breaker threshold
- Current backoff timer
- Detailed error information
- Manual reset button to clear the circuit breaker

### Template Sync Status

When a cluster references a template, the detail page shows:
- Sync status badge (Synced / Out of Sync)
- Last sync timestamp
- Template name and resource version
- Collapsible template spec viewer
- Resync trigger button

## Template Management

Templates (`AerospikeClusterTemplate`) are **cluster-scoped** resources that define reusable configuration presets.

### Template CRUD

- **List** -- Browse all templates with image, size, and age (`/k8s/templates`).
- **Create** -- Define new templates with defaults for image, size, resources, scheduling, storage, monitoring, network, service config, and rack config (`/k8s/templates/new`).
- **View** -- Inspect template spec and see which clusters reference it (`/k8s/templates/{name}`).
- **Edit** -- Update template settings including topology spread constraints via the template edit dialog.
- **Delete** -- Remove unused templates (protected against deletion while referenced).

### Template Scheduling Configuration

Templates support advanced scheduling:
- Pod anti-affinity
- Pod management policy
- Tolerations
- Node affinity rules
- Topology spread constraints (maxSkew, topologyKey, whenUnsatisfiable, labelSelector with matchLabels)

### Template Extended Overrides

Templates serve as comprehensive baseline configurations with override fields for:
- Image and size
- Resources (CPU/memory)
- Scheduling
- Storage (class, volume mode, size, local PV, delete-on-restart)
- Monitoring
- Network policy
- Rack config (maxRacksPerNode)
- Aerospike config overrides
- Service config (feature key file)
- Network config (heartbeat mode/port/interval/timeout)

## Auto-refresh Behavior

| View | Poll Interval | Condition |
|------|--------------|-----------|
| Cluster list | 10 seconds | Any cluster in transitional phase |
| Cluster detail | 5 seconds | Cluster in transitional phase or active operation |
| Migration status | 5 seconds | Active data migration detected |

Transitional phases: `InProgress`, `ScalingUp`, `ScalingDown`, `WaitingForMigration`, `RollingRestart`, `ACLSync`, `Deleting`.

## K8s API Endpoint Reference

See the [K8s API Endpoints](../README.md#k8s-api-endpoints) table in the README for the complete list of backend API endpoints.

## See also

- [Architecture Overview](./architecture.md)
- [Data Management Guide](./data-management.md)
