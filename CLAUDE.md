# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aerospike Cluster Manager — A full-stack GUI management tool for Aerospike Community Edition. Built with FastAPI API + Next.js UI, orchestrated via podman Compose.

## Commands

### Full Stack (podman)
```bash
podman compose -f compose.yaml up --build          # Run full stack (Aerospike + API + UI)
podman compose -f compose.yaml down                # Stop full stack
podman compose -f compose.dev.yaml up -d           # Aerospike only (for local dev)
podman compose -f compose.dev.yaml down            # Stop Aerospike
```

### API (Python 3.13 / FastAPI)
```bash
cd api
uv run uvicorn aerospike_cluster_manager_api.main:app --reload  # Dev server (port 8000)
uv run ruff check src --fix                         # lint + autofix
uv run ruff format src                              # format
```

### UI (Next.js 14 / React 18, Tremor-based)
```bash
cd ui
npm run dev              # Dev server (port 3100)
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
├── api/               # FastAPI REST API (Python 3.13, uv)
│   └── src/aerospike_cluster_manager_api/
│       ├── main.py        # FastAPI app, CORS, router registration, /api/health
│       ├── config.py      # Environment variable based configuration
│       ├── db/            # Database persistence layer (SQLite default / PostgreSQL optional)
│       │   ├── __init__.py    # Dispatch layer: selects backend at init_db() time
│       │   ├── _sqlite.py     # SQLite backend (aiosqlite, WAL mode, default)
│       │   └── _postgres.py   # PostgreSQL backend (asyncpg, used when ENABLE_POSTGRES=true)
│       ├── models/        # Pydantic models (connection, cluster, record, index, admin, udf, metrics, query, terminal, k8s_cluster incl. ACLRoleSpec, ACLUserSpec, ACLConfig, RollingUpdateConfig, OperationStatusResponse)
│       ├── routers/       # REST endpoints (/api/* prefix, incl. k8s_clusters.py)
│       ├── services/      # Business logic services (k8s_service.py)
│       ├── k8s_client.py  # Kubernetes API client (clusters, templates, pods, events, namespaces, storage classes, secrets)
│       └── mock_data/     # Mock data generators for development
├── ui/                # Next.js 14 App Router (React 18, TypeScript, Tremor)
│   └── src/
│       ├── app/           # Page routing (App Router)
│       ├── components/    # UI components (Tremor Raw primitives + dialogs + navigation)
│       ├── stores/        # Zustand stores (connection, cluster, k8s-cluster, ui)
│       ├── hooks/         # Custom hooks (use-connections, use-cluster, use-k8s-clusters, use-event-stream)
│       └── lib/
│           ├── api/       # Per-resource fetch clients (auto retry, timeout, type-safe)
│           ├── types/     # TS mirrors of API Pydantic models
│           └── utils.ts   # cn/cx, focusRing, focusInput, formatters
├── aerospike/         # Aerospike configuration & seed data
│   ├── aerospike.conf     # 3-node mesh cluster config (namespace: test)
│   └── seed-data.sh       # Seed script: 1234 records + 5 indexes
├── compose.yaml       # Full stack (Aerospike + API + UI + Seed)
└── compose.dev.yaml   # Aerospike only (for local dev)
```

### Compose Files

| File | Purpose | Aerospike Ports | API | UI |
|------|---------|-----------------|-----|----|
| `compose.yaml` | CI/deploy — all containers + seed data | Internal only (no host mapping) | Container (8000) | Container (3100) |
| `compose.dev.yaml` | Local dev — Aerospike only | 14790, 14791, 14792 | Local (`uv run`, 8000) | Local (`npm run dev`, 3100) |

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

Local dev with `compose.dev.yaml` requires setting `AEROSPIKE_HOST=localhost AEROSPIKE_PORT=14790` when starting the API.

### Key Architectural Decisions

- **API Proxy**: `/api/*` requests are proxied to the API. In dev, Next.js `rewrites` forward to `API_URL` (default `http://localhost:8000`). In production the standalone bundle is wrapped by `ui/proxy.js`, which forwards `/api/*` to `API_URL` resolved at container start.
- **State Management**: Zustand stores are separated by domain. Only `ui-store` persists to localStorage via `persist` middleware.
- **Type Mirroring**: API Pydantic models and UI TypeScript types (`ui/src/lib/types/`) are manually synchronized. Both sides must be updated when models change.
- **Styling**: Tailwind CSS 3.4 + Tremor Raw component primitives (MIT). Inter font (UI) + JetBrains Mono (data). Indigo accent.
- **Path Alias**: `@/` points to `ui/src/` (configured in both tsconfig and vitest).

### API Policies

- **No Lua UDFs**: Do not bundle or register Lua UDF scripts in the API. The `routers/udfs.py` endpoint exists for users to manage their own UDFs, but the API itself must not ship Lua files. Use aerospike-py expressions, CDT operations, and client-side Python for server-side filtering or data manipulation.

### UI Route Structure
| Route | Description |
|---|---|
| `/clusters` | Cluster list (connection profiles + ACKO-managed merged) |
| `/clusters/[clusterId]` | Cluster overview (+ ACKO panel if managed) |
| `/clusters/[clusterId]/sets` | Namespace cards + set chips |
| `/clusters/[clusterId]/sets/[ns]/[set]` | Record browser |
| `/clusters/[clusterId]/sets/[ns]/[set]/records/[key]` | Record detail + edit |
| `/clusters/[clusterId]/secondary-indexes` | Secondary index list |
| `/clusters/[clusterId]/admin` | Users / roles |
| `/clusters/[clusterId]/udfs` | UDF modules |
| `/acko/templates` | `AerospikeClusterTemplate` CRs (cluster-scoped) |

## Code Style

- **API**: Ruff (line-length=120, target=py313). Import sorting via isort. Rules: `E`, `W`, `F`, `I`, `UP`, `B`, `SIM`, `RUF`.
- **UI**: ESLint (next/core-web-vitals + typescript). Prettier (printWidth=100, doubleQuote). `no-console: warn`. `no-explicit-any` allowed in test files.
- **Pre-commit**: trailing-whitespace, end-of-file-fixer, check-yaml/json, Ruff(api), ESLint+Prettier(ui) auto-run.

## Environment Variables

See `.env.example`. Used in podman Compose:
- `SQLITE_PATH` — SQLite database file path (default: `/app/data/connections.db` in container, `./data/connections.db` locally)
- `ENABLE_POSTGRES` — Use PostgreSQL instead of SQLite (default: `false`)
- `DATABASE_URL` — PostgreSQL connection string; only used when `ENABLE_POSTGRES=true` (default: `postgresql://aerospike:aerospike@localhost:5432/aerospike_manager`)
- `AEROSPIKE_HOST`, `AEROSPIKE_PORT` — Aerospike server connection info
- `API_PORT` (default 8000), `UI_PORT` (default 3100)
- `API_URL` — UI → API target (default `http://localhost:8000` in dev, ACKO Service in prod)
- `CORS_ORIGINS` — API CORS allowed origins
- `K8S_MANAGEMENT_ENABLED` — Enable K8s cluster management endpoints (default: `false`; requires in-cluster or kubeconfig access)
