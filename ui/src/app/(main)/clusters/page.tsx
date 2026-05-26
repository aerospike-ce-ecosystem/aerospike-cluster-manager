"use client"

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
import { bumpConnectionsRev } from "@/stores/data-revision-store"
import { useUiStore } from "@/stores/ui-store"
import { Button } from "@/components/Button"
import { PageHead } from "@/components/PageHead"
import { RiAlertLine } from "@remixicon/react"
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
    // Bump the connections revision so every other ``useConnections``
    // subscriber (sidebar, dropdowns, …) refreshes too. Without this the
    // sidebar shows stale data after add/edit even though this page itself
    // refetches.
    bumpConnectionsRev()
    conn.refetch()
  }

  return (
    <main className="flex flex-col gap-6">
      <PageHead
        title="Clusters"
        sub="Connection profiles and ACKO-managed Aerospike CE clusters."
      >
        <Button variant="secondary" onClick={() => setAddConnOpen(true)}>
          Add Connection
        </Button>
        <Link href="/clusters/new" className="btn btn-primary">
          Create Cluster
        </Link>
      </PageHead>

      {combinedError && (
        <div className="ace-announce tone-warning" role="status">
          <span className="ico">
            <RiAlertLine className="size-4" aria-hidden="true" />
          </span>
          <div className="body">
            <div className="title">Failed to load clusters</div>
            <div className="desc">{combinedError.message}</div>
          </div>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <ClustersSkeleton />
      ) : rows.length === 0 ? (
        <ClustersEmptyState onAddConnection={() => setAddConnOpen(true)} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-on-surface-muted">
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
