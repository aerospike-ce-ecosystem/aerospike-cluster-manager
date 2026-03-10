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
  - Seeds Finder Services advanced config: LoadBalancer annotations, labels, and source ranges
  - Cluster health dashboard with rack distribution and migration status
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
  - Enhanced pod table: readiness gate status, access endpoints, stability indicators (unstableSince)
  - Accessibility: aria-labels, keyboard navigation, screen-reader support across all K8s components
- **Light/Dark Mode** — System theme integration

## K8s Cluster Management

When running inside a Kubernetes cluster (or with `K8S_MANAGEMENT_ENABLED=true`), the Aerospike Cluster Manager provides a full GUI for managing `AerospikeCluster` custom resources (`acko.io/v1alpha1`) deployed by the [Aerospike CE Kubernetes Operator](https://github.com/KimSoungRyoul/aerospike-ce-kubernetes-operator).

### Cluster Lifecycle

Create, scale, update, and delete Aerospike clusters through a guided 9-step wizard:

1. **Basic** — Cluster name, Kubernetes namespace, size (1-8 nodes), Aerospike image selection
2. **Namespace & Storage** — Aerospike namespace configuration with in-memory or persistent (PVC) storage, replication factor, storage class selection, volume init/wipe methods, cascade delete, cleanup threads, filesystem volume policy, block volume policy
3. **Monitoring & Options** — Enable Prometheus metrics exporter (custom image, metric labels, exporter resources, exporter environment variables, ServiceMonitor, PrometheusRule with custom alerting rules), select an AerospikeClusterTemplate, enable dynamic configuration updates, configure network access type (Pod IP, Host Internal/External, Configured IP with custom network names), auto-generate Kubernetes NetworkPolicy (standard or Cilium), configure Seeds Finder LoadBalancer for external seed discovery (annotations, labels, source ranges)
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
- **Scheduling** — Template scheduling supports tolerations, node affinity rules, and topology spread constraints in addition to pod anti-affinity and pod management policy
- **Extended Template Overrides** — Templates support override fields for scheduling, storage, rackConfig, and aerospikeConfig in addition to the existing image, size, resources, monitoring, and networkPolicy fields. This allows templates to serve as comprehensive baseline configurations for cluster creation
- **Advanced Config** — Templates support service config (feature key file), network config (heartbeat mode/port/interval/timeout), rack config (maxRacksPerNode), local PV storage requirements, local storage classes, and delete-on-restart policy for local PV workflows

### Operations

From the cluster detail page, you can:

- **Scale** — Change cluster size (1-8 nodes) via a scale dialog
- **Edit** — Modify running cluster settings (image, size, dynamic config, aerospike config, network policy, NetworkPolicy auto-generation, ACL, monitoring config, bandwidth config, node block list, validation policy, service metadata, rack ID override, pod metadata, nodeSelector, tolerations, hostNetwork, imagePullSecrets, serviceAccountName, terminationGracePeriod, sidecars, initContainers, securityContext, topologySpreadConstraints) with diff-based patching
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

## License

This project is licensed under the [Apache License 2.0](LICENSE).
