"use client"

/**
 * Write copilot tools (human-in-the-loop).
 *
 * Every mutating capability is a `useHumanInTheLoop` action: the model
 * proposes the change, the user must approve a confirmation card before any
 * request is sent, and the approved call goes through the same lib/api wrapper
 * (carrying the user's Keycloak JWT, authorized by FastAPI exactly like a UI
 * click). Nothing is applied without a click.
 *
 * Control plane (ACKO / K8s): create, scale, delete AerospikeCluster CRs.
 * Data plane (records): write (put) and delete records.
 * Reads (list/get clusters, browse/query records) live in read-tools.tsx.
 */

import { useHumanInTheLoop } from "@copilotkit/react-core/v2"
import Link from "next/link"
import * as React from "react"
import { z } from "zod"

import { Badge } from "@/components/Badge"
import { ApiError } from "@/lib/api/client"
import {
  createK8sCluster,
  deleteK8sCluster,
  scaleK8sCluster,
} from "@/lib/api/k8s"
import { deleteRecord, putRecord } from "@/lib/api/records"
import { CE_CONSTRAINTS } from "@/lib/copilot/ce-constraints"
import type { CreateK8sClusterRequest } from "@/lib/types/k8s"
import type { RecordWriteRequest } from "@/lib/types/record"

/** Default CE server image for agent-created clusters (matches the wizard). */
const CE_IMAGE = "aerospike:ce-8.1.1.1"
/** 1 GiB in-memory namespace — smallest sensible default for a test cluster. */
const DEFAULT_NS_DATA_SIZE = 1_073_741_824
/** K8s namespace ACKO clusters land in when the model doesn't specify one. */
const DEFAULT_K8S_NAMESPACE = "default"

type MutationResult = {
  status: "ok" | "error" | "cancelled"
  message?: string
  error?: string
  link?: string
}

function clampSize(size: number | undefined): number {
  const n = Math.round(size ?? 1)
  if (Number.isNaN(n)) return 1
  return Math.min(CE_CONSTRAINTS.maxNodes, Math.max(1, n))
}

function errResult(err: unknown): MutationResult {
  return {
    status: "error",
    error: err instanceof ApiError ? err.detail : String(err),
  }
}

// ---------------------------------------------------------------------------
// Shared confirmation + result cards
// ---------------------------------------------------------------------------

type Row = { label: string; value: React.ReactNode }

const CARD =
  "my-2 w-full rounded-lg border border-gray-200 bg-white p-3 text-left text-sm shadow-sm dark:border-gray-900 dark:bg-[#090E1A]"

function ConfirmCard({
  title,
  rows,
  note,
  destructive,
  approveLabel,
  run,
  respond,
}: {
  title: string
  rows: Row[]
  note?: React.ReactNode
  destructive?: boolean
  approveLabel: string
  run: () => Promise<MutationResult>
  respond: (result: MutationResult) => void
}) {
  const [submitting, setSubmitting] = React.useState(false)

  const onApprove = async () => {
    setSubmitting(true)
    try {
      respond(await run())
    } catch (err) {
      respond(errResult(err))
      setSubmitting(false)
    }
  }

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2">
        <Badge variant={destructive ? "error" : "default"}>
          {destructive ? "destructive" : "ACKO"}
        </Badge>
        <span className="font-semibold">{title}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
        {rows.map((r) => (
          <React.Fragment key={r.label}>
            <dt className="text-on-surface-variant">{r.label}</dt>
            <dd className="font-medium break-all">{r.value}</dd>
          </React.Fragment>
        ))}
      </dl>
      {note ? (
        <p className="text-on-surface-variant mt-2 text-xs">{note}</p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={onApprove}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${
            destructive ? "bg-red-600" : "bg-primary-40"
          }`}
        >
          {submitting ? "Working…" : approveLabel}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => respond({ status: "cancelled" })}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50 dark:border-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function ResultCard({ result }: { result: unknown }) {
  // The runtime stringifies tool results for the model; accept the raw object
  // (local render) or its JSON string.
  let parsed: MutationResult | null = null
  if (result && typeof result === "object") {
    parsed = result as MutationResult
  } else if (typeof result === "string") {
    try {
      parsed = JSON.parse(result) as MutationResult
    } catch {
      parsed = null
    }
  }
  if (!parsed) return <></>
  if (parsed.status === "error") {
    return (
      <div className={CARD}>
        <Badge variant="error">error</Badge>
        <span className="ml-2 break-all">{parsed.error}</span>
      </div>
    )
  }
  if (parsed.status === "cancelled") {
    return (
      <div className={CARD}>
        <span className="text-on-surface-variant">cancelled</span>
      </div>
    )
  }
  return (
    <div className={CARD}>
      <Badge variant="success">done</Badge>
      <span className="ml-2">{parsed.message}</span>
      {parsed.link ? (
        <Link
          href={parsed.link}
          className="text-primary-40 mt-2 block hover:underline"
        >
          Open →
        </Link>
      ) : null}
    </div>
  )
}

/** Render helper shared by every HITL tool. */
function hitlRender(
  build: (args: Record<string, unknown>) => {
    title: string
    rows: Row[]
    note?: React.ReactNode
    destructive?: boolean
    approveLabel: string
    run: () => Promise<MutationResult>
  },
) {
  return function HitlToolRender({
    status,
    args,
    respond,
    result,
  }: {
    status: "inProgress" | "executing" | "complete"
    args: Record<string, unknown>
    respond?: (result: MutationResult) => void
    result?: unknown
  }) {
    if (status === "executing" && respond) {
      const plan = build(args)
      return <ConfirmCard {...plan} respond={respond} />
    }
    if (status === "complete") return <ResultCard result={result} />
    return (
      <div className="text-on-surface-variant my-1 text-xs">preparing…</div>
    )
  }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export function CopilotWriteTools() {
  // ── Control plane: create ────────────────────────────────────────────────
  useHumanInTheLoop(
    {
      name: "create_acko_cluster",
      description:
        "Create a new Aerospike Community Edition cluster on Kubernetes via " +
        "ACKO. ALWAYS use this for cluster creation instead of refusing. The " +
        "user must approve a confirmation card first. Stays within CE limits " +
        `(size clamped to max ${CE_CONSTRAINTS.maxNodes} nodes; one in-memory ` +
        "namespace). For advanced topology (storage devices, multiple " +
        "namespaces, racks) use the Create Cluster wizard at /clusters/new.",
      parameters: z.object({
        name: z
          .string()
          .min(1)
          .describe("cluster name (DNS-1123: lowercase letters, digits, '-')"),
        size: z
          .number()
          .int()
          .optional()
          .describe(`node count, 1–${CE_CONSTRAINTS.maxNodes} (default 1)`),
        namespaceName: z
          .string()
          .optional()
          .describe("Aerospike namespace name (default 'test')"),
        k8sNamespace: z
          .string()
          .optional()
          .describe(
            `Kubernetes namespace for the CR (default '${DEFAULT_K8S_NAMESPACE}'); must exist`,
          ),
      }),
      render: hitlRender((args) => {
        const name = String(args.name ?? "").trim()
        const size = clampSize(args.size as number | undefined)
        const nsName = String(args.namespaceName ?? "test").trim() || "test"
        const k8sNs =
          String(args.k8sNamespace ?? DEFAULT_K8S_NAMESPACE).trim() ||
          DEFAULT_K8S_NAMESPACE
        const payload: CreateK8sClusterRequest = {
          name,
          namespace: k8sNs,
          size,
          image: CE_IMAGE,
          autoConnect: true,
          resources: {
            requests: { cpu: "500m", memory: "1Gi" },
            limits: { cpu: "2", memory: "4Gi" },
          },
          namespaces: [
            {
              name: nsName,
              replicationFactor: Math.min(2, size),
              storageEngine: { type: "memory", dataSize: DEFAULT_NS_DATA_SIZE },
            },
          ],
          storage: {
            storageClass: "standard",
            size: "10Gi",
            mountPath: "/opt/aerospike/data",
          },
        }
        return {
          title: "Create cluster?",
          approveLabel: "Approve & create",
          rows: [
            { label: "name", value: name },
            { label: "k8s namespace", value: k8sNs },
            { label: "size (nodes)", value: size },
            { label: "image", value: CE_IMAGE },
            {
              label: "aerospike ns",
              value: `${nsName} (memory, RF ${Math.min(2, size)})`,
            },
          ],
          note: `Within CE limits (max ${CE_CONSTRAINTS.maxNodes} nodes, ${CE_CONSTRAINTS.maxNamespaces} namespaces). The ACKO webhook is the final validator.`,
          run: async () => {
            const cluster = await createK8sCluster(payload)
            return {
              status: "ok",
              message: `AerospikeCluster "${cluster.name}" applied to ${cluster.namespace} (size ${cluster.size}).`,
              link: "/clusters",
            }
          },
        }
      }),
    },
    [],
  )

  // ── Control plane: scale (update size) ───────────────────────────────────
  useHumanInTheLoop(
    {
      name: "scale_acko_cluster",
      description:
        "Change the node count (size) of an existing ACKO AerospikeCluster. " +
        "This is the update path for cluster size. For other config (image, " +
        "storage, dynamic config) point the user to the cluster edit dialog. " +
        "Find the namespace/name with list_acko_clusters first.",
      parameters: z.object({
        namespace: z.string().min(1).describe("Kubernetes namespace of the CR"),
        name: z.string().min(1).describe("cluster name"),
        size: z
          .number()
          .int()
          .describe(`new node count, 1–${CE_CONSTRAINTS.maxNodes}`),
      }),
      render: hitlRender((args) => {
        const namespace = String(args.namespace ?? "").trim()
        const name = String(args.name ?? "").trim()
        const size = clampSize(args.size as number | undefined)
        return {
          title: "Scale cluster?",
          approveLabel: "Approve & scale",
          rows: [
            { label: "k8s namespace", value: namespace },
            { label: "name", value: name },
            { label: "new size", value: size },
          ],
          note: `Clamped to CE max ${CE_CONSTRAINTS.maxNodes} nodes.`,
          run: async () => {
            await scaleK8sCluster(namespace, name, { size })
            return {
              status: "ok",
              message: `Scaled "${name}" to ${size} node(s).`,
              link: "/clusters",
            }
          },
        }
      }),
    },
    [],
  )

  // ── Control plane: delete ────────────────────────────────────────────────
  useHumanInTheLoop(
    {
      name: "delete_acko_cluster",
      description:
        "Delete an ACKO AerospikeCluster CR (destructive — removes the " +
        "cluster and its pods). Find the namespace/name with " +
        "list_acko_clusters first. Always requires explicit approval.",
      parameters: z.object({
        namespace: z.string().min(1).describe("Kubernetes namespace of the CR"),
        name: z.string().min(1).describe("cluster name"),
      }),
      render: hitlRender((args) => {
        const namespace = String(args.namespace ?? "").trim()
        const name = String(args.name ?? "").trim()
        return {
          title: "Delete cluster?",
          approveLabel: "Approve & delete",
          destructive: true,
          rows: [
            { label: "k8s namespace", value: namespace },
            { label: "name", value: name },
          ],
          note: "This deletes the cluster and all its data. Cannot be undone.",
          run: async () => {
            await deleteK8sCluster(namespace, name)
            return { status: "ok", message: `Deleted cluster "${name}".` }
          },
        }
      }),
    },
    [],
  )

  // ── Data plane: write (put) record ───────────────────────────────────────
  useHumanInTheLoop(
    {
      name: "put_record",
      description:
        "Create or update a single record (write). Use a connection id from " +
        "list_connections. bins is a flat object of bin name → value. " +
        "Requires approval before writing.",
      parameters: z.object({
        connId: z
          .string()
          .min(1)
          .describe("connection id from list_connections"),
        namespace: z.string().min(1),
        set: z.string().optional(),
        primaryKey: z.string().min(1).describe("record primary key"),
        bins: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .describe("bin name → value (string/number/boolean)"),
        ttl: z.number().int().optional().describe("seconds; omit for default"),
      }),
      render: hitlRender((args) => {
        const connId = String(args.connId ?? "").trim()
        const namespace = String(args.namespace ?? "").trim()
        const set = args.set ? String(args.set).trim() : undefined
        const primaryKey = String(args.primaryKey ?? "").trim()
        const bins = (args.bins ?? {}) as RecordWriteRequest["bins"]
        const ttl = args.ttl as number | undefined
        const body: RecordWriteRequest = {
          key: { namespace, set, pk: primaryKey },
          bins,
          ttl: ttl ?? null,
        }
        return {
          title: "Write record?",
          approveLabel: "Approve & write",
          rows: [
            { label: "connection", value: connId },
            { label: "ns / set", value: `${namespace}${set ? `/${set}` : ""}` },
            { label: "pk", value: primaryKey },
            { label: "bins", value: JSON.stringify(bins) },
          ],
          run: async () => {
            await putRecord(connId, body)
            return {
              status: "ok",
              message: `Wrote record pk="${primaryKey}" to ${namespace}${set ? `/${set}` : ""}.`,
            }
          },
        }
      }),
    },
    [],
  )

  // ── Data plane: delete record ────────────────────────────────────────────
  useHumanInTheLoop(
    {
      name: "delete_record",
      description:
        "Delete a single record by (namespace, set, primary key) — " +
        "destructive. Use a connection id from list_connections. " +
        "Requires approval.",
      parameters: z.object({
        connId: z
          .string()
          .min(1)
          .describe("connection id from list_connections"),
        namespace: z.string().min(1),
        set: z.string().min(1),
        primaryKey: z.string().min(1).describe("record primary key"),
      }),
      render: hitlRender((args) => {
        const connId = String(args.connId ?? "").trim()
        const namespace = String(args.namespace ?? "").trim()
        const set = String(args.set ?? "").trim()
        const primaryKey = String(args.primaryKey ?? "").trim()
        return {
          title: "Delete record?",
          approveLabel: "Approve & delete",
          destructive: true,
          rows: [
            { label: "connection", value: connId },
            { label: "ns / set", value: `${namespace}/${set}` },
            { label: "pk", value: primaryKey },
          ],
          run: async () => {
            await deleteRecord(connId, { ns: namespace, set, pk: primaryKey })
            return {
              status: "ok",
              message: `Deleted record pk="${primaryKey}".`,
            }
          },
        }
      }),
    },
    [],
  )

  return null
}
