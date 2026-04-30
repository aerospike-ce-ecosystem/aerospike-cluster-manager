"use client"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Tooltip } from "@/components/Tooltip"
import { AddressCopyCell } from "@/components/clusters/AddressCopyCell"
import { LabelsCell } from "@/components/clusters/LabelsCell"
import { ENV_LABEL_KEY } from "@/components/clusters/labels"
import { phaseTone } from "@/components/clusters/PhaseBadge"
import type { ClusterRow } from "@/components/clusters/clusterRows"
import { clusterSections } from "@/app/siteConfig"
import { cx, focusRing } from "@/lib/utils"
import type { ConnectionProfileResponse } from "@/lib/types/connection"
import Link from "next/link"

export function ClusterCard({
  row,
  onEdit,
}: {
  row: ClusterRow
  onEdit: (conn: ConnectionProfileResponse) => void
}) {
  const status = phaseTone(row.phase)
  const hasCustomLabels =
    Object.keys(row.labels).filter((k) => k !== ENV_LABEL_KEY).length > 0

  const cardInner = (
    <Card
      className={cx(
        "flex h-full flex-col gap-3 transition",
        row.connId &&
          "hover:border-indigo-300 hover:shadow-sm dark:hover:border-indigo-700",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1 h-6 w-1 shrink-0 rounded-sm"
          style={{ background: row.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${status.dot}`}
              aria-hidden="true"
            />
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">
              {status.label}
            </span>
            {row.managedBy === "ACKO" && (
              <span className="text-xs font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                · ACKO
              </span>
            )}
          </div>
          <h3 className="mt-2 truncate font-mono text-base font-semibold text-gray-900 dark:text-gray-50">
            {row.displayName}
          </h3>
          {row.description && (
            <Tooltip
              content={
                <div className="max-w-md whitespace-pre-wrap break-words text-xs">
                  {row.description}
                </div>
              }
              side="top"
              triggerAsChild
              className="max-w-md"
            >
              <p className="mt-1 cursor-help truncate text-xs text-gray-500 dark:text-gray-500">
                {row.description}
              </p>
            </Tooltip>
          )}
        </div>
      </div>

      {row.profile && hasCustomLabels && (
        <LabelsCell labels={row.labels} hideEnv />
      )}

      <AddressCopyCell
        hosts={row.hosts}
        port={row.port}
        fallback={row.k8sNamespace ?? "—"}
        className="text-xs"
      />

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
        <span className="text-xs text-gray-500 dark:text-gray-500">
          {row.managedBy === "ACKO" ? "ACKO" : "Manual"}
        </span>
        {row.profile ? (
          <Button
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onEdit(row.profile!)
            }}
          >
            Edit
          </Button>
        ) : (
          <Badge variant="warning">not linked</Badge>
        )}
      </div>
    </Card>
  )

  if (row.connId) {
    return (
      <Link
        href={clusterSections.overview(row.connId)}
        className={cx("block focus-visible:outline-none", focusRing)}
      >
        {cardInner}
      </Link>
    )
  }
  return cardInner
}
