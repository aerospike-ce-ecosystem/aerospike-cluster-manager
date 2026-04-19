"use client"

import { RiAddLine, RiRefreshLine, RiStackLine } from "@remixicon/react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { ackoSections } from "@/app/siteConfig"
import { Button } from "@/components/Button"
import { EmptyState } from "@/components/common/EmptyState"
import { InlineAlert } from "@/components/common/InlineAlert"
import { PageHeader } from "@/components/common/PageHeader"
import { K8sClusterCard } from "@/components/k8s/K8sClusterCard"
import { TRANSITIONAL_PHASES } from "@/components/k8s/K8sClusterStatusBadge"
import { useK8sClusters } from "@/hooks/use-k8s-clusters"

export default function AckoClustersPage() {
  const { data, error, isLoading, refetch } = useK8sClusters()
  const [polling, setPolling] = useState(false)

  // Auto-refresh when any cluster is in a transitional phase.
  const hasTransitional = (data?.items ?? []).some((c) =>
    (TRANSITIONAL_PHASES as string[]).includes(c.phase),
  )

  const refreshSilently = useCallback(async () => {
    setPolling(true)
    try {
      await refetch()
    } finally {
      setPolling(false)
    }
  }, [refetch])

  useEffect(() => {
    if (!hasTransitional) return
    const id = setInterval(() => {
      void refreshSilently()
    }, 5000)
    return () => clearInterval(id)
  }, [hasTransitional, refreshSilently])

  const items = data?.items ?? []

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="ACKO Clusters"
        description="AerospikeCluster CRs managed by the Aerospike Kubernetes Operator."
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => void refetch()}
              isLoading={isLoading || polling}
              className="gap-1"
            >
              <RiRefreshLine aria-hidden="true" className="size-4" />
              Refresh
            </Button>
            <Button variant="primary" asChild className="gap-1">
              <Link href={ackoSections.new()}>
                <RiAddLine aria-hidden="true" className="size-4" />
                Create cluster
              </Link>
            </Button>
          </div>
        }
      />

      <InlineAlert message={error ? error.message : null} variant="error" />

      {isLoading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={RiStackLine}
          title="No AerospikeClusters found"
          description="Create a new cluster to get started with ACKO-managed Aerospike."
          action={
            <Button variant="primary" asChild className="gap-1">
              <Link href={ackoSections.new()}>
                <RiAddLine aria-hidden="true" className="size-4" />
                Create cluster
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((cluster) => (
            <K8sClusterCard
              key={`${cluster.namespace}/${cluster.name}`}
              cluster={cluster}
            />
          ))}
        </div>
      )}
    </main>
  )
}
