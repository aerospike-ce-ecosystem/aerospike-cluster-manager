"use client";

import { useState, useMemo, useCallback } from "react";
import { ColumnDef, RowSelectionState, OnChangeFn } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { STATUS_COLORS } from "@/lib/status-colors";
import { FileText, Database } from "lucide-react";
import { K8sPodLogsDialog } from "@/components/k8s/k8s-pod-logs-dialog";
import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import type { K8sPodStatus } from "@/lib/api/types";

interface K8sPodTableProps {
  pods: K8sPodStatus[];
  selectable?: boolean;
  selectedPods?: string[];
  onSelectionChange?: (selected: string[]) => void;
  namespace?: string;
  clusterName?: string;
}

export function K8sPodTable({
  pods,
  selectable = false,
  selectedPods = [],
  onSelectionChange,
  namespace,
  clusterName,
}: K8sPodTableProps) {
  const [logsPodName, setLogsPodName] = useState<string | null>(null);

  const rowSelection = useMemo(
    () => Object.fromEntries(selectedPods.map((name) => [name, true])),
    [selectedPods],
  );

  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = useCallback(
    (updater) => {
      if (!onSelectionChange) return;
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      onSelectionChange(Object.keys(next).filter((k) => next[k]));
    },
    [rowSelection, onSelectionChange],
  );

  const showActions = !!(namespace && clusterName);

  const columns = useMemo<ColumnDef<K8sPodStatus>[]>(() => {
    const cols: ColumnDef<K8sPodStatus>[] = [];

    if (selectable) {
      cols.push({
        id: "select",
        size: 40,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomeRowsSelected();
            }}
            onCheckedChange={(checked) => table.toggleAllRowsSelected(!!checked)}
            aria-label="Select all pods"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
            aria-label={`Select ${row.original.name}`}
          />
        ),
        meta: { className: "text-center" },
      });
    }

    cols.push(
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>,
      },
      {
        accessorKey: "isReady",
        header: "Status",
        size: 100,
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={cn(
              "text-[11px]",
              row.original.isReady ? STATUS_COLORS.success : STATUS_COLORS.warning,
            )}
          >
            {row.original.isReady ? "Ready" : row.original.phase}
          </Badge>
        ),
      },
      {
        accessorKey: "nodeId",
        header: "Node ID",
        size: 100,
        meta: { className: "hidden md:table-cell" },
        cell: ({ getValue }) => {
          const nodeId = getValue<string | undefined>();
          return nodeId ? (
            <span className="cursor-default font-mono text-xs" title={nodeId}>
              {nodeId.slice(0, 8)}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: "rackId",
        header: "Rack",
        size: 80,
        cell: ({ getValue }) => {
          const rackId = getValue<number | undefined>();
          return rackId != null ? (
            <Badge variant="outline" className="text-[11px]">
              {rackId}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: "podIP",
        header: "Pod IP",
        size: 130,
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string | null>() || "-"}</span>
        ),
      },
      {
        accessorKey: "hostIP",
        header: "Host IP",
        size: 130,
        meta: { className: "hidden xl:table-cell" },
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string | null>() || "-"}</span>
        ),
      },
      {
        accessorKey: "image",
        header: "Image",
        meta: { className: "hidden lg:table-cell" },
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string | null>() || "-"}</span>
        ),
      },
      {
        accessorKey: "dynamicConfigStatus",
        header: "Config Status",
        size: 120,
        meta: { className: "hidden md:table-cell" },
        cell: ({ getValue }) => {
          const status = getValue<"Applied" | "Failed" | "Pending" | undefined>();
          if (!status) return <span className="text-muted-foreground text-xs">-</span>;
          return (
            <Badge
              variant="outline"
              className={cn(
                "text-[11px]",
                status === "Applied" && STATUS_COLORS.success,
                status === "Failed" && STATUS_COLORS.error,
                status === "Pending" && STATUS_COLORS.warning,
              )}
            >
              {status}
            </Badge>
          );
        },
      },
      {
        id: "lastRestart",
        header: "Last Restart",
        meta: { className: "hidden lg:table-cell" },
        cell: ({ row }) =>
          row.original.lastRestartReason ? (
            <div className="space-y-0.5">
              <p className="text-xs font-medium">{row.original.lastRestartReason}</p>
              {row.original.lastRestartTime && (
                <p className="text-muted-foreground text-[10px]">{row.original.lastRestartTime}</p>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          ),
      },
    );

    if (showActions) {
      cols.push({
        id: "actions",
        header: "Actions",
        size: 70,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={(e) => {
              e.stopPropagation();
              setLogsPodName(row.original.name);
            }}
            title="View logs"
          >
            <FileText className="h-3.5 w-3.5" />
          </Button>
        ),
      });
    }

    return cols;
  }, [selectable, showActions]);

  if (pods.length === 0) {
    return (
      <EmptyState
        icon={Database}
        title="No pods found"
        description="There are no pods running for this cluster yet."
      />
    );
  }

  return (
    <>
      <DataTable
        data={pods}
        columns={columns}
        getRowId={(row) => row.name}
        rowSelection={selectable ? rowSelection : undefined}
        onRowSelectionChange={selectable ? handleRowSelectionChange : undefined}
        density="compact"
        testId="k8s-pod-table"
      />
      {namespace && clusterName && logsPodName && (
        <K8sPodLogsDialog
          open={!!logsPodName}
          onOpenChange={(open) => {
            if (!open) setLogsPodName(null);
          }}
          namespace={namespace}
          clusterName={clusterName}
          podName={logsPodName}
        />
      )}
    </>
  );
}
