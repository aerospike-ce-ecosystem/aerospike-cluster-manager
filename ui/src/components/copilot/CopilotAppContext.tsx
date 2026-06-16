"use client"

/**
 * Shares app state with the copilot on every run: the user's current location,
 * the selected connection, AND the full list of connection profiles + ACKO
 * clusters. Giving the model the ids/names up front lets it call a
 * confirmation-gated tool directly (by id or name) instead of first calling
 * list_connections / list_acko_clusters — chaining a read into a
 * confirmation-gated tool can abort the run in the CopilotKit runtime, and
 * forces the model to guess connection names ("localhost") when it can't list.
 */

import { useAgentContext } from "@copilotkit/react-core/v2"
import { usePathname } from "next/navigation"
import * as React from "react"

import { useConnectionStore } from "@/stores/connection-store"
import { useK8sClusterStore } from "@/stores/k8s-cluster-store"

export function CopilotAppContext() {
  const pathname = usePathname()
  const currentConnId = useConnectionStore((state) => state.currentConnId)
  const connections = useConnectionStore((state) => state.connections)
  const clusters = useK8sClusterStore((state) => state.clusters)
  const fetchClusters = useK8sClusterStore((state) => state.fetchClusters)
  const current = connections.find((conn) => conn.id === currentConnId)

  // Ensure the agent always has the ACKO cluster list in context, even on
  // pages that never load it. Best-effort — the store swallows errors (e.g.
  // when K8s management is disabled), leaving the list empty.
  React.useEffect(() => {
    void fetchClusters()
  }, [fetchClusters])

  useAgentContext({
    description:
      "The user's current location in the Aerospike Cluster Manager UI, the " +
      "selected connection, and the available connection profiles and " +
      "ACKO-managed clusters. Use these ids/names to call tools directly — " +
      "do not call list_connections or list_acko_clusters first.",
    value: {
      route: pathname,
      selectedConnectionId: currentConnId,
      selectedConnectionName: current?.name ?? null,
      // Resolve a named connection (including an ACKO cluster's auto-created
      // "[K8s] <name>" profile) without calling list_connections.
      connections: connections.map((conn) => ({
        id: conn.id,
        name: conn.name,
        clusterName: conn.clusterName ?? null,
      })),
      // Resolve a cluster's k8s namespace/name for scale/delete without
      // calling list_acko_clusters.
      ackoClusters: clusters.map((cluster) => ({
        namespace: cluster.namespace,
        name: cluster.name,
        phase: cluster.phase,
      })),
    },
  })

  return null
}
