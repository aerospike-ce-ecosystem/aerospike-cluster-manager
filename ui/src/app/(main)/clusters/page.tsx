"use client"

import { Button } from "@/components/Button"
import { ClustersEmptyState } from "@/components/clusters/ClustersEmptyState"
import { ClustersSkeleton } from "@/components/clusters/ClustersSkeleton"
import { EnvSection } from "@/components/clusters/EnvSection"
import { ViewToggle } from "@/components/clusters/ViewToggle"
import { groupByEnv, mergeRows } from "@/components/clusters/clusterRows"
import { AddConnectionDialog } from "@/components/dialogs/AddConnectionDialog"
import { EditConnectionDialog } from "@/components/dialogs/EditConnectionDialog"
import { useConnections } from "@/hooks/use-connections"
import { useK8sClusters } from "@/hooks/use-k8s-clusters"
import type { ConnectionProfileResponse } from "@/lib/types/connection"
import { useUiStore } from "@/stores/ui-store"
import Link from "next/link"
import { useMemo, useState } from "react"

export default function ClustersPage() {
  const conn = useConnections()
  const k8s = useK8sClusters()

  const [addConnOpen, setAddConnOpen] = useState(false)
  const [editTarget, setEditTarget] =
    useState<ConnectionProfileResponse | null>(null)
  const view = useUiStore((s) => s.clustersView)
  const setView = useUiStore((s) => s.setClustersView)
  const currentWorkspaceId = useUiStore((s) => s.currentWorkspaceId)

  const filteredConnections = useMemo(
    () =>
      conn.data?.filter((c) => c.workspaceId === currentWorkspaceId) ?? null,
    [conn.data, currentWorkspaceId],
  )

  const rows = useMemo(
    () => mergeRows(filteredConnections, k8s.data?.items ?? null),
    [filteredConnections, k8s.data],
  )
  const groups = useMemo(() => groupByEnv(rows), [rows])

  const loading = conn.isLoading || k8s.isLoading
  const combinedError = conn.error ?? k8s.error

  const handleConnectionUpserted = () => {
    conn.refetch()
  }

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
            Clusters
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            Connection profiles and ACKO-managed Aerospike CE clusters.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setAddConnOpen(true)}>
            Add Connection
          </Button>
          <Button variant="primary" asChild>
            <Link href="/clusters/new">Create Cluster</Link>
          </Button>
        </div>
      </header>

      {combinedError && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {combinedError.message}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <ClustersSkeleton />
      ) : rows.length === 0 ? (
        <ClustersEmptyState onAddConnection={() => setAddConnOpen(true)} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-500">
              {rows.length} {rows.length === 1 ? "cluster" : "clusters"} ·{" "}
              {groups.length} env group{groups.length === 1 ? "" : "s"}
            </p>
            <ViewToggle value={view} onChange={setView} />
          </div>
          <div className="flex flex-col gap-8">
            {groups.map((group) => (
              <EnvSection
                key={group.env}
                env={group.env}
                rows={group.rows}
                view={view}
                onEdit={setEditTarget}
              />
            ))}
          </div>
        </>
      )}

      <AddConnectionDialog
        open={addConnOpen}
        onOpenChange={setAddConnOpen}
        onSuccess={handleConnectionUpserted}
      />
      <EditConnectionDialog
        open={editTarget !== null}
        connection={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        onSuccess={handleConnectionUpserted}
      />
    </main>
  )
}
