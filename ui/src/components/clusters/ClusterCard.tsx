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

  // To keep the whole card clickable while still allowing nested interactive
  // elements, we render the navigation as an absolutely-positioned anchor
  // (`relative` card + `absolute inset-0` link). The link paints above static
  // content (positioned z-0 beats in-flow text in hit-testing), so clicks on
  // the name/status/body navigate; only genuinely interactive children (Edit
  // button, copy cell, note tooltip, labels) opt out with `relative z-10`.
  // This avoids the invalid `<a><button></a>` nesting that the previous
  // implementation produced.
  return (
    <Card
      className={cx(
        "relative flex h-full flex-col gap-3 transition",
        row.connId &&
          "hover:border-primary-80 dark:hover:border-primary-40 hover:shadow-sm",
      )}
    >
      {row.connId && (
        <Link
          href={clusterSections.overview(row.connId)}
          aria-label={`Open ${row.displayName}`}
          className={cx(
            "absolute inset-0 z-0 rounded-md focus-visible:outline-hidden",
            focusRing,
          )}
        />
      )}
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
            <span className="text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-500">
              {status.label}
            </span>
            {row.managedBy === "ACKO" && (
              <span className="text-primary-40 dark:text-primary-65 text-xs font-medium tracking-wider uppercase">
                · ACKO
              </span>
            )}
          </div>
          <h3
            title={row.displayName}
            className="mt-2 truncate font-mono text-base font-semibold text-gray-900 dark:text-gray-50"
          >
            {row.displayName}
          </h3>
          {row.note && (
            <Tooltip
              content={
                <div className="max-w-md text-xs wrap-break-word whitespace-pre-wrap">
                  {row.note}
                </div>
              }
              side="top"
              triggerAsChild
              className="max-w-md"
            >
              <p className="relative z-10 mt-1 cursor-help truncate text-xs text-gray-500 dark:text-gray-500">
                {row.note}
              </p>
            </Tooltip>
          )}
        </div>
      </div>

      {row.profile && hasCustomLabels && (
        <div className="relative z-10">
          <LabelsCell labels={row.labels} hideEnv />
        </div>
      )}

      <div className="relative z-10">
        <AddressCopyCell
          hosts={row.hosts}
          port={row.port}
          fallback={row.k8sNamespace ?? "—"}
          className="text-xs"
        />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
        <span className="text-xs text-gray-500 dark:text-gray-500">
          {row.managedBy === "ACKO" ? "ACKO" : "Manual"}
        </span>
        {row.profile ? (
          <Button
            variant="ghost"
            className="relative z-10 h-7 px-2 text-xs"
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
}
