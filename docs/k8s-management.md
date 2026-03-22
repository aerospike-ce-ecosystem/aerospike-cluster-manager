# Kubernetes Cluster Management Guide

This guide covers the Kubernetes cluster lifecycle management features of the Aerospike Cluster Manager, including the creation wizard, template management, operations, and monitoring.

## Prerequisites

- Kubernetes cluster with the [Aerospike CE Kubernetes Operator](https://github.com/aerospike-ce-ecosystem/aerospike-ce-kubernetes-operator) installed.
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
- **ACL (Access Control)** -- Enable/disable ACL, manage roles with privileges and CIDR whitelists, manage users with K8s Secret-backed passwords
- **Resources** -- Configure CPU and memory requests/limits for Aerospike pods
- Seeds Finder Services configuration
- Sidecar and init container management
- Security context configuration
- Topology spread constraints
- Service metadata
- Rack configuration editing (see [Rack Config Edit](#rack-config-edit-in-edit-dialog))
- Node blocklist picker (see [Node Blocklist Picker](#node-blocklist-picker))

#### Rack Config Edit in Edit Dialog

After a cluster is created, rack topology can be fully edited through the Edit dialog. This enables operators to adjust data placement, add new availability zones, or remove racks without recreating the cluster.

**Adding and removing racks:**

- Click **Add Rack** to append a new rack entry. Each rack requires a unique rack ID.
- Click the delete button on a rack row to remove it. The operator will migrate data off the removed rack during the next reconciliation.
- Use the **Disable Multi-Rack** button to remove all racks and revert to a single default rack topology.

**Per-rack topology settings:**

Each rack can be configured with the following topology fields:

| Field | Description |
|-------|-------------|
| Zone | Availability zone label (`topology.kubernetes.io/zone`) for this rack |
| Region | Region label (`topology.kubernetes.io/region`) for this rack |
| Node Name | Pin the rack to a specific Kubernetes node |
| Rack Label | Custom label for identifying this rack |

**Per-rack overrides:**

Each rack supports independent overrides that take precedence over the cluster-level defaults:

| Override | Description |
|----------|-------------|
| Aerospike Config | Per-rack Aerospike configuration overrides (e.g., different replication or namespace settings per zone) |
| Storage Volumes | Per-rack storage class, volume size, and volume mode overrides for heterogeneous storage across zones |
| Node Selector | Constrain pods in this rack to nodes with specific labels |
| Tolerations | Allow pods in this rack to schedule on nodes with specific taints |
| Node Affinity | Rack-specific node affinity rules (e.g., target specific instance types per zone) |

**Global rack settings:**

The following settings apply to all racks and control batch operations during rack topology changes:

| Setting | Description |
|---------|-------------|
| maxIgnorablePods | Maximum number of pods that can be ignored during rolling operations |
| rollingUpdateBatchSize | Number of pods to update simultaneously during a rolling restart |
| scaleDownBatchSize | Number of pods to remove simultaneously during scale-down |

#### Node Blocklist Picker

The Edit dialog includes an interactive node blocklist picker that replaces manual text input with a visual node selection interface.

**How the picker works:**

1. When the edit dialog opens, it fetches the list of real Kubernetes nodes from the cluster via the `GET /api/k8s/nodes` API endpoint.
2. Nodes are displayed as a checkbox list showing:
   - **Node name** -- The Kubernetes node hostname
   - **Zone** -- The availability zone label of the node (e.g., `us-east-1a`)
   - **Readiness status** -- Whether the node is in a `Ready` condition
3. Check the boxes next to nodes you want to exclude from Aerospike pod scheduling. Checked nodes are added to `spec.k8sNodeBlockList`.
4. Unchecked nodes remain available for scheduling.

**Fallback behavior:**

If the node list cannot be fetched (e.g., due to RBAC restrictions or network issues), the picker falls back to a plain text input field where node names can be entered manually, one per line.

**Visual indicators:**

- Blocked nodes are displayed with a distinct visual style to clearly differentiate them from available nodes.
- Node readiness status uses color-coded badges (green for Ready, red for NotReady) to help operators avoid blocking already-healthy nodes or identify problematic ones.

### Export & Import

**Export:** From the cluster detail page, click **Export** in the Spec section to download the cluster CR as a JSON file. The **Copy CR** button copies the YAML to clipboard.

**Import:** From the cluster list page, click **Import CR** to create a cluster from an exported CR. Paste the JSON or upload a file. The import strips metadata fields (`uid`, `resourceVersion`, `managedFields`) for a clean import.

### HPA (Horizontal Pod Autoscaler)

The HPA dialog provides full lifecycle management for Kubernetes HorizontalPodAutoscaler resources targeting the AerospikeCluster:

**Creating an HPA:**

1. Click the **HPA** button on the cluster detail page.
2. Configure the autoscaler:

| Field | Required | Description |
|-------|----------|-------------|
| Min Replicas | Yes | Minimum number of Aerospike pods (1-8 for CE) |
| Max Replicas | Yes | Maximum number of Aerospike pods (must be >= min) |
| CPU Target % | At least one | Target CPU utilization percentage (1-100%) |
| Memory Target % | At least one | Target memory utilization percentage (1-100%) |

3. At least one metric target (CPU or memory) must be specified.
4. The HPA is created with `app.kubernetes.io/managed-by: aerospike-cluster-manager` labels.

**Viewing HPA status:**

The dialog shows the current HPA state including current/desired replicas and scaling conditions (ScalingActive, AbleToScale, ScalingLimited).

**Updating and deleting:**

- Use the same dialog to update an existing HPA configuration. The backend automatically detects whether to create or replace.
- The delete button removes the HPA, reverting to manual scaling.

**API endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/k8s/clusters/{namespace}/{name}/hpa` | Get HPA config and status |
| `POST` | `/api/k8s/clusters/{namespace}/{name}/hpa` | Create or update HPA |
| `DELETE` | `/api/k8s/clusters/{namespace}/{name}/hpa` | Delete HPA |

### Operations (Warm Restart / Pod Restart)

- **Warm Restart** -- Applies configuration changes without a full pod restart. Pods are restarted one at a time in a rolling manner. Does not cause data loss.
- **Pod Restart** -- Deletes and recreates pods. More disruptive than warm restart and temporarily reduces cluster capacity while pods are being recreated.

**Pod-level operation selection:**

Both operation types support targeting specific pods via a dedicated operation trigger dialog:

1. Click **Warm Restart** or **Pod Restart** from the cluster detail page toolbar.
2. The operation dialog opens with a **pod selection checklist** showing all pods with their Ready/NotReady status.
3. Use the **Select All / Deselect All** toggle or check individual pods.
4. If no pods are selected, the operation applies to all pods (cluster-wide).
5. Optionally set a custom **Operation ID** (1-20 characters) for tracking; auto-generated if omitted.
6. Review the confirmation step showing operation type, target pod count, and selected pod names.
7. Submit to trigger the operation.

Alternatively, you can pre-select pods from the pod status table on the cluster detail page using the checkbox column, then click an operation button. The pre-selected pods carry over into the operation dialog.

**Operation progress tracking:**

When an operation is active, the cluster detail page displays real-time progress:

- A visual progress bar showing the percentage of pods that have completed.
- Counts of completed and failed pods.
- The operation type indicator (WarmRestart or PodRestart).
- The target pod list when specific pods were selected.

The progress display appears automatically during active operations and the detail page polls every 5 seconds.

**API endpoint:**

```
POST /api/k8s/clusters/{namespace}/{name}/operations
```

Request body:

```json
{
  "kind": "WarmRestart",
  "id": "optional-tracking-id",
  "podList": ["pod-0", "pod-1"]
}
```

The `podList` field is optional. When omitted or empty, all pods are targeted. The backend patches the CR's `spec.operations` field and the operator picks up the operation during its next reconciliation loop.

### Pause / Resume

Pause reconciliation for maintenance windows. While paused, the operator will not make changes. Resume to re-enable reconciliation.

### Clone

Clone an existing cluster to create a new one with the same spec. From the cluster detail page, click **Clone** to open the clone dialog:

- **New Cluster Name** -- DNS-compatible name for the cloned cluster (required).
- **Namespace** -- Target namespace (defaults to the source cluster's namespace).

The clone copies the full `spec` from the source cluster but strips `operations` and `paused` state so the new cluster starts fresh. This is useful for:

- Creating test/staging copies of production clusters.
- Duplicating a known-good configuration to a different namespace.

> **Note:** When cloning to a different namespace, ACL user secrets (referenced in `spec.acl.users[].secretName`) are not copied automatically. You must ensure the same Kubernetes Secrets exist in the target namespace before the cloned cluster can start successfully with ACL enabled.

### Delete

Delete the cluster with a confirmation dialog. Associated connection profiles are automatically cleaned up.

## Monitoring & Observability

### Cluster Health Dashboard

Displays rack distribution and data migration status across the cluster. The health summary includes:

- **Phase** -- Current cluster phase with color-coded badge.
- **Pod counts** -- Total, ready, and desired pod counts.
- **Conditions** -- Available, ConfigApplied, ACLSynced, and Migrating indicators.
- **Rack distribution** -- Per-rack pod breakdown showing total and ready counts per rack ID.

### Migration Status Monitoring

The migration status card provides real-time visibility into Aerospike data migration, particularly useful during scale-down operations, rolling restarts, and initial cluster provisioning.

- **Overall status** -- Whether migration is in progress, and total remaining partitions aggregated across all nodes in the cluster.
- **Per-pod breakdown** -- Each pod shows its individual migrating partition count in the pod table, making it easy to identify which nodes still have data in transit.
- **Auto-refresh** -- The migration view refreshes automatically while migration is active (every 5 seconds), stopping once all partitions have settled.
- **Integrated views** -- Migration progress is surfaced in both the pod table and the rack topology view, so you can correlate partition movement with rack placement.
- **Last checked** -- Timestamp of when the migration status was last polled.

The migration status is fetched from the `GET /api/k8s/clusters/{namespace}/{name}/migration-status` endpoint, which reads the `status.migrationStatus` field from the AerospikeCluster CR.

### Pod Health Tracking

The pod status table provides detailed per-pod health information:

| Column | Description |
|--------|-------------|
| **Phase** | Current pod phase (Running, Pending, etc.) |
| **Ready** | Whether the pod's readiness probe is passing |
| **Access Endpoints** | IP addresses or DNS entries for reaching the pod |
| **Readiness Gate** | Whether the operator's custom readiness gate (`acko.io/aerospike-ready`) is satisfied |
| **Ports** | Pod port and service port displayed as `podPort/servicePort` |
| **Cluster** | The Aerospike cluster name reported by the pod |
| **Volumes** | Volume health status showing dirty volumes (needing initialization) and initialized volumes |
| **Stability** | The `unstableSince` timestamp indicates when a pod entered an unstable state; stable pods show no flag |
| **Restart History** | `lastRestartReason` (e.g., OOMKilled, CrashLoopBackOff) and `lastRestartTime` per pod |
| **Config Hash** | Current `configHash` and `podSpecHash` used by Config Drift Detection to group pods |
| **Rack ID** | Rack assignment for topology-aware deployments |

The table supports row selection via checkboxes. Selected pods can be used directly with the Warm Restart or Pod Restart operations (see [Operations](#operations-warm-restart--pod-restart)).

### Node Blocklist Management

The node blocklist feature allows you to exclude specific Kubernetes nodes from hosting Aerospike pods. This is useful for:

- Draining a node before maintenance.
- Excluding nodes with known hardware issues.
- Restricting scheduling to a subset of the cluster.

**How it works:**

1. Send a `PATCH /api/k8s/clusters/{namespace}/{name}/node-blocklist` request with the list of node names to exclude.
2. The backend patches `spec.k8sNodeBlockList` on the AerospikeCluster CR.
3. The operator respects the blocklist during scheduling and will migrate pods away from blocked nodes during the next reconciliation.

The request body is a JSON object with a `nodeNames` array:

```json
{
  "nodeNames": ["node-1", "node-3"]
}
```

To clear the blocklist, send an empty array. The endpoint returns the updated cluster summary.

### Events Timeline

Kubernetes events categorized into 11 categories:
- Lifecycle, Rolling Restart, Configuration, ACL Security, Scaling, Rack Management, Network, Monitoring, Template, Circuit Breaker, Other

Events auto-refresh during transitional phases and support category filtering.

**Export Events:** Click the **JSON** or **CSV** download buttons in the event timeline header to export filtered events. The export includes event type, reason, category, count, timestamps, and message. When a category filter is active, only the filtered events are exported.

### Configuration Drift Detection

Compares the desired spec (what you declared) against the applied spec (what the operator last reconciled) and detects configuration drift. This is useful after editing a cluster to see whether the operator has fully applied the changes, or to identify partial rollout states where some pods are running the new config and others are still on the old one.

The UI presents:

- **Sync status badge** -- "In Sync" (green) or "Drift Detected" (amber) at the top of the card.
- **Changed fields list** -- Each field that differs is listed with its path.
- **Visual diff view** -- Two view modes are available, toggled via buttons at the top of the diff section:
  - **Fields view** (default) -- For every changed field the card shows the desired value (marked with `+`) and the applied value (marked with `-`), using color-coded formatting (`added`, `removed`, `changed`).
  - **Side-by-side view** -- Shows the full applied config (left, red) vs desired config (right, green) as a line-by-line JSON diff with line numbers and color highlighting, similar to a Git diff viewer.
- **Pod hash groups** -- Pods are grouped by their `configHash` and `podSpecHash`. Each pod reports its current config hash in the pod status table. The group matching the current desired hash is marked as "current"; pods in other groups have diverged and need a rolling restart to pick up the new configuration.
- **Desired & applied config snapshots** -- The full desired and applied config objects are available for inspection when the backend returns them.

The drift data is fetched from `GET /api/k8s/clusters/{namespace}/{name}/config-drift`.

When drift is detected, the **Force Reconcile** button triggers a re-reconciliation by annotating the CR with `acko.io/force-reconcile`. This is useful when the operator has applied a config but the status hasn't been updated yet.

### PVC / Storage Status

The PVC status panel lists all PersistentVolumeClaims associated with the cluster's StatefulSets. For each PVC:
- **Status badge** -- Bound (green), Pending (amber), Released (blue), or Failed (red)
- **Capacity** -- Provisioned storage capacity
- **Storage Class** -- The Kubernetes StorageClass used
- **Access Modes** -- ReadWriteOnce, ReadWriteMany, etc.
- **Volume Name** -- The bound PersistentVolume name

The data is fetched from `GET /api/k8s/clusters/{namespace}/{name}/pvcs`.

### Reconciliation Health Dashboard

Shows the operator's reconciliation circuit breaker state with a severity-based health card. The card uses three severity levels determined by the failed reconcile count:

| Severity | Condition | Visual Indicator |
|----------|-----------|-----------------|
| **Healthy** (green) | 0 failed reconciles | Green border, checkmark icon |
| **Warning** (amber) | 1-5 failed reconciles | Amber border, warning icon |
| **Critical** (red) | 6+ failed reconciles | Red border, error icon |

The card displays:
- **Visual progress bar** toward the circuit breaker threshold with severity-colored fill.
- **Current backoff timer** -- Estimated seconds remaining before the next reconcile attempt.
- **Failed reconcile count** -- Current count vs. the circuit breaker threshold.
- **Last reconcile error** -- Detailed error message from the most recent failure.
- **Phase and phase reason** -- The current cluster reconciliation phase.
- **Operator version** -- The version of the operator managing this cluster.
- **Manual reset button** -- Clears the circuit breaker state to force an immediate reconcile.
- **Auto-refresh** -- The card polls every 10 seconds to keep the health status current.

The reconciliation health data is fetched from `GET /api/k8s/clusters/{namespace}/{name}/reconciliation-health`.

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

Transitional phases: `InProgress`, `ScalingUp`, `ScalingDown`, `WaitingForMigration`, `RollingRestart`, `ACLSync`, `Deleting`.

## K8s API Endpoint Reference

See the [K8s API Endpoints](../README.md#k8s-api-endpoints) table in the README for the complete list of backend API endpoints.

## Environment Variable Configuration

The following environment variables can be used to tune backend behavior. They can be set directly as environment variables or via the operator Helm chart values.

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_POOL_MIN_SIZE` | `2` | Minimum database connection pool size. Increase if the backend handles many concurrent requests. |
| `DB_POOL_MAX_SIZE` | `10` | Maximum database connection pool size. Controls the upper bound of open database connections. |
| `DB_COMMAND_TIMEOUT` | `30` | SQL command execution timeout in seconds. Commands that exceed this duration will be cancelled. |
| `K8S_API_TIMEOUT` | `10` | Kubernetes API request timeout in seconds. Applies to all K8s API calls (list, get, patch, delete). Increase for high-latency clusters. |
| `K8S_LOG_TIMEOUT` | `30` | Kubernetes pod log streaming timeout in seconds. Applies to `read_namespaced_pod_log` calls. Increase for large log payloads. |

**Helm chart example:**

```yaml
env:
  - name: DB_POOL_MIN_SIZE
    value: "5"
  - name: DB_POOL_MAX_SIZE
    value: "20"
  - name: DB_COMMAND_TIMEOUT
    value: "60"
  - name: K8S_API_TIMEOUT
    value: "15"
```

## See also

- [Architecture Overview](./architecture.md)
- [Data Management Guide](./data-management.md)
