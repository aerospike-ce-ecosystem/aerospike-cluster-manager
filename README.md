# Aerospike Cluster Manager

[![CI](https://github.com/KimSoungRyoul/aerospike-cluster-manager/actions/workflows/ci.yaml/badge.svg)](https://github.com/KimSoungRyoul/aerospike-cluster-manager/actions/workflows/ci.yaml)
[![CD](https://github.com/KimSoungRyoul/aerospike-cluster-manager/actions/workflows/cd.yaml/badge.svg)](https://github.com/KimSoungRyoul/aerospike-cluster-manager/actions/workflows/cd.yaml)
![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)
![Podman](https://img.shields.io/badge/Podman-Compose-892CA0?logo=podman&logoColor=white)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

A web-based GUI management tool for Aerospike Community Edition.

Provides cluster monitoring, record browsing, query execution, index management, user/role management, UDF management, AQL terminal, and more.

## Overview

### Cluster Management

Manage multiple Aerospike cluster connections with color-coded profiles. Create, edit, test, import and export connections.

![Cluster Management](docs/images/01-clusters.png)

### Cluster Dashboard

Real-time monitoring with live TPS charts, client connections, read/write success rates, and uptime tracking.

![Cluster Dashboard](docs/images/02-overview-dashboard.png)

### Namespaces & Sets

Browse namespaces with memory/device usage, replication factor, HWM thresholds, and navigate into sets.

![Namespaces](docs/images/04-namespaces.png)

![Namespace Detail](docs/images/05-namespace-detail.png)

### Record Browser

Browse, create, edit, duplicate and delete records with full pagination support.

![Record Browser](docs/images/03-record-browser.png)

## Tech Stack

| Layer | Stack |
|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, DaisyUI 5, Zustand, TanStack Table, Recharts, Monaco Editor |
| **Backend** | Python 3.13, FastAPI, Uvicorn, Pydantic |
| **Database** | Aerospike Server Enterprise 8.0 |
| **Infra** | Podman Compose, uv (Python), npm (Node.js) |

## Quick Start

### Container Image (Quickest)

Run Aerospike Cluster Manager as a single container. Connection profiles are stored in SQLite — no separate database required.

**Step 1 — Start Aerospike CE (skip if you already have one running)**

```bash
podman network create aerospike-net
podman run -d \
  --name aerospike \
  --network aerospike-net \
  aerospike:ce-8.1.1.1_1

# Docker
docker network create aerospike-net
docker run -d \
  --name aerospike \
  --network aerospike-net \
  aerospike:ce-8.1.1.1_1
```

**Step 2 — Start Aerospike Cluster Manager**

```bash
# Podman
podman run -d \
  -p 3010:3000 \
  --name aerospike-cluster-manager \
  --network aerospike-net \
  -v ~/.aerospike-cluster-manager:/app/data:U \
  ghcr.io/aerospike-ce-ecosystem/aerospike-cluster-manager:latest

# Docker
docker run -d \
  -p 3010:3000 \
  --name aerospike-cluster-manager \
  --network aerospike-net \
  -v ~/.aerospike-cluster-manager:/app/data \
  ghcr.io/aerospike-ce-ecosystem/aerospike-cluster-manager:latest
```

Open **http://localhost:3010** and add a connection with:
- **Host**: `aerospike` (container name on the shared network)
- **Port**: `3000`

Connection profiles are persisted to `~/.aerospike-cluster-manager/connections.db` on your host via the volume mount. The `:U` flag (Podman only) remaps the directory ownership to the container's user.

> **macOS / Windows — connecting to an external Aerospike** — if your Aerospike is running on the host (not in this network), use `host.containers.internal` (Podman) or `host.docker.internal` (Docker) as the host when adding the connection in the UI.

### Podman Compose (Recommended)

```bash
cp .env.example .env
podman compose -f compose.yaml up --build
```

- Frontend: http://localhost:3100
- Backend API: http://localhost:8000
- Aerospike: internal network only (use `podman exec -it aerospike-tools aql -h aerospike-node-1`)

### Local Development

**Backend:**
```bash
cd backend
uv sync                            # Install dependencies
uv run uvicorn aerospike_cluster_manager_api.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install                        # Install dependencies
npm run dev                        # http://localhost:3000
```

> The frontend dev server proxies `/api/*` requests to `http://localhost:8000`.

## Features

- **Connection Management** — Manage multiple Aerospike cluster connection profiles
- **Cluster Overview** — Node status, namespaces, real-time metrics monitoring
- **Record Browser** — Namespace/set browsing, record CRUD, pagination
- **Query Builder** — Scan/Query execution, predicate-based filtering
- **Index Management** — Secondary index creation/deletion
- **Admin** — User/role CRUD (with CE limitation indicators)
- **UDF Management** — Lua UDF upload/delete
- **AQL Terminal** — Web-based AQL command execution
- **Prometheus Metrics** — Cluster metrics export
- **Sample Data Generator** — Generate deterministic sample records with optional indexes and UDFs
- **K8s Cluster Management** — Full lifecycle management of Aerospike clusters on Kubernetes (see below)
  - ACL/Security configuration with role and user management via wizard
  - Rolling update strategy (batch size, max unavailable, PDB control)
  - Operation status tracking (WarmRestart/PodRestart progress, completed/failed pods)
  - Pod selection for targeted restart operations (checkbox-based)
  - Cluster edit dialog (image, size, dynamic config, aerospike config, nodeSelector, tolerations, hostNetwork, imagePullSecrets, serviceAccountName, terminationGracePeriod, validationPolicy, sidecars, initContainers, securityContext, topologySpreadConstraints)
  - Cluster-scoped template CRUD: create, browse, view details, and delete AerospikeClusterTemplates
  - Template "Referenced By" display showing which clusters use each template
  - Template sync status monitoring (Synced/Out of Sync badge, last sync timestamp, resync trigger)
  - Dynamic config status per pod (Applied/Failed/Pending)
  - Enhanced pod status display: access endpoints, readiness gate satisfaction, and instability detection (unstableSince timestamp)
  - Last restart reason and timestamp per pod
  - Reconciliation error monitoring
  - K8s events timeline with category filtering (Lifecycle, Rolling Restart, Configuration, ACL, Scaling, Rack, Network, Monitoring, Template, Circuit Breaker, Other)
  - Configuration drift detection (spec vs appliedSpec comparison, per-pod config hash groups)
  - Circuit breaker / reconciliation health dashboard (threshold progress, backoff timer, manual reset)
  - K8s secrets picker for ACL credential management
  - Storage volume policies (init method, wipe method, cascade delete, cleanup threads, filesystem/block volume policies, local storage classes, delete-on-restart for local PVs)
  - Network access type configuration (Pod IP, Host Internal/External, Configured IP) with custom network names for configuredIP
  - Kubernetes NetworkPolicy auto-generation (standard K8s or Cilium)
  - Seeds Finder LoadBalancer service for external seed discovery
  - K8s node block list UI for selecting nodes to exclude from scheduling (wizard + edit dialog)
  - CNI bandwidth annotations for ingress/egress limits (wizard + edit dialog)
  - HorizontalPodAutoscaler (HPA) management: create, view, and delete HPAs targeting AerospikeCluster resources
  - Enhanced monitoring configuration: exporter image, metric labels, exporter resources (CPU/memory), exporter environment variables, ServiceMonitor config (enabled/interval/labels), PrometheusRule config (enabled/labels/custom alerting rules)
  - Seeds Finder Services UI: edit dialog with LoadBalancer service port, target port, external traffic policy (Cluster/Local), annotations, labels, load balancer source ranges (CIDR list), and wizard review step display
  - Cluster health dashboard with rack distribution and migration status
  - Migration status monitoring: real-time remaining records, per-pod migration column, auto-refresh during active migration, graceful fallback for older operators
  - Rack topology visualization: visual diagram of zones, racks, and pods with color-coded status (ready, not-ready, migrating, unstable) and rack-level statistics
  - Pod logs viewer with tail lines, copy, and download
  - Export cluster CR as clean YAML
  - Rack-level overrides (per-rack aerospikeConfig, storage, podSpec)
  - Pod metadata (labels/annotations), readiness gate, DNS policy configuration
  - Batch scaling controls (maxIgnorablePods, rollingUpdateBatchSize, scaleDownBatchSize)
  - Pod management policy and rack ID override toggle
  - Bandwidth throttling and validation policy configuration
  - Service metadata for headless and pod services
  - Extended wizard fields: nodeSelector, tolerations, hostNetwork, multiPodPerHost, imagePullSecrets, serviceAccountName, terminationGracePeriod, validationPolicy
  - Extended backend API fields: sidecars, initContainers, securityContext, topologySpreadConstraints
  - Multi-volume storage support: configure multiple independent PVC volumes per namespace with different StorageClasses, sizes, and mount paths
  - Sidecar & init container wizard: add custom sidecar and init containers with full configuration (image, command, args, env, volume mounts, resources)
  - Topology spread constraints UI: distribute pods across zones/nodes via wizard and edit dialog (maxSkew, topologyKey, whenUnsatisfiable, labelSelector matchLabels)
  - Template topology spread constraints: configure topology spread constraints in template edit dialog for standardized scheduling policies
  - Pod security context UI: configure runAsUser, runAsNonRoot, fsGroup, seccompProfile via edit dialog
  - Enhanced pod table: readiness gate status, access endpoints, stability indicators (unstableSince)
  - Accessibility: aria-labels, keyboard navigation, screen-reader support across all K8s components
- **Light/Dark Mode** — System theme integration

## Aerospike Data Management

Beyond Kubernetes cluster lifecycle management, the Aerospike Cluster Manager provides a comprehensive set of tools for interacting with Aerospike data directly from the browser.

### Connection Management

Manage multiple Aerospike cluster connections with color-coded profiles. Each connection profile stores the host(s), port, optional cluster name, and credentials. Features include:

- **Create / Edit / Delete** profiles for different clusters or environments
- **Test Connection** — Validate connectivity without saving the profile
- **Health Check** — Live health indicator showing node count, namespace count, server build, and edition
- **Import / Export** — Share connection profiles across team members

### Record Browser

Browse, create, edit, duplicate, and delete Aerospike records through an interactive data grid. The record browser supports:

- **Namespace & Set Navigation** — Drill into any namespace and set in the cluster
- **CRUD Operations** — Create new records with arbitrary bins, edit existing records inline, duplicate records, and delete individual records
- **Pagination** — Server-side pagination with configurable page size (up to 500 records per page)
- **Filtered Scan** — Scan records with expression-based filters (e.g., filter by bin value, type, or metadata) and optional bin selection
- **Batch Read** — Retrieve multiple records by primary key in a single request
- **TTL Support** — Set or modify record time-to-live on write

### Query Builder

Execute queries against Aerospike using multiple strategies:

- **Primary Key Lookup** — Direct record retrieval by namespace, set, and primary key (integer keys are auto-detected)
- **Predicate Queries** — Filter records using secondary index predicates (equality, range) on indexed bins
- **Full Scan** — Scan all records in a namespace/set with optional bin selection and max record limits
- **Expression Filters** — Combine predicate queries with server-side expression filters for complex conditions
- **Bin Selection** — Choose specific bins to return, reducing network transfer
- **Execution Stats** — View execution time, scanned record count, and returned record count for each query

### Secondary Index Management

Create and manage secondary indexes on Aerospike bins:

- **Create Index** — Define indexes on numeric, string, or geo2dsphere bin types for any namespace/set/bin combination
- **Delete Index** — Remove indexes by name from a given namespace
- **Index State** — View index status (ready, building, error) across all namespaces

### AQL Terminal

A web-based terminal for executing AQL-style commands against the connected cluster. Supported commands include:

- `show namespaces` — List all namespaces
- `show sets` — List all sets with object/tombstone counts
- `show bins` — List all bin names across namespaces
- `show indexes` / `show sindex` — List all secondary indexes
- `status` — Show server status
- `build` — Show server edition and build version
- `node` — Show current node identifier
- `statistics` — Show per-node statistics
- Raw info commands are also supported as a fallback

### User & Role Management (ACL)

Manage Aerospike access control lists (requires security to be enabled in `aerospike.conf`):

- **Users** — List all users with their assigned roles, read/write quotas, and active connections. Create new users with roles, change passwords, and delete users.
- **Roles** — List all roles with their privileges and IP allowlists. Create roles with granular privileges (per-namespace, per-set) and CIDR-based allowlists. Delete unused roles.

> Note: ACL features require Aerospike security to be enabled. The UI shows limitation indicators when security is not available.

### UDF Management

Upload and manage Lua User-Defined Functions (UDFs):

- **List Modules** — View all registered UDF modules with filename, type, and content hash
- **Upload** — Register a new Lua UDF module by providing the script content directly in the browser
- **Delete** — Remove a registered UDF module by filename

### Prometheus Metrics & Monitoring

Real-time cluster metrics dashboard with historical time-series data:

- **TPS Charts** — Read and write transactions per second with 10-minute rolling history
- **Client Connections** — Active connection count over time
- **Memory Usage** — Per-namespace memory utilization (used vs total) as time series
- **Device Usage** — Per-namespace device/SSD utilization as time series
- **Read/Write Success Rates** — Cumulative success and error counts per namespace
- **Uptime Tracking** — Cluster uptime aggregated across nodes

### Sample Data Generator

Generate deterministic sample data sets for testing and demonstration:

- **Record Generation** — Create a configurable number of sample records in any namespace/set
- **Secondary Indexes** — Optionally create indexes on sample data bins (numeric, string, geo2dsphere)
- **UDF Registration** — Optionally register bundled Lua UDF modules alongside sample data

## Aerospike Data Management API Reference

All data management endpoints are prefixed with `/api` and require a `{conn_id}` parameter identifying the connection profile to use.

### Health API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Basic health check (returns `{"status": "ok"}`) |
| `GET` | `/api/health?detail=true` | Detailed health check with database component status |

### Connections API (`/api/connections`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/connections` | List all saved connection profiles |
| `POST` | `/api/connections` | Create a new connection profile |
| `GET` | `/api/connections/{conn_id}` | Get a single connection profile by ID |
| `PUT` | `/api/connections/{conn_id}` | Update an existing connection profile |
| `DELETE` | `/api/connections/{conn_id}` | Delete a connection profile and close its client |
| `GET` | `/api/connections/{conn_id}/health` | Check connection health (node count, namespaces, build, edition) |
| `POST` | `/api/connections/test` | Test connectivity without saving the profile |

### Clusters API (`/api/clusters`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/clusters/{conn_id}` | Get full cluster info (nodes, namespaces, sets, statistics) |
| `POST` | `/api/clusters/{conn_id}/namespaces` | Configure runtime-tunable namespace parameters (memory-size, replication-factor) |

### Records API (`/api/records`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/records/{conn_id}?ns=...&set=...&page=...&pageSize=...` | List records with pagination |
| `GET` | `/api/records/{conn_id}/detail?ns=...&set=...&pk=...` | Get a single record by primary key |
| `POST` | `/api/records/{conn_id}` | Create or update a record (with bins and optional TTL) |
| `DELETE` | `/api/records/{conn_id}?ns=...&set=...&pk=...` | Delete a record by primary key |
| `POST` | `/api/records/{conn_id}/filter` | Filtered scan with expression filters, predicates, bin selection, and pagination |

### Query API (`/api/query`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/query/{conn_id}` | Execute a query (primary key lookup, predicate filter, or full scan with bin selection and max records) |

### Indexes API (`/api/indexes`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/indexes/{conn_id}` | List all secondary indexes across all namespaces |
| `POST` | `/api/indexes/{conn_id}` | Create a secondary index (numeric, string, or geo2dsphere) |
| `DELETE` | `/api/indexes/{conn_id}?name=...&ns=...` | Delete a secondary index by name and namespace |

### Admin API (`/api/admin`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/{conn_id}/users` | List all users with roles, quotas, and connection counts |
| `POST` | `/api/admin/{conn_id}/users` | Create a new user with username, password, and roles |
| `PATCH` | `/api/admin/{conn_id}/users` | Change a user's password |
| `DELETE` | `/api/admin/{conn_id}/users?username=...` | Delete a user by username |
| `GET` | `/api/admin/{conn_id}/roles` | List all roles with privileges, allowlists, and quotas |
| `POST` | `/api/admin/{conn_id}/roles` | Create a new role with privileges, allowlist, and quotas |
| `DELETE` | `/api/admin/{conn_id}/roles?name=...` | Delete a role by name |

### UDFs API (`/api/udfs`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/udfs/{conn_id}` | List all registered UDF modules |
| `POST` | `/api/udfs/{conn_id}` | Upload and register a Lua UDF module |
| `DELETE` | `/api/udfs/{conn_id}?filename=...` | Delete a UDF module by filename |

### Terminal API (`/api/terminal`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/terminal/{conn_id}` | Execute an AQL-style terminal command |

### Metrics API (`/api/metrics`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/metrics/{conn_id}` | Get cluster metrics (TPS, memory, device, connections, per-namespace stats) |

### Sample Data API (`/api/sample-data`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/sample-data/{conn_id}` | Generate sample records with optional indexes and UDFs |

> Interactive API documentation (Swagger UI) is available at `http://localhost:8000/docs` when the backend is running.

## K8s Cluster Management

When running inside a Kubernetes cluster (or with `K8S_MANAGEMENT_ENABLED=true`), the Aerospike Cluster Manager provides a full GUI for managing `AerospikeCluster` custom resources (`acko.io/v1alpha1`) deployed by the [Aerospike CE Kubernetes Operator](https://github.com/KimSoungRyoul/aerospike-ce-kubernetes-operator).

### Cluster Lifecycle

Create, scale, update, and delete Aerospike clusters through a guided 9-step wizard:

1. **Basic** — Cluster name, Kubernetes namespace, size (1-8 nodes), Aerospike image selection
2. **Namespace & Storage** — Aerospike namespace configuration with in-memory or persistent (PVC) storage, replication factor, storage class selection, volume init/wipe methods, cascade delete, cleanup threads, filesystem volume policy, block volume policy
3. **Monitoring & Options** — Enable Prometheus metrics exporter (custom image, metric labels, exporter resources, exporter environment variables, ServiceMonitor, PrometheusRule with custom alerting rules), select an AerospikeClusterTemplate, enable dynamic configuration updates, configure network access type (Pod IP, Host Internal/External, Configured IP with custom network names), auto-generate Kubernetes NetworkPolicy (standard or Cilium), configure Seeds Finder LoadBalancer for external seed discovery (service port, target port, external traffic policy, annotations, labels, load balancer source ranges)
4. **Resources** — CPU/memory requests and limits with validation, auto-connect toggle
5. **Security (ACL)** — Enable access control, define roles (with privileges and CIDR allowlists), configure users with K8s Secret-backed credentials
6. **Rolling Update** — Configure rolling update strategy: batch size, max unavailable (absolute or percentage), PodDisruptionBudget control
7. **Rack Config** — Multi-rack deployment with zone affinity, per-rack storage overrides (different StorageClass, volume size per rack), per-rack tolerations/affinity/nodeSelector overrides, per-rack aerospikeConfig overrides, batch scaling controls (maxIgnorablePods, rollingUpdateBatchSize, scaleDownBatchSize)
8. **Advanced** — Pod management policy, DNS policy, readiness gate, pod metadata (labels/annotations), headless service metadata (annotations/labels), per-pod service metadata (annotations/labels), bandwidth throttling (CNI ingress/egress limits), node block list (select K8s nodes to exclude from scheduling), validation policy, rack ID override, nodeSelector, tolerations, hostNetwork, multiPodPerHost, imagePullSecrets, serviceAccountName, terminationGracePeriod
9. **Review** — Summary of all settings before creation

### Cluster Phases

Full support for all 10 operator-reported cluster phases with color-coded status badges:

| Phase | Description |
|---|---|
| **InProgress** | Cluster is being reconciled |
| **Completed** | Cluster is healthy and fully reconciled |
| **Error** | Reconciliation encountered an error |
| **ScalingUp** | Nodes are being added |
| **ScalingDown** | Nodes are being removed |
| **WaitingForMigration** | Waiting for data migration to complete |
| **RollingRestart** | Rolling restart is in progress |
| **ACLSync** | Access control list synchronization in progress |
| **Paused** | Reconciliation is paused for maintenance |
| **Deleting** | Cluster is being deleted |

### Status Conditions

The cluster detail page displays real-time operator conditions (Available, Ready, ConfigApplied, etc.) with visual indicators for True/False status, transition reasons, and messages.

### Template Management

> **Breaking Change:** Templates are now **cluster-scoped** resources (not namespaced). Template API endpoints no longer include `{namespace}` in the path. See the [K8s API Endpoints](#k8s-api-endpoints) table for updated routes.

Full lifecycle management of `AerospikeClusterTemplate` resources:

- **Browse** — List all templates cluster-wide with image, size, and age
- **Create** — Define new templates with defaults for image, size, resources, scheduling (anti-affinity, pod management policy, tolerations, node affinity, topology spread constraints), storage (class, volume mode, size, local PV requirement, local storage classes, delete-on-restart policy), monitoring, network access, service config (feature key file), network config (heartbeat mode/port/interval/timeout), rack config (maxRacksPerNode), and aerospikeConfig overrides
- **View Details** — Inspect template spec, resource defaults, and see which clusters reference the template via the "Referenced By" display
- **Delete** — Remove unused templates (protected against deletion while referenced by clusters)
- **Reference** — Select templates during cluster creation via the wizard
- **Scheduling** — Template scheduling supports tolerations, node affinity rules, and topology spread constraints (maxSkew, topologyKey, whenUnsatisfiable, labelSelector with matchLabels) in addition to pod anti-affinity and pod management policy. Topology spread constraints can be configured directly in the template edit dialog
- **Extended Template Overrides** — Templates support override fields for scheduling, storage, rackConfig, and aerospikeConfig in addition to the existing image, size, resources, monitoring, and networkPolicy fields. This allows templates to serve as comprehensive baseline configurations for cluster creation
- **Advanced Config** — Templates support service config (feature key file), network config (heartbeat mode/port/interval/timeout), rack config (maxRacksPerNode), local PV storage requirements, local storage classes, and delete-on-restart policy for local PV workflows

### Operations

From the cluster detail page, you can:

- **Scale** — Change cluster size (1-8 nodes) via a scale dialog
- **Edit** — Modify running cluster settings (image, size, dynamic config, aerospike config, network policy, NetworkPolicy auto-generation, ACL, monitoring config, bandwidth config, node block list, validation policy, service metadata, rack ID override, pod metadata, nodeSelector, tolerations, hostNetwork, imagePullSecrets, serviceAccountName, terminationGracePeriod, sidecars, initContainers, securityContext, topologySpreadConstraints, Seeds Finder Services) with diff-based patching
- **HPA** — Create, view, and delete HorizontalPodAutoscaler resources for automatic cluster scaling based on CPU/memory utilization
- **Warm Restart** — Trigger a warm restart operation (all pods or selected pods via checkboxes)
- **Pod Restart** — Trigger a full pod restart operation (all pods or selected pods via checkboxes)
- **Pause / Resume** — Pause reconciliation for maintenance windows, then resume when ready
- **Delete** — Delete a cluster with a confirmation dialog (auto-cleans associated connection profiles)

### Operation Status Progress

When a WarmRestart or PodRestart operation is active, the cluster detail page displays real-time progress tracking:

- **Progress Bar** — A visual progress bar showing the percentage of pods that have completed the operation.
- **Completed Pods** — Count of pods that have successfully restarted.
- **Failed Pods** — Count of pods that encountered errors during the operation, enabling quick identification of issues.
- **Operation Type** — Indicates whether the active operation is a WarmRestart or PodRestart.

The progress display appears automatically when an operation is in progress and disappears once the operation completes. During active operations, the detail page polls at a higher frequency (every 5 seconds) to keep the status current.

### Pod Status Details

The cluster detail page displays per-pod status including:

- **Access Endpoints** — Network endpoints for direct client access to each pod
- **Readiness Gate Satisfied** — Whether the operator's custom readiness gate condition is met
- **Unstable Since** — ISO timestamp of when a pod first became NotReady, aiding instability diagnosis
- **Config Hash / Pod Spec Hash** — For identifying configuration drift across pods
- **Rack ID** — Rack assignment for topology-aware deployments

### Dynamic Config

Enable dynamic configuration updates during cluster creation. When enabled, the operator applies configuration changes without requiring pod restarts. The cluster detail page shows the dynamic config toggle status and per-pod config status (Applied/Failed/Pending).

### Template Snapshot & Sync Status

When a cluster references an AerospikeClusterTemplate, the detail page shows a Template Snapshot card with:

- **Sync Status Badge** — A visual badge indicating whether the cluster is **Synced** or **Out of Sync** with its referenced template. The badge updates in real time as the operator reconciles.
- **Last Sync Timestamp** — The timestamp of the last successful template synchronization, so operators can quickly see when the cluster last aligned with the template spec.
- **Template Name & Resource Version** — Identifies which template and version the cluster was last synced to.
- **Snapshot Timestamp** — When the template snapshot was captured.
- **Collapsible Spec Viewer** — Expand to inspect the full template spec that was applied.

If a template is modified after a cluster was created from it, the badge changes to "Out of Sync" and a resync can be triggered via the `POST /api/k8s/clusters/{namespace}/{name}/resync-template` endpoint.

### Events Timeline

View Kubernetes events associated with cluster resources, including event type, reason, message, occurrence count, and timestamps. Events auto-refresh during transitional phases. Events are categorized into 11 categories (Lifecycle, Rolling Restart, Configuration, ACL Security, Scaling, Rack Management, Network, Monitoring, Template, Circuit Breaker, Other) with clickable filter chips to narrow the view.

### Configuration Drift Detection

The cluster detail page includes a Config Status card that detects drift between the desired spec and the currently applied spec. Per-pod config hash groups show which pods are running identical configurations and which have diverged, making it easy to identify partial rollout states.

### Reconciliation Health Dashboard

A circuit breaker health dashboard shows the operator's reconciliation state, including a visual progress bar toward the circuit breaker threshold, the current backoff timer, and detailed error information. A manual reset button allows operators to clear the circuit breaker and force a fresh reconciliation attempt.

### Auto-refresh

The cluster list and detail pages automatically poll for updates when any cluster is in a transitional phase (InProgress, ScalingUp, ScalingDown, WaitingForMigration, RollingRestart, ACLSync, Deleting). The list page polls every 10 seconds; the detail page polls every 5 seconds.

### Auto-connect

When creating a cluster, the "Auto-connect" option (enabled by default) automatically creates a connection profile pointing to the cluster's headless service (`<name>.<namespace>.svc.cluster.local`), so you can immediately browse data through the Aerospike connection features.

### PrometheusRule Custom Rules

The monitoring configuration wizard supports PrometheusRule with optional `customRules`. When custom rules are provided, the operator's built-in alerts (NodeDown, StopWrites, HighDiskUsage, HighMemoryUsage) are replaced entirely with user-defined alerting and recording rules. Each custom rule entry is a complete Prometheus rule group object containing `name` and `rules` fields. This allows teams to define cluster-specific alerts tailored to their SLOs and operational requirements.

### Per-Rack Storage Overrides

The Rack Config wizard step supports per-rack storage overrides. Each rack can specify a different StorageClass and volume size, enabling heterogeneous storage configurations across availability zones. For example, rack 1 in `us-east-1a` can use `io2` SSD volumes with 100Gi, while rack 2 in `us-east-1b` uses the cluster-level default `gp3` with 50Gi.

### Per-Rack Tolerations and Affinity

Each rack can override the cluster-level scheduling settings:

- **tolerations** -- Allow pods in a specific rack to tolerate node taints unique to that availability zone
- **affinity** -- Set rack-specific node affinity rules (e.g., target specific instance types per zone)
- **nodeSelector** -- Constrain a rack to nodes with specific labels

These overrides are configured in the Rack Config wizard step and the cluster edit dialog.

### Service Metadata

The Advanced wizard step and cluster edit dialog support custom metadata for Kubernetes services:

- **Headless Service Metadata** -- Add custom annotations and labels to the headless service (`<cluster-name>-headless`) used for DNS-based pod discovery. Useful for External DNS integration, Prometheus scrape annotations, and service mesh configuration.
- **Per-Pod Service Metadata** -- When pod services are enabled, each pod gets an individual ClusterIP Service. Custom annotations and labels can be added for External DNS, load balancer configuration, or service mesh integration.
- **Pod Metadata** -- Add custom labels and annotations directly to Aerospike pods for service mesh sidecar injection (e.g., Istio), monitoring label selectors, cost allocation tags, or external tool integration.

### Topology Spread Constraints

The cluster creation wizard (Advanced step) and the cluster edit dialog support Kubernetes `topologySpreadConstraints` for distributing Aerospike pods evenly across failure domains (zones, regions, nodes). Each constraint can be configured with:

- **maxSkew** -- Maximum allowed difference in pod count between topology domains
- **topologyKey** -- The node label key that defines the topology domain (e.g., `topology.kubernetes.io/zone`, `kubernetes.io/hostname`)
- **whenUnsatisfiable** -- Scheduling behavior when the constraint cannot be satisfied: `DoNotSchedule` (hard) or `ScheduleAnyway` (soft)
- **labelSelector** -- Label selector to identify which pods are subject to this constraint. The UI provides a key-value pair editor for matchLabels

Multiple constraints can be added to enforce distribution across both zones and individual nodes simultaneously. For example, you can ensure pods are evenly spread across availability zones while also preventing too many pods on a single node.

Topology spread constraints are available in both the cluster creation wizard and edit dialog. Templates also support topology spread constraints in the scheduling configuration, enabling standardized distribution policies across all clusters created from a template.

### Pod Security Context

Both the cluster creation wizard (Advanced step) and the cluster edit dialog support configuring a pod-level `securityContext`. This allows operators to enforce security policies such as:

- **runAsUser / runAsGroup** -- Run all containers as a specific UID/GID
- **runAsNonRoot** -- Enforce non-root execution
- **fsGroup** -- Set the group ownership of mounted volumes
- **seccompProfile** -- Apply a Seccomp security profile (e.g., `RuntimeDefault`)
- **supplementalGroups** -- Additional GIDs for the pod's processes

The security context is applied at the pod level and affects all containers (Aerospike, exporter sidecar, and any custom sidecars/init containers).

### Seeds Finder Services

The Seeds Finder Services configuration enables external seed discovery for Aerospike clusters using a Kubernetes LoadBalancer service. The edit dialog provides a dedicated UI for configuring the LoadBalancer with the following options:

- **Service Port** -- The port exposed by the LoadBalancer service for external clients
- **Target Port** -- The target port on the Aerospike pod that the LoadBalancer forwards traffic to
- **External Traffic Policy** -- Controls how external traffic is routed: `Cluster` (default, distributes across all nodes) or `Local` (preserves client source IP, routes only to node-local endpoints)
- **Annotations** -- Key-value editor for adding custom annotations to the LoadBalancer service (e.g., cloud provider-specific load balancer configuration)
- **Labels** -- Key-value editor for adding custom labels to the LoadBalancer service
- **Load Balancer Source Ranges** -- CIDR list for restricting which source IP ranges can access the LoadBalancer (e.g., `10.0.0.0/8`, `192.168.1.0/24`)

Seeds Finder Services configuration is also displayed in the wizard review step, showing the full LoadBalancer configuration summary before cluster creation.

### Multi-Volume Storage

The Namespace & Storage wizard step supports configuring multiple storage volumes per Aerospike namespace. Each volume can be independently configured with:

- **Volume Name** -- Unique identifier for the volume within the cluster
- **Storage Type** -- `memory` (in-memory) or `device` (persistent PVC-backed)
- **Storage Class** -- Kubernetes StorageClass for PVC provisioning (per volume)
- **Volume Size** -- Independent size per volume (e.g., 10Gi for data, 5Gi for index)
- **Volume Mode** -- `Filesystem` or `Block` mode
- **Mount Path** -- Custom mount path inside the container
- **Init Method / Wipe Method** -- Per-volume initialization and cleanup methods
- **Cascade Delete** -- Whether to delete the PVC when the cluster is deleted

This enables advanced storage topologies such as separating data and index volumes on different storage classes (e.g., SSD for data, NVMe for index), or using different volume sizes for different purposes.

### Sidecar & Init Container Wizard

The cluster edit dialog provides a dedicated configuration section for adding custom sidecar containers and init containers to Aerospike pods. Each container is configured with:

| Field | Description |
|-------|-------------|
| **Name** | Container name (must be unique within the pod) |
| **Image** | Container image (e.g., `busybox:latest`, `my-agent:v1.0`) |
| **Command** | Override the container entrypoint (optional) |
| **Args** | Arguments to pass to the command (optional) |
| **Environment Variables** | Key-value pairs for container environment |
| **Volume Mounts** | Mount paths for shared volumes |
| **Resources** | CPU/memory requests and limits |

Common use cases include:

- **Log Shipping** -- Sidecar that tails Aerospike logs and forwards them to a central logging system (Fluentd, Filebeat)
- **Backup Agent** -- Sidecar running periodic backups to object storage (S3, GCS)
- **Data Initialization** -- Init container that pre-loads data or configuration before Aerospike starts
- **Certificate Rotation** -- Sidecar that watches and refreshes TLS certificates


### K8s API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/k8s/clusters` | List all AerospikeCluster resources |
| `GET` | `/api/k8s/clusters/{namespace}/{name}` | Get cluster detail (spec, status, pods, conditions) |
| `POST` | `/api/k8s/clusters` | Create a new AerospikeCluster |
| `PATCH` | `/api/k8s/clusters/{namespace}/{name}` | Update cluster (size, image, resources, monitoring, paused, dynamic config, aerospike config) |
| `DELETE` | `/api/k8s/clusters/{namespace}/{name}` | Delete a cluster |
| `POST` | `/api/k8s/clusters/{namespace}/{name}/scale` | Scale cluster to a specific size |
| `GET` | `/api/k8s/clusters/{namespace}/{name}/events` | Get Kubernetes events (supports `?category=` filter) |
| `POST` | `/api/k8s/clusters/{namespace}/{name}/operations` | Trigger operations (WarmRestart, PodRestart) |
| `GET` | `/api/k8s/clusters/{namespace}/{name}/health` | Get cluster health summary (pods, migration, conditions) |
| `GET` | `/api/k8s/clusters/{namespace}/{name}/migration-status` | Get real-time migration status (overall + per-pod remaining records) |
| `GET` | `/api/k8s/clusters/{namespace}/{name}/config-drift` | Detect configuration drift (spec vs applied spec, pod hash groups) |
| `GET` | `/api/k8s/clusters/{namespace}/{name}/reconciliation-status` | Get reconciliation health (circuit breaker state, backoff timer) |
| `GET` | `/api/k8s/clusters/{namespace}/{name}/pods/{pod}/logs` | Get container logs for a pod |
| `GET` | `/api/k8s/clusters/{namespace}/{name}/yaml` | Export cluster CR as clean YAML |
| `GET` | `/api/k8s/clusters/{namespace}/{name}/hpa` | Get HPA config and status for a cluster |
| `POST` | `/api/k8s/clusters/{namespace}/{name}/hpa` | Create or update HPA (minReplicas, maxReplicas, CPU/memory targets) |
| `DELETE` | `/api/k8s/clusters/{namespace}/{name}/hpa` | Delete HPA for a cluster |
| `POST` | `/api/k8s/clusters/{namespace}/{name}/resync-template` | Trigger template resync via annotation |
| `GET` | `/api/k8s/templates` | List all AerospikeClusterTemplate resources (cluster-scoped) |
| `POST` | `/api/k8s/templates` | Create a new AerospikeClusterTemplate |
| `GET` | `/api/k8s/templates/{name}` | Get template detail (spec, status, usedBy) |
| `PATCH` | `/api/k8s/templates/{name}` | Update a template (scheduling, storage, monitoring, resources, etc.) |
| `DELETE` | `/api/k8s/templates/{name}` | Delete a template (fails if referenced by clusters) |
| `GET` | `/api/k8s/namespaces` | List available Kubernetes namespaces |
| `GET` | `/api/k8s/storageclasses` | List available Kubernetes storage classes |
| `GET` | `/api/k8s/secrets` | List K8s Secrets (for ACL picker) |
| `GET` | `/api/k8s/nodes` | List K8s nodes with zone/region info (for rack config) |

All K8s endpoints are gated by the `K8S_MANAGEMENT_ENABLED` configuration flag. When disabled, a 404 is returned so the frontend can hide K8s features gracefully.

### Extended Pod Status Fields

The pod status response now includes additional fields for richer cluster monitoring:

| Field | Type | Description |
|-------|------|-------------|
| `accessEndpoints` | `string[]` | Network endpoints for direct client access to the pod |
| `readinessGateSatisfied` | `bool` | Whether the `acko.io/aerospike-ready` readiness gate is satisfied |
| `unstableSince` | `string` | ISO timestamp of when the pod first became NotReady (reset when Ready) |

### Extended Backend API Fields

The create/update cluster requests support additional pod-level fields:

| Field | Type | Description |
|-------|------|-------------|
| `imagePullSecrets` | `string[]` | Private registry image pull secret names |
| `securityContext` | `object` | Pod-level security context |
| `topologySpreadConstraints` | `object[]` | Topology spread constraints for pod scheduling |
| `sidecars` | `SidecarConfig[]` | Sidecar containers to add to the pod |
| `initContainers` | `SidecarConfig[]` | Init containers to add to the pod |

### PrometheusRule Custom Rules

The `PrometheusRule` monitoring configuration now supports user-defined Prometheus alerting rule groups via the `customRules` field. This allows operators to ship cluster-specific alerting rules alongside the standard metrics exporter.

| Field | Type | Description |
|-------|------|-------------|
| `customRules` | `dict[]` | Custom Prometheus rule groups (each entry is a standard Prometheus rule group object with `name`, `rules`, etc.) |

### Template Advanced Configuration

Templates (`AerospikeClusterTemplate`) now support additional configuration sections for service, network, rack, and storage settings:

**Service Config** (`serviceConfig`)

| Field | Type | Description |
|-------|------|-------------|
| `featureKeyFile` | `string` | Path to an Aerospike feature key file |

**Network Config** (`networkConfig`)

| Field | Type | Description |
|-------|------|-------------|
| `heartbeatMode` | `"mesh" \| "multicast"` | Heartbeat protocol mode |
| `heartbeatPort` | `int` (1024-65535) | Heartbeat communication port |
| `heartbeatInterval` | `int` (>=50) | Heartbeat interval in milliseconds |
| `heartbeatTimeout` | `int` (>=1) | Heartbeat timeout (number of intervals before a node is considered departed) |

**Rack Config** (`rackConfig`)

| Field | Type | Description |
|-------|------|-------------|
| `maxRacksPerNode` | `int` (>=1) | Maximum number of racks allowed per node |

**Aerospike Config** (`aerospikeConfig`)

| Field | Type | Description |
|-------|------|-------------|
| `aerospikeConfig` | `object` | Aerospike server configuration overrides applied to clusters created from this template |

**Storage Config** (additional fields)

| Field | Type | Description |
|-------|------|-------------|
| `localPVRequired` | `bool` | Whether a local PersistentVolume is required for storage |
| `localStorageClasses` | `string[]` | List of StorageClass names that are backed by local PVs. Used to identify which storage classes require local PV scheduling constraints |
| `deleteLocalStorageOnRestart` | `bool` | Whether to delete local PersistentVolumes when pods are restarted. Enables clean-slate restarts for local PV workflows where data does not need to survive pod restart |

### Storage Advanced Settings

Cluster creation and update requests now support additional storage-level fields on `StorageVolumeConfig`:

| Field | Type | Description |
|-------|------|-------------|
| `cleanupThreads` | `int` (>=1) | Number of threads for storage cleanup operations |
| `filesystemVolumePolicy` | `object` | Policy for filesystem volume initialization (e.g., default initMethod, wipeMethod) |
| `blockVolumePolicy` | `object` | Policy for block volume initialization (e.g., default initMethod, wipeMethod) |
| `localStorageClasses` | `string[]` | StorageClass names backed by local PVs, used for scheduling constraint awareness |
| `deleteLocalStorageOnRestart` | `bool` | Delete local PersistentVolumes on pod restart for clean-slate local PV workflows |

## Project Structure

```
aerospike-cluster-manager/
├── backend/                # FastAPI REST API
│   ├── src/aerospike_cluster_manager_api/
│   │   ├── main.py         # App entry point
│   │   ├── models/         # Pydantic models (incl. k8s_cluster.py)
│   │   ├── routers/        # API endpoints (incl. k8s_clusters.py)
│   │   ├── k8s_client.py   # Kubernetes API client
│   │   └── mock_data/      # Dev mock data
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/               # Next.js App Router
│   ├── src/
│   │   ├── app/            # Pages & routing
│   │   │   └── k8s/        # K8s cluster & template management pages
│   │   ├── components/     # UI components
│   │   │   └── k8s/        # K8s-specific components (wizard, cards, dialogs, event timeline, config drift, reconciliation health)
│   │   ├── stores/         # Zustand state (incl. k8s-cluster-store.ts)
│   │   ├── hooks/          # Custom hooks
│   │   └── lib/            # API client, utils, types, validations
│   ├── Dockerfile
│   └── package.json
├── compose.yaml            # Full stack (all containers)
├── compose.dev.yaml        # Aerospike only (for local dev)
└── .env.example
```

## Development

### Testing

```bash
cd frontend
npm run test              # Unit tests (Vitest)
npm run test:coverage     # With coverage report
npm run test:e2e          # E2E tests (Playwright)
```

### Code Quality

```bash
# Frontend
cd frontend
npm run lint              # ESLint
npm run format:check      # Prettier check
npm run type-check        # TypeScript

# Backend
cd backend
uv run ruff check src     # Lint
uv run ruff format src    # Format

# Pre-commit (both)
pre-commit run --all-files
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `AEROSPIKE_HOST` | `aerospike` | Aerospike server host |
| `AEROSPIKE_PORT` | `3000` | Aerospike service port |
| `BACKEND_PORT` | `8000` | Backend API port |
| `FRONTEND_PORT` | `3100` | Frontend port |
| `CORS_ORIGINS` | `http://localhost:3100` | Allowed CORS origins |
| `BACKEND_URL` | `http://localhost:8000` | Backend URL (frontend proxy target) |
| `K8S_MANAGEMENT_ENABLED` | `false` | Enable K8s cluster management endpoints (requires in-cluster or kubeconfig access) |

## Production Deployment

### Single Container Deployment

The project includes a multi-stage `Dockerfile` that bundles both the frontend (Next.js standalone) and backend (FastAPI/Uvicorn) into a single container image. The container runs as a non-root user (`appuser`) and exposes two ports:

- **Port 3000** — Frontend (Next.js)
- **Port 8000** — Backend API (Uvicorn)

```bash
# Build the container image
podman build -t aerospike-cluster-manager .

# Run with SQLite (default — no extra services needed)
podman run -d \
  -p 3100:3000 \
  -p 8000:8000 \
  -v ~/.aerospike-cluster-manager:/app/data:U \
  aerospike-cluster-manager
```

A built-in health check (`/api/health`) is configured with a 10-second interval and 15-second start period.

### Environment Variables for Production

| Variable | Default | Description |
|---|---|---|
| `SQLITE_PATH` | `/app/data/connections.db` | SQLite database file path (default backend) |
| `ENABLE_POSTGRES` | `false` | Use PostgreSQL instead of SQLite |
| `DATABASE_URL` | `postgresql://aerospike:aerospike@localhost:5432/aerospike_manager` | PostgreSQL connection string (only used when `ENABLE_POSTGRES=true`) |
| `HOST` | `0.0.0.0` | Backend bind address |
| `PORT` | `8000` | Backend bind port |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of allowed CORS origins |
| `BACKEND_URL` | `http://localhost:8000` | Backend URL used by the frontend proxy |
| `K8S_MANAGEMENT_ENABLED` | `false` | Enable Kubernetes cluster management endpoints (requires in-cluster or kubeconfig access) |
| `LOG_LEVEL` | `INFO` | Backend log level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `LOG_FORMAT` | `text` | Log output format (`text` or `json` for structured logging) |

### Database Setup

Connection profiles are persisted in **SQLite by default** — no external database required. The SQLite file is written to `SQLITE_PATH` (defaults to `/app/data/connections.db` inside the container).

**SQLite (default):**

Mount a host directory to persist the database across container restarts:

```bash
podman run -d \
  -p 3100:3000 \
  -v ~/.aerospike-cluster-manager:/app/data:U \
  aerospike-cluster-manager
```

**PostgreSQL (optional — for high-availability or shared deployments):**

Set `ENABLE_POSTGRES=true` and provide a `DATABASE_URL`:

```bash
podman run -d \
  -p 3100:3000 \
  -e ENABLE_POSTGRES=true \
  -e DATABASE_URL=postgresql://user:password@your-db-host:5432/aerospike_manager \
  aerospike-cluster-manager
```

Or use the PostgreSQL Compose override:

```bash
podman compose -f compose.yaml -f compose-pg.yaml up --build
```

### Reverse Proxy / Ingress Configuration

When deploying behind a reverse proxy (Nginx, Traefik, etc.) or Kubernetes Ingress, route traffic to both services:

- `/` and all static assets to the frontend on port 3000
- `/api/*` to the backend on port 8000

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name aerospike-manager.example.com;

    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

When running inside Kubernetes, set `K8S_MANAGEMENT_ENABLED=true` and ensure the pod's service account has permissions to manage `AerospikeCluster` and `AerospikeClusterTemplate` custom resources.

### Kubernetes Operator Integration

The Aerospike Cluster Manager is designed to work alongside the [Aerospike CE Kubernetes Operator](https://github.com/KimSoungRyoul/aerospike-ce-kubernetes-operator) as the GUI management plane. See the [Architecture Guide](docs/architecture.md) for full details on how the components fit together.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
