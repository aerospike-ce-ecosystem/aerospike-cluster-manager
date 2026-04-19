"use client"

import { Badge } from "@/components/Badge"
import { Checkbox } from "@/components/Checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from "@/components/Table"
import type { K8sPodStatus } from "@/lib/types/k8s"

interface K8sPodTableProps {
  pods: K8sPodStatus[]
  selectable?: boolean
  selectedPods?: string[]
  onSelectionChange?: (selected: string[]) => void
}

// FIXME(stream-c): port full <K8sPodTable> (migration column, readiness gate tooltip,
// volumes tooltip, last restart badge, logs action, mobile card layout) later — see
// frontend/src/components/k8s/k8s-pod-table.tsx (551 lines).

export function K8sPodTable({
  pods,
  selectable = false,
  selectedPods = [],
  onSelectionChange,
}: K8sPodTableProps) {
  const toggle = (name: string) => {
    if (!onSelectionChange) return
    onSelectionChange(
      selectedPods.includes(name)
        ? selectedPods.filter((n) => n !== name)
        : [...selectedPods, name],
    )
  }

  const allSelected = pods.length > 0 && selectedPods.length === pods.length
  const someSelected = selectedPods.length > 0 && !allSelected

  const toggleAll = () => {
    if (!onSelectionChange) return
    onSelectionChange(allSelected ? [] : pods.map((p) => p.name))
  }

  if (pods.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No pods running for this cluster yet.
      </p>
    )
  }

  return (
    <TableRoot>
      <Table>
        <TableHead>
          <TableRow>
            {selectable && (
              <TableHeaderCell className="w-10">
                <Checkbox
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  onCheckedChange={toggleAll}
                  aria-label="Select all pods"
                />
              </TableHeaderCell>
            )}
            <TableHeaderCell>Name</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Rack</TableHeaderCell>
            <TableHeaderCell>Node ID</TableHeaderCell>
            <TableHeaderCell>Pod IP</TableHeaderCell>
            <TableHeaderCell>Host IP</TableHeaderCell>
            <TableHeaderCell>Config</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pods.map((pod) => {
            const isSelected = selectedPods.includes(pod.name)
            return (
              <TableRow key={pod.name}>
                {selectable && (
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(pod.name)}
                      aria-label={`Select ${pod.name}`}
                    />
                  </TableCell>
                )}
                <TableCell className="font-mono text-xs">{pod.name}</TableCell>
                <TableCell>
                  <Badge variant={pod.isReady ? "success" : "warning"}>
                    {pod.isReady ? "Ready" : (pod.phase ?? "Unknown")}
                  </Badge>
                </TableCell>
                <TableCell>
                  {pod.rackId != null ? (
                    <Badge variant="neutral">{pod.rackId}</Badge>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {pod.nodeId ? (
                    <span className="font-mono text-xs" title={pod.nodeId}>
                      {pod.nodeId.slice(0, 8)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {pod.podIP ?? "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {pod.hostIP ?? "—"}
                </TableCell>
                <TableCell>
                  {pod.dynamicConfigStatus ? (
                    <Badge
                      variant={
                        pod.dynamicConfigStatus === "Applied"
                          ? "success"
                          : pod.dynamicConfigStatus === "Failed"
                            ? "error"
                            : "warning"
                      }
                    >
                      {pod.dynamicConfigStatus}
                    </Badge>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableRoot>
  )
}
