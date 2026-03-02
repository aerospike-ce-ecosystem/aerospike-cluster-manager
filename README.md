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
  - Cluster edit dialog (image, size, dynamic config, aerospike config)
  - Template snapshot viewer with sync status
  - Dynamic config status per pod (Applied/Failed/Pending)
  - Last restart reason and timestamp per pod
  - Reconciliation error monitoring
  - K8s events timeline with auto-refresh
  - K8s secrets picker for ACL credential management
- **Light/Dark Mode** — System theme integration

## K8s Cluster Management

When running inside a Kubernetes cluster (or with `K8S_MANAGEMENT_ENABLED=true`), the Aerospike Cluster Manager provides a full GUI for managing `AerospikeCluster` custom resources (`acko.io/v1alpha1`) deployed by the [Aerospike CE Kubernetes Operator](https://github.com/KimSoungRyoul/aerospike-ce-kubernetes-operator).

### Cluster Lifecycle

Create, scale, update, and delete Aerospike clusters through a guided 7-step wizard:

1. **Basic** — Cluster name, Kubernetes namespace, size (1-8 nodes), Aerospike image selection
2. **Namespace & Storage** — Aerospike namespace configuration with in-memory or persistent (PVC) storage, replication factor, storage class selection
3. **Monitoring & Options** — Enable Prometheus metrics exporter, select an AerospikeClusterTemplate, enable dynamic configuration updates
4. **ACL / Security** — Enable access control, define roles (with privileges and CIDR allowlists), configure users with K8s Secret-backed credentials
5. **Rolling Update** — Configure rolling update strategy: batch size, max unavailable (absolute or percentage), PodDisruptionBudget control
6. **Resources** — CPU/memory requests and limits with validation, auto-connect toggle
7. **Review** — Summary of all settings before creation

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

Browse available `AerospikeClusterTemplate` resources across namespaces and reference them during cluster creation. Templates provide reusable default settings that are applied as a base configuration.

### Operations

From the cluster detail page, you can:

- **Scale** — Change cluster size (1-8 nodes) via a scale dialog
- **Edit** — Modify running cluster settings (image, size, dynamic config, aerospike config) with diff-based patching
- **Warm Restart** — Trigger a warm restart operation (all pods or selected pods via checkboxes)
- **Pod Restart** — Trigger a full pod restart operation (all pods or selected pods via checkboxes)
- **Pause / Resume** — Pause reconciliation for maintenance windows, then resume when ready
- **Delete** — Delete a cluster with a confirmation dialog (auto-cleans associated connection profiles)

### Dynamic Config

Enable dynamic configuration updates during cluster creation. When enabled, the operator applies configuration changes without requiring pod restarts. The cluster detail page shows the dynamic config toggle status and per-pod config status (Applied/Failed/Pending).

### Template Snapshot

When a cluster references an AerospikeClusterTemplate, the detail page shows a Template Snapshot card with sync status (Synced/Out of Sync), template name, resource version, snapshot timestamp, and a collapsible template spec viewer.

### Events Timeline

View Kubernetes events associated with cluster resources, including event type, reason, message, occurrence count, and timestamps. Events auto-refresh during transitional phases.

### Auto-refresh

The cluster list and detail pages automatically poll for updates when any cluster is in a transitional phase (InProgress, ScalingUp, ScalingDown, WaitingForMigration, RollingRestart, ACLSync, Deleting). The list page polls every 10 seconds; the detail page polls every 5 seconds.

### Auto-connect

When creating a cluster, the "Auto-connect" option (enabled by default) automatically creates a connection profile pointing to the cluster's headless service (`<name>.<namespace>.svc.cluster.local`), so you can immediately browse data through the Aerospike connection features.

### K8s API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/k8s/clusters` | List all AerospikeCluster resources |
| `GET` | `/api/k8s/clusters/{namespace}/{name}` | Get cluster detail (spec, status, pods, conditions) |
| `POST` | `/api/k8s/clusters` | Create a new AerospikeCluster |
| `PATCH` | `/api/k8s/clusters/{namespace}/{name}` | Update cluster (size, image, resources, monitoring, paused, dynamic config, aerospike config) |
| `DELETE` | `/api/k8s/clusters/{namespace}/{name}` | Delete a cluster |
| `POST` | `/api/k8s/clusters/{namespace}/{name}/scale` | Scale cluster to a specific size |
| `GET` | `/api/k8s/clusters/{namespace}/{name}/events` | Get Kubernetes events for the cluster |
| `POST` | `/api/k8s/clusters/{namespace}/{name}/operations` | Trigger operations (WarmRestart, PodRestart) |
| `GET` | `/api/k8s/templates` | List AerospikeClusterTemplate resources |
| `GET` | `/api/k8s/templates/{namespace}/{name}` | Get template detail |
| `GET` | `/api/k8s/namespaces` | List available Kubernetes namespaces |
| `GET` | `/api/k8s/storageclasses` | List available Kubernetes storage classes |
| `GET` | `/api/k8s/secrets` | List K8s Secrets (for ACL picker) |

All K8s endpoints are gated by the `K8S_MANAGEMENT_ENABLED` configuration flag. When disabled, a 404 is returned so the frontend can hide K8s features gracefully.

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
│   │   │   └── k8s/        # K8s cluster management pages
│   │   ├── components/     # UI components
│   │   │   └── k8s/        # K8s-specific components (wizard, cards, dialogs)
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
