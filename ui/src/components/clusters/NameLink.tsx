"use client"

import { clusterSections } from "@/app/siteConfig"
import type { ClusterRow } from "@/components/clusters/clusterRows"
import { cx, focusRing } from "@/lib/utils"
import Link from "next/link"

/**
 * Cluster name rendered as a navigation link to the overview page.
 * For unlinked ACKO rows (no connection profile) renders a non-clickable
 * muted span instead.
 */
export function NameLink({ row }: { row: ClusterRow }) {
  if (row.connId) {
    return (
      <Link
        href={clusterSections.overview(row.connId)}
        className={cx(
          "block truncate font-mono font-medium text-gray-900 transition hover:text-indigo-700 dark:text-gray-50 dark:hover:text-indigo-300",
          focusRing,
        )}
      >
        {row.displayName}
      </Link>
    )
  }
  return (
    <span className="block truncate font-mono font-medium text-gray-500 dark:text-gray-500">
      {row.displayName}
    </span>
  )
}
