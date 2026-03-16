# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aerospike Cluster Manager — A full-stack GUI management tool for Aerospike Community Edition. Built with FastAPI backend + Next.js frontend, orchestrated via podman Compose.

## Commands

### Full Stack (podman)
```bash
podman compose -f compose.yaml up --build          # Run full stack (Aerospike + Backend + Frontend)
podman compose -f compose.yaml down                # Stop full stack
podman compose -f compose.dev.yaml up -d           # Aerospike only (for local dev)
podman compose -f compose.dev.yaml down            # Stop Aerospike
```

### Backend (Python 3.13 / FastAPI)
```bash
cd backend
uv run uvicorn aerospike_cluster_manager_api.main:app --reload  # Dev server (port 8000)
uv run ruff check src --fix                         # lint + autofix
uv run ruff format src                              # format
```

### Frontend (Next.js 16 / React 19)
```bash
cd frontend
npm run dev              # Dev server (port 3000)
npm run build            # Production build
npm run lint             # ESLint
npm run lint:fix         # ESLint autofix
npm run format           # Prettier format
npm run format:check     # Prettier check
npm run type-check       # TypeScript strict check
npm run test             # Vitest unit tests
npm run test:watch       # Vitest watch mode
npm run test:coverage    # Vitest + coverage (v8)
npm run test:e2e         # Playwright E2E tests
```

### Pre-commit
```bash
pre-commit run --all-files  # Run pre-commit on all files
```

## Architecture

```
aerospike-cluster-manager/
├── backend/           # FastAPI REST API (Python 3.13, uv)
│   └── src/aerospike_cluster_manager_api/
│       ├── main.py        # FastAPI app, CORS, router registration, /api/health
│       ├── config.py      # Environment variable based configuration
│       ├── store.py       # in-memory mock data store (for development)
│       ├── models/        # Pydantic models (connection, cluster, record, index, admin, udf, metrics, query, terminal, k8s_cluster incl. ACLRoleSpec, ACLUserSpec, ACLConfig, RollingUpdateConfig, OperationStatusResponse)
│       ├── routers/       # REST endpoints (/api/* prefix, incl. k8s_clusters.py)
│       ├── services/      # Business logic services (k8s_service.py)
│       ├── k8s_client.py  # Kubernetes API client (clusters, templates, pods, events, namespaces, storage classes, secrets)
│       └── mock_data/     # Mock data generators for development
├── frontend/          # Next.js 16 App Router (React 19, TypeScript)
│   └── src/
│       ├── app/           # Page routing (App Router)
│       ├── components/    # UI components
│       │   ├── ui/        # Radix-based shared primitives (shadcn/ui pattern)
│       │   ├── common/    # Reusable components (json-viewer, code-editor, status-badge, etc.)
│       │   ├── layout/    # App shell (header, sidebar, tab-bar)
│       │   ├── k8s/       # K8s cluster management (wizard, cards, status badge, scale/delete dialogs, pod table, event timeline with category filters, config drift card, circuit breaker dashboard)
│       │   └── connection/, admin/  # Domain-specific components
│       ├── stores/        # Zustand stores (connection, browser, query, admin, metrics, ui, k8s-cluster)
│       ├── hooks/         # Custom hooks (use-async-data, use-debounce, use-pagination, etc.)
│       └── lib/
│           ├── api/       # API client (auto retry, timeout, type-safe)
│           ├── validations/  # Zod schemas
│           ├── constants.ts  # CE limits, brand colors, page sizes
│           ├── formatters.ts # Number/byte/uptime formatters
│           └── utils.ts      # cn() (clsx + tailwind-merge)
├── aerospike/         # Aerospike configuration & seed data
│   ├── aerospike.conf     # 3-node mesh cluster config (namespace: test)
│   └── seed-data.sh       # Seed script: 1234 records + 5 indexes
├── compose.yaml       # Full stack (Aerospike + Backend + Frontend + Seed)
└── compose.dev.yaml   # Aerospike only (for local dev)
```

### Compose Files

| File | Purpose | Aerospike Ports | Backend | Frontend |
|------|---------|-----------------|---------|----------|
| `compose.yaml` | CI/deploy — all containers + seed data | Internal only (no host mapping) | Container (8000) | Container (3100) |
| `compose.dev.yaml` | Local dev — Aerospike only | 14790, 14791, 14792 | Local (`uv run`, 8000) | Local (`npm run dev`, 3000) |

Both files include `aerospike-tools` container (`entrypoint: []` + `tail -f /dev/null`) for persistent aql/asadm access:
```bash
podman exec -it aerospike-tools aql -h aerospike-node-1
podman exec -it aerospike-tools asadm -h aerospike-node-1
podman exec -it aerospike-tools bash
```

`compose.yaml` includes `aerospike-seed` container that runs once on startup (`restart: "no"`):
- Inserts **1234 records** into `test.sample_set` with 7 bin types (Integer, String, Double, Boolean/Int, List, Map, GeoJSON)
- Creates **5 secondary indexes** (idx_bin_int, idx_bin_str, idx_bin_double, idx_bin_bool, idx_bin_geojson) via `asinfo sindex-create`

> **Note**: The `aerospike/aerospike-tools` image has a `wrapper` entrypoint that only accepts known commands (aql, asadm, etc.). Both `aerospike-tools` and `aerospike-seed` services use `entrypoint: []` to override it.

Local dev with `compose.dev.yaml` requires setting `AEROSPIKE_HOST=localhost AEROSPIKE_PORT=14790` when starting the backend.

### Key Architectural Decisions

- **API Proxy**: `/api/*` requests are proxied to the backend via Next.js `rewrites`. Target is configured with `BACKEND_URL` env var (default: `http://localhost:8000`).
- **State Management**: Zustand stores are separated by domain. Only `ui-store` persists to localStorage via `persist` middleware.
- **Type Mirroring**: Backend Pydantic models and frontend TypeScript types (`lib/api/types.ts`) are manually synchronized. Both sides must be updated when models change.
- **Styling**: Tailwind CSS 4 + DaisyUI 5. Light/dark mode themes via CSS custom properties. Custom animations defined in `globals.css`.
- **Path Alias**: `@/` points to `frontend/src/` (configured in both tsconfig and vitest).

### Backend Policies

- **No Lua UDFs**: Do not bundle or register Lua UDF scripts in the backend. The `routers/udfs.py` endpoint exists for users to manage their own UDFs, but the backend itself must not ship Lua files. Use aerospike-py expressions, CDT operations, and client-side Python for server-side filtering or data manipulation.

### Frontend Route Structure
| Route | Description |
|---|---|
| `/` | Connection list/management |
| `/cluster/[connId]` | Cluster overview, nodes, namespaces, metrics, Prometheus |
| `/browser/[connId]` | Namespace/set tree |
| `/browser/[connId]/[ns]/[set]` | Record browser (pagination) |
| `/query/[connId]` | Query builder (scan/query + predicates) |
| `/indexes/[connId]` | Secondary index management |
| `/admin/[connId]` | User/role management |
| `/udfs/[connId]` | UDF management |
| `/terminal/[connId]` | AQL terminal |
| `/k8s/clusters` | K8s AerospikeCluster list (auto-refresh for transitional phases) |
| `/k8s/clusters/new` | K8s cluster creation wizard (9 steps: Basic, Namespace & Storage, Monitoring & Options, Resources, ACL / Security, Rolling Update, Rack Config, Advanced, Review) |
| `/k8s/clusters/[namespace]/[name]` | K8s cluster detail (status, conditions, pods, operations, event timeline, config drift, reconciliation health) |
| `/k8s/templates` | K8s AerospikeClusterTemplate list (cluster-scoped) |
| `/k8s/templates/[name]` | K8s template detail (cluster-scoped, no namespace in path) |

## Code Style

- **Backend**: Ruff (line-length=120, target=py313). Import sorting via isort. Rules: `E`, `W`, `F`, `I`, `UP`, `B`, `SIM`, `RUF`.
- **Frontend**: ESLint (next/core-web-vitals + typescript). Prettier (printWidth=100, doubleQuote). `no-console: warn`. `no-explicit-any` allowed in test files.
- **Pre-commit**: trailing-whitespace, end-of-file-fixer, check-yaml/json, Ruff(backend), ESLint+Prettier(frontend) auto-run.

## Environment Variables

See `.env.example`. Used in podman Compose:
- `DATABASE_URL` — PostgreSQL connection string (default: `postgresql://aerospike:aerospike@localhost:5432/aerospike_manager`)
- `AEROSPIKE_HOST`, `AEROSPIKE_PORT` — Aerospike server connection info
- `BACKEND_PORT` (default 8000), `FRONTEND_PORT` (default 3100)
- `CORS_ORIGINS` — Backend CORS allowed origins
- `K8S_MANAGEMENT_ENABLED` — Enable K8s cluster management endpoints (default: `false`; requires in-cluster or kubeconfig access)
