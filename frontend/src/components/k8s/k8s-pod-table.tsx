"use client";

import { useState, useMemo, useCallback } from "react";
import { ColumnDef, RowSelectionState, OnChangeFn } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatters";
import { STATUS_COLORS } from "@/lib/status-colors";
import {
  ArrowRightLeft,
  FileText,
  Database,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Network,
  Clock,
  Loader2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { K8sPodLogsDialog } from "@/components/k8s/k8s-pod-logs-dialog";
import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import type { K8sPodStatus, MigrationStatus } from "@/lib/api/types";

/**
 * Calculate a human-readable duration string from an ISO timestamp to now.
 * Returns e.g. "2h 15m", "3d 4h", "45m".
 */
function formatDurationSince(isoTimestamp: string): string {
  try {
    const since = new Date(isoTimestamp);
    const now = new Date();
    const diffMs = now.getTime() - since.getTime();
    if (diffMs < 0) return "just now";

    const totalMinutes = Math.floor(diffMs / 60_000);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);

    if (totalDays > 0) {
      const remainingHours = totalHours % 24;
      return remainingHours > 0 ? `${totalDays}d ${remainingHours}h` : `${totalDays}d`;
    }
    if (totalHours > 0) {
      const remainingMinutes = totalMinutes % 60;
      return remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}m` : `${totalHours}h`;
    }
    return totalMinutes > 0 ? `${totalMinutes}m` : "<1m";
  } catch {
    return "unknown";
  }
}

interface K8sPodTableProps {
  pods: K8sPodStatus[];
  selectable?: boolean;
  selectedPods?: string[];
  onSelectionChange?: (selected: string[]) => void;
  namespace?: string;
  clusterName?: string;
  migrationStatus?: MigrationStatus | null;
}

export function K8sPodTable({
  pods,
  selectable = false,
  selectedPods = [],
  onSelectionChange,
  namespace,
  clusterName,
  migrationStatus,
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

  const migrationByPod = useMemo(() => {
    const map = new Map<string, number>();
    if (migrationStatus?.pods) {
      for (const pod of migrationStatus.pods) {
        map.set(pod.podName, pod.migratingPartitions);
      }
    }
    return map;
  }, [migrationStatus]);

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
        meta: {
          headerClassName: "text-center",
          cellClassName: "text-center",
          mobileSlot: "meta",
        },
      });
    }

    cols.push(
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>,
        meta: { mobileSlot: "title", mobileLabel: "Pod" },
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
        meta: { mobileSlot: "meta" },
      },
      {
        accessorKey: "nodeId",
        header: "Node ID",
        size: 100,
        meta: { hideOn: ["mobile"], mobileSlot: "meta", mobileLabel: "Node ID" },
        cell: ({ getValue }) => {
          const nodeId = getValue<string | undefined>();
          return nodeId ? (
            <span className="cursor-default font-mono text-xs" title={nodeId}>
              {nodeId.slice(0, 8)}
            </span>
          ) : (
            <span className="text-base-content/60">-</span>
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
            <span className="text-base-content/60">-</span>
          );
        },
        meta: { mobileSlot: "meta" },
      },
      {
        accessorKey: "podIP",
        header: "Pod IP",
        size: 130,
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string | null>() || "-"}</span>
        ),
        meta: { mobileSlot: "content", mobileLabel: "Pod IP" },
      },
      {
        accessorKey: "hostIP",
        header: "Host IP",
        size: 130,
        meta: { hideOn: ["mobile", "tablet"], mobileSlot: "content", mobileLabel: "Host IP" },
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string | null>() || "-"}</span>
        ),
      },
      {
        accessorKey: "image",
        header: "Image",
        meta: { hideOn: ["mobile", "tablet"], mobileSlot: "content", mobileLabel: "Image" },
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string | null>() || "-"}</span>
        ),
      },
      {
        accessorKey: "dynamicConfigStatus",
        header: "Config Status",
        size: 120,
        meta: { hideOn: ["mobile"], mobileSlot: "meta", mobileLabel: "Config Status" },
        cell: ({ getValue }) => {
          const status = getValue<"Applied" | "Failed" | "Pending" | undefined>();
          if (!status) return <span className="text-base-content/60 text-xs">-</span>;
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
        id: "migration",
        header: "Migration",
        size: 110,
        meta: { hideOn: ["mobile"], mobileSlot: "meta", mobileLabel: "Migration" },
        cell: ({ row }) => {
          const count = migrationByPod.get(row.original.name);
          if (!count || count === 0) {
            return <span className="text-base-content/60 text-xs">-</span>;
          }
          return (
            <Badge variant="outline" className={cn("text-[11px]", STATUS_COLORS.warning)}>
              <ArrowRightLeft className="mr-1 h-3 w-3" />
              {formatNumber(count)}
            </Badge>
          );
        },
      },
      {
        accessorKey: "readinessGateSatisfied",
        header: "Readiness Gate",
        size: 110,
        meta: { hideOn: ["mobile", "tablet"], mobileSlot: "meta", mobileLabel: "Readiness Gate" },
        cell: ({ getValue }) => {
          const satisfied = getValue<boolean | null | undefined>();
          if (satisfied == null) return <span className="text-base-content/60 text-xs">-</span>;
          return satisfied ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </TooltipTrigger>
              <TooltipContent>Readiness gate satisfied</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <XCircle className="h-4 w-4 text-red-500" />
              </TooltipTrigger>
              <TooltipContent>Readiness gate not satisfied</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: "accessEndpoints",
        header: "Access Endpoints",
        size: 150,
        meta: { hideOn: ["mobile", "tablet"], mobileSlot: "content", mobileLabel: "Endpoints" },
        cell: ({ getValue }) => {
          const endpoints = getValue<string[] | null | undefined>();
          if (!endpoints || endpoints.length === 0) {
            return <span className="text-base-content/60 text-xs">-</span>;
          }
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-default items-center gap-1 font-mono text-xs">
                  <Network className="h-3 w-3 shrink-0" />
                  {endpoints[0]}
                  {endpoints.length > 1 && (
                    <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                      +{endpoints.length - 1}
                    </Badge>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <ul className="space-y-0.5 font-mono text-xs">
                  {endpoints.map((ep) => (
                    <li key={ep}>{ep}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "ports",
        header: "Ports",
        size: 110,
        meta: { hideOn: ["mobile", "tablet"], mobileSlot: "meta", mobileLabel: "Ports" },
        cell: ({ row }) => {
          const { podPort, servicePort } = row.original;
          if (podPort == null && servicePort == null) {
            return <span className="text-base-content/60 text-xs">-</span>;
          }
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-mono text-xs">
                  {podPort ?? "-"}/{servicePort ?? "-"}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Pod port: {podPort ?? "N/A"}</p>
                <p>Service port: {servicePort ?? "N/A"}</p>
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: "clusterName",
        header: "Cluster",
        size: 120,
        meta: { hideOn: ["mobile", "tablet"], mobileSlot: "meta", mobileLabel: "Cluster" },
        cell: ({ getValue }) => {
          const name = getValue<string | undefined>();
          return name ? (
            <span className="font-mono text-xs">{name}</span>
          ) : (
            <span className="text-base-content/60 text-xs">-</span>
          );
        },
      },
      {
        id: "volumes",
        header: "Volumes",
        size: 110,
        meta: { hideOn: ["mobile", "tablet"], mobileSlot: "meta", mobileLabel: "Volumes" },
        cell: ({ row }) => {
          const { dirtyVolumes, initializedVolumes } = row.original;
          const dirtyCount = dirtyVolumes?.length ?? 0;
          const initCount = initializedVolumes?.length ?? 0;
          if (dirtyCount === 0 && initCount === 0) {
            return <span className="text-base-content/60 text-xs">—</span>;
          }
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1">
                  {dirtyCount > 0 && (
                    <Badge variant="outline" className={cn("text-[11px]", STATUS_COLORS.warning)}>
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {dirtyCount} dirty
                    </Badge>
                  )}
                  {initCount > 0 && (
                    <Badge variant="outline" className={cn("text-[11px]", STATUS_COLORS.info)}>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      {initCount} init
                    </Badge>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                {dirtyCount > 0 && (
                  <div className="mb-1">
                    <p className="text-warning font-semibold">Dirty volumes:</p>
                    <ul className="list-inside list-disc font-mono text-xs">
                      {dirtyVolumes!.map((v) => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {initCount > 0 && (
                  <div>
                    <p className="text-info font-semibold">Initialized volumes:</p>
                    <ul className="list-inside list-disc font-mono text-xs">
                      {initializedVolumes!.map((v) => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: "unstableSince",
        header: "Stability",
        size: 140,
        meta: { hideOn: ["mobile", "tablet"], mobileSlot: "meta", mobileLabel: "Stability" },
        cell: ({ getValue }) => {
          const unstableSince = getValue<string | null | undefined>();
          if (!unstableSince) {
            return (
              <span className="inline-flex items-center gap-1 text-xs text-green-500">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Stable
              </span>
            );
          }
          const duration = formatDurationSince(unstableSince);
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-default items-center gap-1 text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-[11px]">Unstable ({duration})</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Unstable since {unstableSince} ({duration})
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "lastRestart",
        header: "Last Restart",
        size: 180,
        meta: { hideOn: ["mobile", "tablet"], mobileSlot: "content", mobileLabel: "Last Restart" },
        cell: ({ row }) => {
          const { lastRestartReason, lastRestartTime } = row.original;
          if (!lastRestartReason && !lastRestartTime) {
            return <span className="text-base-content/60 text-xs">-</span>;
          }
          const timeDuration = lastRestartTime ? formatDurationSince(lastRestartTime) : null;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-default space-y-0.5">
                  {lastRestartReason && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        lastRestartReason === "OOMKilled" || lastRestartReason === "Error"
                          ? STATUS_COLORS.error
                          : STATUS_COLORS.warning,
                      )}
                    >
                      {lastRestartReason}
                    </Badge>
                  )}
                  {lastRestartTime && (
                    <p className="text-base-content/60 flex items-center gap-1 text-[10px]">
                      <Clock className="h-2.5 w-2.5" />
                      {timeDuration} ago
                    </p>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {lastRestartReason && <p>Reason: {lastRestartReason}</p>}
                {lastRestartTime && <p>Time: {lastRestartTime}</p>}
              </TooltipContent>
            </Tooltip>
          );
        },
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
        meta: { mobileSlot: "actions" },
      });
    }

    return cols;
  }, [selectable, showActions, migrationByPod]);

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
        mobileLayout="cards"
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
