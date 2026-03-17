# Architecture Guide

This document describes how the Aerospike Cluster Manager integrates with the Aerospike CE Kubernetes Operator and the broader Kubernetes ecosystem.

## System Overview

The Aerospike Cluster Manager is a web-based GUI that provides two primary capabilities:

1. **Aerospike Data Management** -- Direct interaction with Aerospike clusters (record browsing, queries, index management, ACL, UDFs, AQL terminal, metrics).
2. **Kubernetes Cluster Lifecycle Management** -- Full GUI for managing `AerospikeCluster` and `AerospikeClusterTemplate` custom resources deployed by the Aerospike CE Kubernetes Operator.

```
+------------------------------------------------------+
|                  User's Browser                      |
|  (Next.js 16 / React 19 / Tailwind / DaisyUI)       |
+----------------------------+-------------------------+
                             |
                        HTTP / REST
                             |
+----------------------------v-------------------------+
|              Backend (FastAPI / Python 3.13)          |
|                                                      |
|  +---------------+  +-----------------------------+  |
|  | Data Routers  |  |    K8s Routers              |  |
|  | (connections, |  |    (k8s_clusters.py)         |  |
|  |  records,     |  |                             |  |
|  |  query,       |  |  Uses kubernetes-client     |  |
|  |  indexes,     |  |  via asyncio.to_thread()    |  |
|  |  admin,       |  |                             |  |
|  |  udfs,        |  |                             |  |
|  |  terminal,    |  |                             |  |
|  |  metrics)     |  |                             |  |
|  +-------+-------+  +-------------+---------------+  |
|          |                        |                   |
+----------+------------------------+-------------------+
           |                        |
           v                        v
+----------+-------+   +------------+------------------+
| Aerospike Server |   |  Kubernetes API Server         |
| (CE / EE)        |   |                                |
| via aerospike-py |   |  CRDs:                         |
|                  |   |  - AerospikeCluster (acko.io)  |
+------------------+   |  - AerospikeClusterTemplate    |
                       |                                |
                       |  Resources:                    |
                       |  - Pods, Namespaces, Secrets   |
                       |  - StorageClasses, Nodes       |
                       |  - HPA, Events                 |
                       +----------------+---------------+
                                        |
                                        v
                       +----------------+---------------+
                       | Aerospike CE K8s Operator       |
                       | (controller-manager)            |
                       |                                |
                       | Watches AerospikeCluster CRs   |
                       | and reconciles:                 |
                       |  - StatefulSets / Pods          |
                       |  - Services (headless, per-pod) |
                       |  - ConfigMaps                   |
                       |  - NetworkPolicies              |
                       |  - ServiceMonitor / PrometheusRule |
                       +--------------------------------+
```

## Component Roles

### Frontend (Next.js 16)

- **App Router** pages under `src/app/` for each feature area (`/browser`, `/cluster`, `/k8s/clusters`, `/k8s/templates`, `/admin`, `/indexes`, `/udfs`, `/terminal`, `/settings`).
- **Zustand stores** manage client-side state (`connection-store`, `k8s-cluster-store`, `browser-store`, `query-store`, `admin-store`, `metrics-store`, `filter-store`, `ui-store`, `toast-store`).
- K8s features are conditionally shown based on whether `GET /api/k8s/clusters` returns a 404 (K8s disabled) or a successful response.
- The **K8s cluster creation wizard** is a multi-step form with 11 steps (Step 0–10) covering creation mode, basic config, namespace/storage, monitoring, resources, ACL/security, rolling update, rack config, sidecars, advanced settings, and review.

### Backend (FastAPI)

- **Data routers** communicate with Aerospike servers using `aerospike-py` (PyO3-based Python client).
- **K8s routers** (`routers/k8s_clusters.py`) communicate with the Kubernetes API server using the official `kubernetes-client` Python library.
- All K8s API calls are wrapped with `asyncio.to_thread()` to avoid blocking the FastAPI event loop.
- The `K8sClient` singleton (`k8s_client.py`) manages the Kubernetes API connection, automatically loading either in-cluster config or kubeconfig.
- The `k8s_service.py` module contains business logic for building CRD specs, extracting summaries, computing config drift, and categorizing events.
- **PostgreSQL** stores connection profiles and application state.

### Aerospike CE Kubernetes Operator

The operator is a separate project ([aerospike-ce-kubernetes-operator](https://github.com/KimSoungRyoul/aerospike-ce-kubernetes-operator)) that runs as a controller-manager in the Kubernetes cluster. It:

- Watches `AerospikeCluster` custom resources (CRD group: `acko.io`, version: `v1alpha1`).
- Reconciles the desired state into Kubernetes primitives (StatefulSets, Services, ConfigMaps, NetworkPolicies, etc.).
- Reports cluster phase, conditions, pod status, and operation progress back into the CR status.
- Supports `AerospikeClusterTemplate` as cluster-scoped resources for reusable configuration presets.

The Cluster Manager UI reads these status fields and displays them as dashboards, progress bars, and health indicators.

## Communication Flow

### K8s Cluster Creation (example)

1. User fills out the multi-step wizard in the frontend.
2. Frontend sends `POST /api/k8s/clusters` with the `CreateK8sClusterRequest` payload.
3. Backend's `k8s_clusters.py` router validates the request and calls `build_cr()` to construct the AerospikeCluster CR manifest.
4. Backend calls `k8s_client.create_cluster(namespace, cr)` which submits the CR to the Kubernetes API via `CustomObjectsApi.create_namespaced_custom_object()`.
5. The operator detects the new CR and begins reconciliation (creating StatefulSet, Services, etc.).
6. The frontend polls `GET /api/k8s/clusters/{namespace}/{name}` to track the cluster phase as it transitions through `InProgress` -> `Completed`.
7. If auto-connect was enabled, the backend also creates a connection profile pointing to the cluster's headless service DNS name (`<name>.<namespace>.svc.cluster.local`).

### CRD Schema

The Cluster Manager interacts with two CRD types:

| CRD | API Group | Version | Scope | Plural |
|-----|-----------|---------|-------|--------|
| `AerospikeCluster` | `acko.io` | `v1alpha1` | Namespaced | `aerospikeclusters` |
| `AerospikeClusterTemplate` | `acko.io` | `v1alpha1` | Cluster | `aerospikeclustertemplates` |

## Deployment Models

### Standalone (Podman Compose)

For local development or non-Kubernetes environments, the Cluster Manager runs as a container alongside Aerospike nodes and PostgreSQL. K8s management is disabled by default (`K8S_MANAGEMENT_ENABLED=false`). Only data management features are available.

```bash
podman compose -f compose.yaml up --build
```

### Inside Kubernetes (with operator)

When deployed inside a Kubernetes cluster alongside the Aerospike CE Operator, set `K8S_MANAGEMENT_ENABLED=true`. The backend automatically loads in-cluster Kubernetes config and uses the pod's service account for API access.

**Required RBAC permissions** for the service account:

| Resource | Verbs |
|----------|-------|
| `aerospikeclusters.acko.io` | `get`, `list`, `create`, `patch`, `delete` |
| `aerospikeclustertemplates.acko.io` | `get`, `list`, `create`, `patch`, `delete` |
| `namespaces` | `get`, `list`, `create` |
| `pods` | `get`, `list` |
| `pods/log` | `get` |
| `events` | `list` |
| `storageclasses.storage.k8s.io` | `list` |
| `secrets` | `list` |
| `nodes` | `list` |
| `horizontalpodautoscalers.autoscaling/v2` | `get`, `create`, `update`, `delete` |

The operator's Helm chart can deploy the Cluster Manager as a sidecar or standalone deployment with the proper service account and RBAC preconfigured (when `ui.enabled=true` in values).

### Deployment via Operator Helm Chart

The recommended production deployment for Kubernetes uses the operator's Helm chart with the UI component enabled:

```yaml
# values.yaml
ui:
  enabled: true
  image:
    repository: ghcr.io/kimsoungryoul/aerospike-cluster-manager
    tag: latest
  service:
    type: ClusterIP
    port: 3100
  env:
    K8S_MANAGEMENT_ENABLED: "true"
    DATABASE_URL: "postgresql://user:pass@postgres:5432/aerospike_manager"
    LOG_FORMAT: "json"
    # Optional: tune database pool and K8s API timeouts
    DB_POOL_MIN_SIZE: "2"
    DB_POOL_MAX_SIZE: "10"
    DB_COMMAND_TIMEOUT: "30"
    K8S_API_TIMEOUT: "10"
    K8S_LOG_TIMEOUT: "30"
```

This deploys the Cluster Manager as a Deployment with:
- A ServiceAccount with the required RBAC permissions
- An Ingress or Service for external access
- Environment variables preconfigured for in-cluster operation
- Configurable database pool and Kubernetes API timeout settings

## Environment Configuration

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `K8S_MANAGEMENT_ENABLED` | `false` | Master switch for all K8s management features. Set to `true` when running inside a Kubernetes cluster. |
| `DATABASE_URL` | `postgresql://...@localhost:5432/aerospike_manager` | PostgreSQL connection string for persisting connection profiles. |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3100` | Comma-separated allowed CORS origins. Must include the frontend URL. |
| `LOG_LEVEL` | `INFO` | Backend log level (`DEBUG`, `INFO`, `WARNING`, `ERROR`). |
| `LOG_FORMAT` | `text` | Log format: `text` for local dev, `json` for structured container logging. |
| `HOST` | `0.0.0.0` | Backend bind address. |
| `PORT` | `8000` | Backend bind port. |

### Database Connection Pool

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_POOL_MIN_SIZE` | `2` | Minimum number of connections in the PostgreSQL connection pool. |
| `DB_POOL_MAX_SIZE` | `10` | Maximum number of connections in the PostgreSQL connection pool. |
| `DB_COMMAND_TIMEOUT` | `30` | SQL command execution timeout in seconds. Controls how long a single database query can run before being cancelled. |

### Kubernetes API

| Variable | Default | Description |
|----------|---------|-------------|
| `K8S_API_TIMEOUT` | `10` | Timeout in seconds for standard Kubernetes API calls (CRUD operations on CRDs, listing pods, nodes, etc.). |
| `K8S_LOG_TIMEOUT` | `30` | Timeout in seconds for streaming operations such as pod log retrieval. Set higher than `K8S_API_TIMEOUT` because log streaming can take longer. |

## Feature Availability by Deployment Mode

| Feature | Standalone (Compose) | In-Cluster (K8s) |
|---------|---------------------|-------------------|
| Connection Management | Yes | Yes |
| Cluster Dashboard & Metrics | Yes | Yes |
| Record Browser & CRUD | Yes | Yes |
| Query Builder | Yes | Yes |
| Index Management | Yes | Yes |
| Admin (Users/Roles) | Yes | Yes |
| UDF Management | Yes | Yes |
| AQL Terminal | Yes | Yes |
| Sample Data Generator | Yes | Yes |
| K8s Cluster Lifecycle | No | Yes |
| K8s Template Management | No | Yes |
| K8s Operations (Restart, Scale) | No | Yes |
| HPA Management | No | Yes |
| Pod Logs Viewer | No | Yes |
| Config Drift Detection | No | Yes |
| Reconciliation Health | No | Yes |
| Migration Status Monitoring | No | Yes |
| Events Timeline | No | Yes |

## New Operator Integration API Endpoints

The following endpoints were added to support deeper operator integration:

### Reconciliation Health

```
GET /api/k8s/clusters/{namespace}/{name}/reconciliation-health
```

Returns the reconciliation health for a cluster, including:

| Field | Type | Description |
|-------|------|-------------|
| `failedReconcileCount` | `int` | Number of consecutive failed reconcile attempts |
| `lastReconcileError` | `string?` | Error message from the last failed reconcile |
| `phase` | `string` | Current reconciliation phase (e.g., `Completed`, `InProgress`, `Error`) |
| `phaseReason` | `string?` | Human-readable reason for the current phase |
| `operatorVersion` | `string?` | Version of the operator managing this cluster |
| `healthStatus` | `string` | Computed health: `healthy`, `warning`, or `critical` |

This endpoint is used by the Reconciliation Health card in the UI, which auto-refreshes every 10 seconds.

### Node Blocklist

```
PATCH /api/k8s/clusters/{namespace}/{name}/node-blocklist
```

Updates `spec.k8sNodeBlockList` on the AerospikeCluster CR to exclude specific Kubernetes nodes from pod scheduling.

**Request body:**

```json
{
  "nodeNames": ["node-1", "node-3"]
}
```

**Response:** `K8sClusterSummary` -- the updated cluster summary after patching.

Send an empty `nodeNames` array to clear the blocklist.

### Enhanced Config Drift Response

```
GET /api/k8s/clusters/{namespace}/{name}/config-drift
```

The config drift endpoint now returns an enriched response:

| Field | Type | Description |
|-------|------|-------------|
| `hasDrift` | `bool` | Whether any configuration drift was detected |
| `inSync` | `bool` | Inverse of `hasDrift` for convenience |
| `changedFields` | `list[str]` | Top-level spec fields that differ between desired and applied |
| `podHashGroups` | `list[PodHashGroup]` | Pods grouped by `configHash` + `podSpecHash`, with `isCurrent` flag |
| `desiredConfigHash` | `string?` | Hash of the desired configuration |
| `desiredConfig` | `dict?` | Full desired configuration object |
| `appliedConfig` | `dict?` | Full applied (last-reconciled) configuration object |

Each `PodHashGroup` contains:
- `configHash` -- Aerospike config hash for pods in this group.
- `podSpecHash` -- Pod spec hash for pods in this group.
- `pods` -- List of pod names in this group.
- `isCurrent` -- `true` if this group matches the desired config hash.

## See also

- [Data Management Guide](./data-management.md)
- [Kubernetes Cluster Management Guide](./k8s-management.md)
