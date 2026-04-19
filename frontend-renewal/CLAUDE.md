# CLAUDE.md — frontend-renewal

This file guides Claude Code when working inside `frontend-renewal/`. Read it
before any non-trivial change. It supplements the repo-root `CLAUDE.md`.

## Purpose

`frontend-renewal/` is a **parallel rewrite** of the existing `frontend/`
project, kept side-by-side so both can run concurrently and the migration can
be reviewed screen-by-screen. Once renewal reaches feature parity + stability,
it replaces `frontend/`.

Goals, in priority order:

1. **Feature parity superset** — every user-visible capability in `frontend/`
   must exist in renewal. Do not remove or reduce functionality. Renewal is a
   strict superset.
2. **Improved UX** — Tremor-inspired design language (indigo accent, restrained
   layouts, namespace-card + set-chip instead of flat tables, explicit
   loading / empty / error states, consistent typography).
3. **Cleaner app structure** — hierarchical `/clusters/[id]/...` routing that
   matches mental model (cluster → namespace → set → record), top TabNavigation
   per cluster, Sidebar drill-down for direct set access, workspace switcher
   at the top of the sidebar.

Non-goals:

- Not a throwaway prototype. Production quality only.
- Not a partial rewrite. Every screen that exists in `frontend/` must have an
  equivalent here before shipping.

## Stack

| Layer           | Renewal                                                             | Why                                                                                                          |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Framework       | **Next 14.2** (App Router)                                          | Pinned to match Tremor dashboard template; avoids React 19 breakage on Calendar / DatePicker / TabNavigation |
| React           | **18.2**                                                            | Same reason                                                                                                  |
| Styling         | **Tailwind 3.4**                                                    | Tremor Raw components ship Tailwind 3 classnames; avoid the Tailwind 4 migration cost until Tremor updates   |
| Components      | **Tremor Raw (MIT)** copy-pasted to `src/components/`               | Licensed under MIT, `LICENSE.md` preserved in the directory                                                  |
| Charts          | recharts                                                            | As shipped by Tremor Raw                                                                                     |
| Icons           | `@remixicon/react`                                                  | Tremor's default icon set                                                                                    |
| State           | `zustand`                                                           | Matches frontend/'s choice                                                                                   |
| Forms           | `react-hook-form` NOT used. Plain `useState` + zod parse at submit. | Keeps dialogs simple                                                                                         |
| Package manager | **npm** (with `--legacy-peer-deps`)                                 | Template ships pnpm; we standardise on npm across the repo                                                   |

## Commands

All commands run from `frontend-renewal/`.

```bash
npm install --legacy-peer-deps       # install deps (peer conflicts: react-day-picker 8 vs React 19)
npm run dev                          # dev server on http://localhost:3001
npm run type-check                   # tsc --noEmit
npm run lint                         # next lint
npm run build                        # production build
npm run start                        # serve built bundle on 3001
```

For full stack during local dev (podman + backend + frontend-renewal):

```bash
# 1. Aerospike + postgres only
cd .. && podman compose -f compose.dev.yaml up -d

# 2. Backend on :8000
cd backend && AEROSPIKE_HOST=localhost AEROSPIKE_PORT=14790 \
  uv run uvicorn aerospike_cluster_manager_api.main:app --host 127.0.0.1 --port 8000

# 3. Frontend renewal on :3001 (/api/* → http://localhost:8000)
cd frontend-renewal && npm run dev
```

Local dev caveat: Aerospike advertises its container-internal IP after the
initial seed connection. The `aerospike/aerospike.conf` in the repo already
adds `access-address 127.0.0.1 / access-port 14790` for single-node dev. Keep
only `aerospike-node-1` running when developing with backend on the host.

## Directory layout

```
frontend-renewal/
├── next.config.mjs             # /api/* proxy → BACKEND_URL, CSP headers
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
│   │   ├── types/              # TS mirrors of backend Pydantic models
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
   (`ConnectionProfile`) in the backend DB. Does not create any Kubernetes
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
  profile so the cluster is immediately browseable. Backend
  `K8sClusterSummary.connectionId` is the link between the CR and the
  profile; if it is `null` the UI should offer a one-click "Link connection"
  action. `autoConnectWarning` must be surfaced when present.
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
- `/clusters/[clusterId]/sets/[ns]/[set]/records/new` — new record.
- `/clusters/[clusterId]/secondary-indexes` — sindex list.
- `/clusters/[clusterId]/admin` — users + roles. Renders
  "Security is not enabled" state on 403 (CE default).
- `/clusters/[clusterId]/udfs` — UDF modules.
- `/clusters/[clusterId]/acko` — ACKO subtab rendered only when this
  connection is managed by ACKO. Shares the detail layout with
  `/acko/clusters/[ns]/[name]`.
- `/acko/clusters` — `AerospikeCluster` CR list.
- `/acko/clusters/new` — 9-step creation wizard. Steps 1–4 + Review are
  shipped; steps 5–8 (Monitoring, ACL, Rack, Advanced) are FIXME'd.
- `/acko/clusters/[namespace]/[name]` — CR detail (phase, pods, events,
  operations, scale, delete).
- `/acko/templates` — `AerospikeClusterTemplate` CRs.
- `/acko/templates/new` — template creator.
- `/acko/templates/[name]` — template detail with referenced clusters.
- `/settings` — app preferences (theme, CE limitations, about).

`clusterId` in the URL is the connection profile `id` (e.g.
`conn-be77a99faef0`). It is **not** the ACKO CR name — the two are linked via
`K8sClusterSummary.connectionId`.

## Rules

### Always do

1. **Use backend data, not mock data.** Pages that display data must use the
   real `src/lib/api/` clients through either a hook or a direct fetch. Mock
   data in UI code is a bug.
2. **Read `frontend/` first** before removing or changing any feature. The
   existing project has handled CE/EE edge cases, error states, and empty
   states already. Search for the equivalent page or store.
3. **Match or improve, never reduce.** If a screen in `frontend/` shows N
   columns or handles an edge case, renewal must do at least the same.
4. **Preserve Tremor MIT notice** in `src/components/LICENSE.md`.
5. **Type check** (`npm run type-check`) before declaring work done.

### Never do

1. **Never remove a page / tab / feature** on the assumption that CE does not
   support it. Aerospike CE supports security (with `security { }` block),
   sindex, UDFs, rack awareness, and SC — just often not enabled by default.
   See `.claude/skills/aerospike-ce-capabilities/SKILL.md`.
2. **Never fabricate data** ("Throughput 184.2K ops/s" or "events 41.2M") if
   the backend does not have an endpoint for it. Either wire a real endpoint
   or omit the widget.
3. **Never touch `frontend/`** from renewal work. The two projects are
   independent; cross-contamination defeats the point of side-by-side review.
4. **Never mix routes between the two sections** — mutations should go
   through `src/components/dialogs/*`, not inline in page files.

## Backend error → UI state mapping

Established in `frontend/` and replicated here:

| Backend response                               | UI renders                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| 2xx                                            | Normal state                                                                        |
| 403 with `EE_MSG` ("Security is not enabled…") | Explanatory card with `security { }` config snippet + docs link. Tab stays visible. |
| 503 (cluster unreachable)                      | Error banner + retry button. Do not hide page.                                      |
| 404                                            | Empty state for the resource.                                                       |

Use `ApiError.status` check after `listUsers` / `listRoles` / etc. to branch.

## When in doubt

- Compare with `frontend/src/app/<same-path>/page.tsx` for feature parity.
- Consult `.claude/skills/aerospike-ce-capabilities/SKILL.md` for CE/EE.
- Ask the user before deleting anything visible to end users.
