"use client";

import { Server, RefreshCw, ChevronRight, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/formatters";
import { EmptyState } from "@/components/common/empty-state";
import type { UnifiedClusterRow } from "@/lib/api/types";

interface ClusterCardListProps {
  rows: UnifiedClusterRow[];
  loading: boolean;
  onRowClick: (row: UnifiedClusterRow) => void;
  onEdit: (id: string) => void;
  onDelete: (row: UnifiedClusterRow) => void;
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium tracking-wider text-muted-foreground/60">
        {label}
      </span>
      <span className="font-mono text-lg font-bold text-base-content">{value}</span>
    </div>
  );
}

function ClusterCard({
  row,
  onRowClick,
  onEdit,
  onDelete,
}: {
  row: UnifiedClusterRow;
  onRowClick: (row: UnifiedClusterRow) => void;
  onEdit: (id: string) => void;
  onDelete: (row: UnifiedClusterRow) => void;
}) {
  const isConnected = row.status === "connected";
  const isChecking = row.status === "checking";

  const diskPct =
    row.diskTotal && row.diskTotal > 0
      ? `${Math.round((row.diskUsed ?? 0) / row.diskTotal * 100)}%`
      : "—";
  const memPct =
    row.memoryTotal && row.memoryTotal > 0
      ? `${Math.round((row.memoryUsed ?? 0) / row.memoryTotal * 100)}%`
      : "—";

  return (
    <div
      className={cn(
        "group flex overflow-hidden rounded-2xl border bg-base-100 shadow-sm transition-all duration-200 hover:shadow-md",
        isConnected ? "border-base-300" : "border-error/20 opacity-75",
      )}
    >
      {/* Left color bar */}
      <div
        className={cn(
          "w-1 shrink-0",
          isConnected
            ? "bg-gradient-to-b from-success to-success/70"
            : "bg-gradient-to-b from-error to-error/70",
        )}
      />

      <div className="flex flex-1 items-center gap-6 px-6 py-5 sm:gap-8">
        {/* Identity */}
        <div className="flex min-w-0 flex-col gap-1.5 sm:w-48">
          <div className="flex items-center gap-2.5">
            <span className="truncate text-base font-bold text-base-content">{row.name}</span>
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                isChecking && "animate-pulse bg-muted-foreground",
                isConnected && "bg-success shadow-[0_0_0_3px] shadow-success/15",
                !isConnected && !isChecking && "bg-error shadow-[0_0_0_3px] shadow-error/15",
              )}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="truncate font-mono text-[11px] text-muted-foreground">{row.hosts}</span>
            {row.build && (
              <span className="text-[11px] text-muted-foreground/50">
                {row.edition ?? "CE"} {row.build}
              </span>
            )}
            {!isConnected && !isChecking && (
              <span className="text-[11px] font-medium text-error">Unavailable</span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="hidden h-12 w-px bg-base-300/60 sm:block" />

        {/* Metrics */}
        {isConnected ? (
          <div className="hidden flex-1 gap-7 sm:flex">
            <MetricCell label="NODES" value={String(row.nodeCount)} />
            <MetricCell
              label="DISK"
              value={diskPct}
            />
            <MetricCell
              label="MEMORY"
              value={memPct}
            />
          </div>
        ) : (
          <div className="hidden flex-1 gap-7 sm:flex">
            <MetricCell label="NODES" value="—" />
            <MetricCell label="DISK" value="—" />
            <MetricCell label="MEMORY" value="—" />
          </div>
        )}

        {/* Action */}
        <div className="ml-auto flex items-center gap-2">
          {isConnected ? (
            <button
              onClick={() => onRowClick(row)}
              className="flex items-center gap-1.5 rounded-lg bg-primary/5 px-4 py-2 text-sm font-semibold text-primary border border-primary/15 hover:bg-primary/10 transition-colors"
            >
              Open
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => onRowClick(row)}
              className="flex items-center gap-1.5 rounded-lg border border-base-300 bg-base-100 px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-base-200 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="hidden h-9 w-9 items-center justify-center rounded-lg border border-base-300 text-muted-foreground hover:bg-base-200 hover:text-base-content transition-colors group-hover:inline-flex"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(row.id)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(row)} className="text-error">
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export function ClusterCardList({
  rows,
  loading,
  onRowClick,
  onEdit,
  onDelete,
}: ClusterCardListProps) {
  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        icon={Server}
        title="No clusters"
        description="Add a connection to get started"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <ClusterCard
          key={row.id}
          row={row}
          onRowClick={onRowClick}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
