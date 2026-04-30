# CLAUDE.md — ui

This file guides Claude Code when working inside `ui/`. Read it before any
non-trivial change. It supplements the repo-root `CLAUDE.md`.

## Purpose

`ui/` is the production Next.js frontend for `aerospike-cluster-manager`.
Tremor-inspired design language (indigo accent, restrained layouts,
namespace-card + set-chip instead of flat tables, explicit
loading / empty / error states, consistent typography). Hierarchical
`/clusters/[id]/...` routing that matches mental model
(cluster → namespace → set → record), top TabNavigation per cluster, Sidebar
drill-down for direct set access, workspace switcher at the top of the
sidebar.

## Stack

| Layer           | Choice                                                              | Why                                                                                                          |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Framework       | **Next 14.2** (App Router)                                          | Pinned to match Tremor dashboard template; avoids React 19 breakage on Calendar / DatePicker / TabNavigation |
| React           | **18.2**                                                            | Same reason                                                                                                  |
| Styling         | **Tailwind 3.4**                                                    | Tremor Raw components ship Tailwind 3 classnames; avoid the Tailwind 4 migration cost until Tremor updates   |
| Components      | **Tremor Raw (MIT)** copy-pasted to `src/components/`               | Licensed under MIT, `LICENSE.md` preserved in the directory                                                  |
| Charts          | recharts                                                            | As shipped by Tremor Raw                                                                                     |
| Icons           | `@remixicon/react`                                                  | Tremor's default icon set                                                                                    |
| State           | `zustand`                                                           | Simple, store-per-domain                                                                                     |
| Forms           | `react-hook-form` NOT used. Plain `useState` + zod parse at submit. | Keeps dialogs simple                                                                                         |
| Package manager | **npm** (with `--legacy-peer-deps`)                                 | Template ships pnpm; we standardise on npm across the repo                                                   |

## Commands

All commands run from `ui/`.

```bash
npm install --legacy-peer-deps       # install deps (peer conflicts: react-day-picker 8 vs React 19)
npm run dev                          # dev server on http://localhost:3100
npm run type-check                   # tsc --noEmit
npm run lint                         # next lint
npm run build                        # production build
npm run start                        # serve built bundle on 3100
```

For full stack during local dev (podman + api + ui):

```bash
# 1. Aerospike + postgres only
cd .. && podman compose -f compose.dev.yaml up -d

# 2. API on :8000
cd api && AEROSPIKE_HOST=localhost AEROSPIKE_PORT=14790 \
  uv run uvicorn aerospike_cluster_manager_api.main:app --host 127.0.0.1 --port 8000

# 3. UI on :3100 (/api/* → http://localhost:8000)
cd ui && npm run dev
```

Local dev caveat: Aerospike advertises its container-internal IP after the
initial seed connection. The `aerospike/aerospike.conf` in the repo already
adds `access-address 127.0.0.1 / access-port 14790` for single-node dev. Keep
only `aerospike-node-1` running when developing with api on the host.

## Directory layout

```
ui/
├── next.config.mjs             # /api/* proxy → API_URL, CSP headers
├── proxy.js                    # Production sidecar: spawns server.js, forwards /api/* to API_URL
├── tailwind.config.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root: Inter font, theme provider, max-w-screen-2xl
│   │   ├── page.tsx            # → redirect /clusters
│   │   ├── siteConfig.ts       # baseLinks + clusterSections URL helpers
│   │   ├── globals.css
│   │   └── (main)/
│   │       ├── layout.tsx      # Sidebar + main content padding
│   │       ├── clusters/
│   │       │   ├── page.tsx                                # Cluster list
│   │       │   └── [clusterId]/
│   │       │       ├── layout.tsx                          # Breadcrumb + ClusterTabs
│   │       │       ├── page.tsx                            # Overview (+ ACKO card if managed)
│   │       │       ├── sets/
│   │       │       │   ├── page.tsx                        # Namespace cards + set chips
│   │       │       │   └── [namespace]/[set]/
│   │       │       │       ├── page.tsx                    # Record browser (dynamic bin columns)
│   │       │       │       └── records/[key]/page.tsx      # Record detail + edit
│   │       │       ├── secondary-indexes/page.tsx
│   │       │       ├── admin/page.tsx                      # Users / roles (CE: security-disabled state)
│   │       │       └── udfs/page.tsx
│   │       └── acko/templates/page.tsx                     # AerospikeClusterTemplate list
│   ├── components/
│   │   ├── *.tsx               # Tremor Raw primitives (Card, Button, Table, …)
│   │   ├── LICENSE.md          # Tremor MIT notice — DO NOT REMOVE
│   │   ├── dialogs/            # Mutation dialogs (AddConnectionDialog, …)
│   │   └── ui/navigation/      # Sidebar, MobileSidebar, ClusterTabs, WorkspacesDropdown, UserProfile
│   ├── hooks/                  # use-connections, use-cluster, use-k8s-clusters, use-event-stream
│   ├── lib/
│   │   ├── api/                # Per-resource fetch clients (connections, clusters, records, indexes, …)
│   │   ├── types/              # TS mirrors of API Pydantic models
│   │   ├── utils.ts            # cn/cx, focusRing, focusInput, formatters
│   │   ├── chartUtils.ts, useOnWindowResize.tsx   # Tremor Raw helpers
│   └── stores/                 # Zustand stores: connection, cluster, k8s-cluster, ui
```

## Product scope — two connection paths, one unified "Clusters" view

`aerospike-cluster-manager` manages clusters that originate from **two
different paths**, and both must be first-class citizens in the UI:

1. **Add Connection** (Sidebar workspace dropdown → "Add workspace", or the
   `Add Connection` button on `/clusters`) — attach an **existing** Aerospike
   cluster reachable at some `host:port`. Stores a connection profile
   (`ConnectionProfile`) in the api DB. Does not create any Kubernetes
   resource. Used for clusters running outside Kubernetes, on another cluster
   we don't operate, in a different cloud, bare metal, etc.

2. **Create Cluster** (button on `/clusters`) — provision a new
   **ACKO-managed** Aerospike cluster by creating an `AerospikeCluster` CR
   via the K8s operator. This is a feature of aerospike-cluster-manager, not a
   separate admin tool — ACKO lifecycle (create / scale / roll / delete /
   pause / operations / events / HPA) belongs here.

Both paths feed the same `/clusters` list and the same drill-down
(`/clusters/[clusterId]/...`). The user should never care which path produced
a cluster once it is listed.

### How the two must integrate

- **Create Cluster → auto-create connection.** When the user creates a cluster
  via ACKO, the UI should also create (or upsert) a matching connection
  profile so the cluster is immediately browseable. API `K8sClusterSummary.connectionId`
  is the link between the CR and the profile; if it is `null` the UI should
  offer a one-click "Link connection" action. `autoConnectWarning` must be
  surfaced when present.
- **Add Connection → detect ACKO.** After adding a connection, the UI should
  check `useK8sClusters()` for a matching entry (same host / cluster name / a
  future hint field). When matched, the cluster card flips to show the
  `ACKO` badge and the Overview page renders the ACKO panel.
- **Single delete flow.** Deleting a cluster from `/clusters` must delete
  both the `AerospikeCluster` CR (if any) and the connection profile in a
  single confirm dialog — with a clear summary of what will be deleted.
- **Unified status.** The card / row in `/clusters` derives status from
  whichever side is authoritative: ACKO `phase` if managed, else connection
  `health` from `GET /api/connections/{id}/health`.

ACKO-specific surfaces that must live inside the `/clusters/[id]/...` tree
(not a sibling route):

- Phase / conditions / reconciliation health / config drift / migration
  status
- Pods list + logs, events timeline
- CR YAML view + edit
- PVCs
- Operations (warm restart, force reconcile, reset circuit breaker, resync
  template)
- HPA (get / set / delete)
- Scale / delete / pause / resume

`AerospikeClusterTemplate` CRs are cluster-scoped and therefore live at
`/acko/templates` as a sibling section, used as the starting shape for
"Create Cluster".

## Routing convention

- `/clusters` — all clusters (connection profiles + ACKO-managed merged).
- `/clusters/[clusterId]` — overview. ACKO card shown only when
  `useK8sClusters()` has an entry with matching `connectionId`.
- `/clusters/[clusterId]/sets` — Namespaces tab. Card per namespace, set chips.
- `/clusters/[clusterId]/sets/[ns]/[set]` — record browser.
- `/clusters/[clusterId]/sets/[ns]/[set]/records/[key]` — record detail + edit.
- `/clusters/[clusterId]/secondary-indexes` — sindex list.
- `/clusters/[clusterId]/admin` — users + roles. Renders
  "Security is not enabled" state on 403 (CE default).
- `/clusters/[clusterId]/udfs` — UDF modules.
- `/acko/templates` — `AerospikeClusterTemplate` CRs.

`clusterId` in the URL is the connection profile `id` (e.g.
`conn-be77a99faef0`). It is **not** the ACKO CR name — the two are linked via
`K8sClusterSummary.connectionId`.

## Rules

### Always do

1. **Use api data, not mock data.** Pages that display data must use the
   real `src/lib/api/` clients through either a hook or a direct fetch. Mock
   data in UI code is a bug.
2. **Preserve Tremor MIT notice** in `src/components/LICENSE.md`.
3. **Type check** (`npm run type-check`) before declaring work done.

### Never do

1. **Never remove a page / tab / feature** on the assumption that CE does not
   support it. Aerospike CE supports security (with `security { }` block),
   sindex, UDFs, rack awareness, and SC — just often not enabled by default.
2. **Never fabricate data** ("Throughput 184.2K ops/s" or "events 41.2M") if
   the api does not have an endpoint for it. Either wire a real endpoint
   or omit the widget.
3. **Never put mutations inline in page files** — mutations should go through
   `src/components/dialogs/*`.

## API error → UI state mapping

| API response                                   | UI renders                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| 2xx                                            | Normal state                                                                        |
| 403 with `EE_MSG` ("Security is not enabled…") | Explanatory card with `security { }` config snippet + docs link. Tab stays visible. |
| 503 (cluster unreachable)                      | Error banner + retry button. Do not hide page.                                      |
| 404                                            | Empty state for the resource.                                                       |

Use `ApiError.status` check after `listUsers` / `listRoles` / etc. to branch.
