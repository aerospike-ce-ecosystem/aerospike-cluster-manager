"use client"

import { RiAlertLine } from "@remixicon/react"
import { useParams } from "next/navigation"

import { ClusterDetailLayout } from "@/components/k8s/ClusterDetailLayout"
import { EmptyState } from "@/components/common/EmptyState"
import { InlineAlert } from "@/components/common/InlineAlert"
import { useK8sClusters } from "@/hooks/use-k8s-clusters"

export default function ClusterAckoSubtabPage() {
  const params = useParams<{ clusterId: string }>()
  const clusterId = params?.clusterId ?? ""
  const { data, error, isLoading } = useK8sClusters()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-60 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
        <div className="h-80 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-900" />
      </div>
    )
  }

  if (error) {
    return <InlineAlert message={error.message} />
  }

  const match = data?.items.find((c) => c.connectionId === clusterId)

  if (!match) {
    return (
      <EmptyState
        icon={RiAlertLine}
        title="This cluster is not ACKO-managed"
        description="Connect this profile to an AerospikeCluster CR, or open the cluster via the ACKO list to see ACKO-specific controls."
      />
    )
  }

  return (
    <ClusterDetailLayout
      namespace={match.namespace}
      name={match.name}
      hideBackButton
    />
  )
}
