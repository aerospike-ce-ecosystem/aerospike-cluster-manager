"use client"

/**
 * Generative UI for copilot tool calls.
 *
 * Fixed renderers per read tool (the domain has a handful of known result
 * shapes — no A2UI). Each card reuses the existing Tremor Raw primitives and
 * deep-links into the first-class UI instead of replicating it.
 */

import { useDefaultRenderTool, useRenderTool } from "@copilotkit/react-core/v2"
import Link from "next/link"
import { z } from "zod"

import { Badge } from "@/components/Badge"
import type { ClusterInfo } from "@/lib/types/cluster"
import type { ConnectionStatus } from "@/lib/types/connection"
import type { AerospikeRecord } from "@/lib/types/record"

import { isToolError, type ToolError } from "./tool-error"

const connIdParams = z.object({ connId: z.string() })

function parseResult<T>(result: string): T | null {
  try {
    return JSON.parse(result) as T
  } catch {
    return null
  }
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-2 w-full rounded-lg border border-gray-200 bg-white p-3 text-left text-sm shadow-sm dark:border-gray-900 dark:bg-[#090E1A]">
      {children}
    </div>
  )
}

function PendingCard({ label }: { label: string }) {
  return (
    <CardShell>
      <span className="text-on-surface-variant animate-pulse">{label}…</span>
    </CardShell>
  )
}

function ErrorCard({ error }: { error: string }) {
  return (
    <CardShell>
      <Badge variant="error">error</Badge>
      <span className="ml-2 break-all">{error}</span>
    </CardShell>
  )
}

function ClusterHealthCard({ status }: { status: ConnectionStatus }) {
  return (
    <CardShell>
      <div className="flex items-center gap-2">
        <Badge variant={status.connected ? "success" : "error"}>
          {status.connected ? "connected" : "disconnected"}
        </Badge>
        {status.edition ? (
          <Badge variant="neutral">{status.edition}</Badge>
        ) : null}
        {status.build ? <Badge variant="neutral">{status.build}</Badge> : null}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <dt className="text-on-surface-variant">nodes</dt>
        <dd className="font-semibold">{status.nodeCount}</dd>
        <dt className="text-on-surface-variant">namespaces</dt>
        <dd className="font-semibold">{status.namespaceCount}</dd>
      </dl>
      {status.error ? (
        <p className="mt-2 break-all text-red-600 dark:text-red-400">
          {status.error}
        </p>
      ) : null}
    </CardShell>
  )
}

function ClusterInfoCard({
  info,
  connId,
}: {
  info: ClusterInfo
  connId: string
}) {
  return (
    <CardShell>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{info.nodes.length} nodes</span>
        <span className="text-on-surface-variant">·</span>
        <span className="font-semibold">
          {info.namespaces.length} namespaces
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {info.namespaces.map((ns) => (
          <li key={ns.name} className="flex flex-wrap items-center gap-1.5">
            <Badge variant="default">{ns.name}</Badge>
            <span className="text-on-surface-variant">
              {ns.objects.toLocaleString()} objects · RF {ns.replicationFactor}
            </span>
            {ns.stopWrites ? <Badge variant="error">stop-writes</Badge> : null}
            {ns.sets.slice(0, 6).map((set) => (
              <Badge key={set.name} variant="neutral">
                {set.name}
              </Badge>
            ))}
            {ns.sets.length > 6 ? (
              <span className="text-on-surface-variant">
                +{ns.sets.length - 6} sets
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <Link
        href={`/clusters/${encodeURIComponent(connId)}`}
        className="text-primary-40 mt-2 inline-block hover:underline"
      >
        Open cluster page →
      </Link>
    </CardShell>
  )
}

function RecordsMiniTable({
  records,
  footer,
}: {
  records: AerospikeRecord[]
  footer?: string
}) {
  if (records.length === 0) {
    return (
      <CardShell>
        <span className="text-on-surface-variant">no records</span>
      </CardShell>
    )
  }
  const binNames = Array.from(
    new Set(records.flatMap((record) => Object.keys(record.bins))),
  ).slice(0, 5)
  return (
    <CardShell>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-left dark:border-gray-800">
              <th className="py-1 pr-3 font-semibold">pk</th>
              {binNames.map((bin) => (
                <th key={bin} className="py-1 pr-3 font-semibold">
                  {bin}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record, idx) => (
              <tr
                key={`${String(record.key.pk ?? record.key.digest ?? idx)}`}
                className="border-b border-gray-100 last:border-0 dark:border-gray-900"
              >
                <td className="max-w-40 truncate py-1 pr-3">
                  {String(record.key.pk ?? record.key.digest ?? "—")}
                </td>
                {binNames.map((bin) => (
                  <td key={bin} className="max-w-48 truncate py-1 pr-3">
                    {record.bins[bin] === undefined
                      ? "—"
                      : typeof record.bins[bin] === "object"
                        ? JSON.stringify(record.bins[bin])
                        : String(record.bins[bin])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer ? (
        <p className="text-on-surface-variant mt-1 text-xs">{footer}</p>
      ) : null}
    </CardShell>
  )
}

export function CopilotRenderTools() {
  useRenderTool(
    {
      name: "get_connection_health",
      parameters: connIdParams,
      render: ({ status, result }) => {
        if (status !== "complete")
          return <PendingCard label="checking health" />
        const parsed = parseResult<ConnectionStatus | ToolError>(result)
        if (!parsed) return <></>
        if (isToolError(parsed)) return <ErrorCard error={parsed.error} />
        return <ClusterHealthCard status={parsed} />
      },
    },
    [],
  )

  useRenderTool(
    {
      name: "get_cluster_info",
      parameters: connIdParams,
      render: ({ status, parameters, result }) => {
        if (status !== "complete") {
          return <PendingCard label="loading cluster topology" />
        }
        const parsed = parseResult<ClusterInfo | ToolError>(result)
        if (!parsed) return <></>
        if (isToolError(parsed)) return <ErrorCard error={parsed.error} />
        return <ClusterInfoCard info={parsed} connId={parameters.connId} />
      },
    },
    [],
  )

  useRenderTool(
    {
      name: "browse_records",
      parameters: z.object({
        connId: z.string(),
        namespace: z.string(),
        set: z.string().optional(),
      }),
      render: ({ status, parameters, result }) => {
        if (status !== "complete")
          return <PendingCard label="browsing records" />
        const parsed = parseResult<
          { records: AerospikeRecord[]; hasMore: boolean } | ToolError
        >(result)
        if (!parsed) return <></>
        if (isToolError(parsed)) return <ErrorCard error={parsed.error} />
        return (
          <RecordsMiniTable
            records={parsed.records}
            footer={
              parsed.hasMore
                ? `truncated — open the Record Browser for ${parameters.namespace}` +
                  (parameters.set ? `/${parameters.set}` : "")
                : undefined
            }
          />
        )
      },
    },
    [],
  )

  useRenderTool(
    {
      name: "run_query",
      parameters: z.object({ connId: z.string(), namespace: z.string() }),
      render: ({ status, result }) => {
        if (status !== "complete") return <PendingCard label="running query" />
        const parsed = parseResult<
          | {
              records: AerospikeRecord[]
              executionTimeMs: number
              returnedRecords: number
              truncatedRows: number
            }
          | ToolError
        >(result)
        if (!parsed) return <></>
        if (isToolError(parsed)) return <ErrorCard error={parsed.error} />
        return (
          <RecordsMiniTable
            records={parsed.records}
            footer={`${parsed.returnedRecords} records in ${parsed.executionTimeMs}ms${
              parsed.truncatedRows > 0
                ? ` (${parsed.truncatedRows} more truncated)`
                : ""
            }`}
          />
        )
      },
    },
    [],
  )

  // Anything without a dedicated card (list_connections, metrics, indexes,
  // CE constraints) renders as a compact status line instead of raw JSON.
  useDefaultRenderTool(
    {
      render: ({ name, status }) => (
        <p className="text-on-surface-variant my-1 text-xs">
          {status === "complete" ? "✓" : "⏳"} {name}
        </p>
      ),
    },
    [],
  )

  return null
}
