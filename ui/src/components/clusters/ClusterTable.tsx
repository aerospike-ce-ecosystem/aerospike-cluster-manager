"use client"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from "@/components/Table"
import { Tooltip } from "@/components/Tooltip"
import { AddressCopyCell } from "@/components/clusters/AddressCopyCell"
import { LabelsCell } from "@/components/clusters/LabelsCell"
import { NameLink } from "@/components/clusters/NameLink"
import { PhaseDot } from "@/components/clusters/PhaseBadge"
import type { ClusterRow } from "@/components/clusters/clusterRows"
import { cx, hexToRgba } from "@/lib/utils"
import type { ConnectionProfileResponse } from "@/lib/types/connection"

const SECONDARY_HEADER =
  "text-[10px] font-medium uppercase tracking-[0.18em] text-gray-400 dark:text-gray-600"

function nameCellStyle(color: string): React.CSSProperties {
  const tint = hexToRgba(color, 0.1)
  if (!tint) return {}
  return {
    backgroundColor: tint,
    boxShadow: `inset 3px 0 0 ${color}`,
  }
}

export function ClusterTable({
  rows,
  onEdit,
}: {
  rows: ClusterRow[]
  onEdit: (conn: ConnectionProfileResponse) => void
}) {
  return (
    <Card className="p-0">
      <TableRoot>
        <Table className="table-fixed">
          <colgroup>
            <col className="w-12" />
            <col className="w-[220px]" />
            <col className="w-[280px]" />
            <col className="w-[260px]" />
            <col className="w-[220px]" />
            <col className="w-24" />
            <col className="w-20" />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableHeaderCell className={cx("px-3", SECONDARY_HEADER)}>
                <span className="sr-only">Status</span>
                <span aria-hidden="true">●</span>
              </TableHeaderCell>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Description</TableHeaderCell>
              <TableHeaderCell>Labels</TableHeaderCell>
              <TableHeaderCell>Address</TableHeaderCell>
              <TableHeaderCell className={SECONDARY_HEADER}>
                Managed
              </TableHeaderCell>
              <TableHeaderCell className="text-right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.key}
                className="transition hover:bg-gray-50 dark:hover:bg-gray-900/40"
              >
                <TableCell className="w-10 px-3">
                  <PhaseDot phase={r.phase} />
                </TableCell>
                <TableCell style={nameCellStyle(r.color)}>
                  <NameLink row={r} />
                </TableCell>
                <TableCell className="max-w-[260px]">
                  {r.description ? (
                    <Tooltip
                      content={
                        <div className="max-w-md whitespace-pre-wrap break-words text-xs">
                          {r.description}
                        </div>
                      }
                      side="top"
                      triggerAsChild
                      className="max-w-md"
                    >
                      <span className="block cursor-help truncate text-gray-600 dark:text-gray-400">
                        {r.description}
                      </span>
                    </Tooltip>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-600">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.profile ? (
                    <LabelsCell labels={r.labels} />
                  ) : (
                    <span className="text-gray-400 dark:text-gray-600">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <AddressCopyCell
                    hosts={r.hosts}
                    port={r.port}
                    fallback={r.k8sNamespace ?? "—"}
                  />
                </TableCell>
                <TableCell className="w-24">
                  {r.managedBy === "ACKO" ? (
                    <Badge
                      variant="default"
                      className="text-[10px] uppercase tracking-wider"
                    >
                      ACKO
                    </Badge>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-gray-600">
                      manual
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {r.profile ? (
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => onEdit(r.profile!)}
                    >
                      Edit
                    </Button>
                  ) : (
                    <Badge variant="warning" className="text-[10px]">
                      not linked
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableRoot>
    </Card>
  )
}
