"use client"

import {
  RiAlertLine,
  RiImage2Line,
  RiRefreshLine,
  RiServerLine,
  RiTimeLine,
} from "@remixicon/react"
import Link from "next/link"

import { Badge } from "@/components/Badge"
import { Card } from "@/components/Card"
import { ackoSections } from "@/app/siteConfig"
import { K8sClusterStatusBadge } from "@/components/k8s/K8sClusterStatusBadge"
import type { K8sClusterSummary } from "@/lib/types/k8s"

interface K8sClusterCardProps {
  cluster: K8sClusterSummary
}

export function K8sClusterCard({ cluster }: K8sClusterCardProps) {
  return (
    <Link
      href={ackoSections.detail(cluster.namespace, cluster.name)}
      className="block focus:outline-none"
    >
      <Card className="p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-gray-900 dark:text-gray-50">
              {cluster.name}
            </h3>
            <p className="mt-0.5 truncate font-mono text-xs text-gray-500 dark:text-gray-400">
              {cluster.namespace}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <K8sClusterStatusBadge phase={cluster.phase} />
            {(cluster.failedReconcileCount ?? 0) > 0 && (
              <Badge variant="error" className="gap-1">
                <RiAlertLine aria-hidden="true" className="size-3" />
                {cluster.failedReconcileCount}
              </Badge>
            )}
            {cluster.templateDrifted && (
              <Badge variant="warning" className="gap-1">
                <RiRefreshLine aria-hidden="true" className="size-3" />
                Drift
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Badge variant="neutral" className="gap-1">
            <RiServerLine aria-hidden="true" className="size-3" />
            {cluster.size} node{cluster.size !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="neutral" className="gap-1">
            <RiImage2Line aria-hidden="true" className="size-3" />
            <span className="max-w-[12rem] truncate">{cluster.image}</span>
          </Badge>
          {cluster.age && (
            <Badge variant="neutral" className="gap-1">
              <RiTimeLine aria-hidden="true" className="size-3" />
              {cluster.age}
            </Badge>
          )}
        </div>

        {cluster.autoConnectWarning && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            {cluster.autoConnectWarning}
          </p>
        )}
      </Card>
    </Link>
  )
}
