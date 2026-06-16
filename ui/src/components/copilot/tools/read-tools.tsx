"use client"

/**
 * Read-only copilot tools.
 *
 * Every handler is a browser-originated call through the existing lib/api
 * wrappers, so it carries the user's Keycloak JWT, inherits the 401→refresh→
 * retry logic and multi-cluster base-URL resolution, and is authorized by
 * FastAPI exactly like a human click. No tool mutates anything.
 *
 * Handlers never throw: a thrown error kills the agent run, so failures are
 * returned as { error, status, retryable } objects the model can explain.
 */

import { useFrontendTool } from "@copilotkit/react-core/v2"
import { z } from "zod"

import { getCluster } from "@/lib/api/clusters"
import { ApiError } from "@/lib/api/client"
import { getConnectionHealth, listConnections } from "@/lib/api/connections"
import { listIndexes } from "@/lib/api/indexes"
import { getK8sCluster, listK8sClusters } from "@/lib/api/k8s"
import { getClusterMetrics } from "@/lib/api/metrics"
import { runQuery } from "@/lib/api/query"
import { listRecords } from "@/lib/api/records"
import { CE_CONSTRAINTS } from "@/lib/copilot/ce-constraints"

import { clampLimit, clampRecords, MAX_RESULT_ROWS } from "./clamp"
import { isToolError, type ToolError } from "./tool-error"

async function safeCall<T>(call: () => Promise<T>): Promise<T | ToolError> {
  try {
    return await call()
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        error: err.detail,
        status: err.status,
        retryable: err.status >= 500,
      }
    }
    return { error: String(err), retryable: true }
  }
}

const connIdSchema = z
  .string()
  .min(1)
  .describe("Connection id from list_connections")

export function CopilotReadTools() {
  useFrontendTool(
    {
      name: "list_connections",
      description:
        "List the saved Aerospike connection profiles with their ids, " +
        "names and seed hosts. Call this first to discover connection ids.",
      parameters: z.object({}),
      handler: () => safeCall(() => listConnections()),
    },
    [],
  )

  useFrontendTool(
    {
      name: "get_connection_health",
      description:
        "Health of one connection: connected flag, node/namespace counts, " +
        "build, edition, memory and disk usage.",
      parameters: z.object({ connId: connIdSchema }),
      handler: ({ connId }) => safeCall(() => getConnectionHealth(connId)),
    },
    [],
  )

  useFrontendTool(
    {
      name: "get_cluster_info",
      description:
        "Cluster topology for a connection: nodes (build, uptime, client " +
        "connections) and namespaces with their sets and usage.",
      parameters: z.object({ connId: connIdSchema }),
      handler: ({ connId }) => safeCall(() => getCluster(connId)),
    },
    [],
  )

  useFrontendTool(
    {
      name: "get_cluster_metrics",
      description:
        "Current cluster metrics for a connection: read/write TPS, " +
        "client connections, per-namespace memory/device usage.",
      parameters: z.object({ connId: connIdSchema }),
      handler: async ({ connId }) => {
        const result = await safeCall(() => getClusterMetrics(connId))
        if (isToolError(result)) return result
        // Time-series arrays are chart fodder — strip them from LLM context.
        const {
          readTps,
          writeTps,
          connectionHistory,
          memoryUsageByNs,
          deviceUsageByNs,
          ...summary
        } = result as Awaited<ReturnType<typeof getClusterMetrics>>
        return summary
      },
    },
    [],
  )

  useFrontendTool(
    {
      name: "list_indexes",
      description: "List secondary indexes defined on a connection.",
      parameters: z.object({ connId: connIdSchema }),
      handler: ({ connId }) => safeCall(() => listIndexes(connId)),
    },
    [],
  )

  useFrontendTool(
    {
      name: "browse_records",
      description:
        `Browse up to ${MAX_RESULT_ROWS} records of a set. ` +
        "Results are truncated — link the user to the Record Browser for more.",
      parameters: z.object({
        connId: connIdSchema,
        namespace: z.string().min(1),
        set: z.string().min(1).optional(),
        pageSize: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(`max ${MAX_RESULT_ROWS}`),
      }),
      handler: async ({ connId, namespace, set, pageSize }) => {
        const result = await safeCall(() =>
          listRecords(connId, {
            ns: namespace,
            set,
            pageSize: clampLimit(pageSize),
          }),
        )
        if (isToolError(result)) return result
        const page = result as Awaited<ReturnType<typeof listRecords>>
        const clamped = clampRecords(page.records)
        return {
          records: clamped.records,
          total: page.total,
          totalEstimated: page.totalEstimated,
          hasMore: page.hasMore || clamped.truncatedRows > 0,
          truncatedBins: clamped.truncatedBins,
        }
      },
    },
    [],
  )

  useFrontendTool(
    {
      name: "run_query",
      description:
        "Run a read-only query against a namespace/set: full scan, " +
        "primary-key lookup, or bin predicate (eq/lt/gt/between/...). " +
        `Returns at most ${MAX_RESULT_ROWS} records.`,
      parameters: z.object({
        connId: connIdSchema,
        namespace: z.string().min(1),
        set: z.string().min(1).optional(),
        primaryKey: z
          .string()
          .optional()
          .describe("exact PK lookup; leave empty for scans"),
        // geo_within_region / geo_contains_point are intentionally omitted
        // from QueryPredicateOperator here: geo predicates need GeoJSON
        // payloads that don't fit a chat-tool schema. Use the Query Builder
        // page for geo queries.
        predicate: z
          .object({
            bin: z.string().min(1),
            operator: z
              .enum(["equals", "between", "contains"])
              .describe("between requires a numeric value and value2"),
            value: z.union([z.string(), z.number()]),
            value2: z.number().optional().describe("upper bound for between"),
          })
          .optional(),
        maxRecords: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(`max ${MAX_RESULT_ROWS}`),
      }),
      handler: async ({
        connId,
        namespace,
        set,
        primaryKey,
        predicate,
        maxRecords,
      }) => {
        const result = await safeCall(() =>
          runQuery(connId, {
            namespace,
            set: set ?? null,
            primaryKey: primaryKey ?? null,
            predicate: predicate ?? null,
            maxRecords: clampLimit(maxRecords),
          }),
        )
        if (isToolError(result)) return result
        const response = result as Awaited<ReturnType<typeof runQuery>>
        const clamped = clampRecords(response.records)
        return {
          records: clamped.records,
          executionTimeMs: response.executionTimeMs,
          scannedRecords: response.scannedRecords,
          returnedRecords: response.returnedRecords,
          truncatedRows: clamped.truncatedRows,
          truncatedBins: clamped.truncatedBins,
        }
      },
    },
    [],
  )

  useFrontendTool(
    {
      name: "get_ce_constraints",
      description:
        "The hard limits of Aerospike Community Edition (max nodes, max " +
        "namespaces, unavailable enterprise features). Check before " +
        "suggesting any cluster topology or configuration change.",
      parameters: z.object({}),
      handler: async () => CE_CONSTRAINTS,
    },
    [],
  )

  useFrontendTool(
    {
      name: "list_acko_clusters",
      description:
        "List ACKO-managed AerospikeCluster CRs on Kubernetes (control " +
        "plane): namespace, name, size, image, phase. Call this before " +
        "scale_acko_cluster or delete_acko_cluster to get the namespace/name.",
      parameters: z.object({
        namespace: z
          .string()
          .optional()
          .describe("filter to one Kubernetes namespace; omit for all"),
      }),
      handler: ({ namespace }) =>
        safeCall(async () => {
          const res = await listK8sClusters(namespace ? { namespace } : {})
          return res.items.map((c) => ({
            namespace: c.namespace,
            name: c.name,
            size: c.size,
            image: c.image,
            phase: c.phase,
          }))
        }),
    },
    [],
  )

  useFrontendTool(
    {
      name: "get_acko_cluster",
      description:
        "Get one ACKO AerospikeCluster CR's detail (spec + status + pods) " +
        "by Kubernetes namespace and name.",
      parameters: z.object({
        namespace: z.string().min(1),
        name: z.string().min(1),
      }),
      handler: ({ namespace, name }) =>
        safeCall(() => getK8sCluster(namespace, name)),
    },
    [],
  )

  return null
}
