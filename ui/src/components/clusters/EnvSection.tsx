"use client"

import { ClusterCard } from "@/components/clusters/ClusterCard"
import { ClusterTable } from "@/components/clusters/ClusterTable"
import { EnvSectionHeader } from "@/components/clusters/EnvSectionHeader"
import type { ClusterRow } from "@/components/clusters/clusterRows"
import type { ConnectionProfileResponse } from "@/lib/types/connection"
import { type ClustersView } from "@/stores/ui-store"

export function EnvSection({
  env,
  rows,
  view,
  onEdit,
}: {
  env: string
  rows: ClusterRow[]
  view: ClustersView
  onEdit: (conn: ConnectionProfileResponse) => void
}) {
  return (
    <section className="flex flex-col gap-4">
      <EnvSectionHeader env={env} count={rows.length} />
      {view === "card" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <ClusterCard key={r.key} row={r} onEdit={onEdit} />
          ))}
        </div>
      ) : (
        <ClusterTable rows={rows} onEdit={onEdit} />
      )}
    </section>
  )
}
