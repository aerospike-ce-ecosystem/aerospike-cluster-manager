"use client";

import { Server, ChevronRight, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
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
      <span className="text-base-content/40 text-[10px] font-medium tracking-wider">{label}</span>
      <span className="text-base-content font-mono text-lg font-bold">{value}</span>
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
      ? `${Math.round(((row.diskUsed ?? 0) / row.diskTotal) * 100)}%`
      : "—";
  const memPct =
    row.memoryTotal && row.memoryTotal > 0
      ? `${Math.round(((row.memoryUsed ?? 0) / row.memoryTotal) * 100)}%`
      : "—";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onRowClick(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRowClick(row);
        }
      }}
      className={cn(
        "group bg-base-100 flex cursor-pointer overflow-hidden rounded-2xl border shadow-sm transition-all duration-200 hover:shadow-md",
        isConnected ? "border-base-300 hover:border-primary/30" : "border-error/20 opacity-75",
      )}
    >
      {/* Left color bar */}
      <div
        className={cn(
          "w-1 shrink-0",
          isConnected
            ? "from-success to-success/70 bg-gradient-to-b"
            : "from-error to-error/70 bg-gradient-to-b",
        )}
      />

      <div className="flex flex-1 items-center gap-6 px-6 py-5 sm:gap-8">
        {/* Identity */}
        <div className="flex min-w-0 flex-col gap-1.5 sm:w-48">
          <div className="flex items-center gap-2.5">
            <span className="text-base-content truncate text-base font-bold">{row.name}</span>
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                isChecking && "bg-muted-foreground animate-pulse",
                isConnected && "bg-success shadow-success/15 shadow-[0_0_0_3px]",
                !isConnected && !isChecking && "bg-error shadow-error/15 shadow-[0_0_0_3px]",
              )}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-base-content/60 truncate font-mono text-[11px]">{row.hosts}</span>
            {row.description && (
              <span className="text-base-content/50 truncate text-[11px]">{row.description}</span>
            )}
            {row.build && (
              <span className="text-base-content/40 text-[11px]">
                {row.edition ?? "CE"} {row.build}
              </span>
            )}
            {!isConnected && !isChecking && (
              <span className="text-error text-[11px] font-medium">Unavailable</span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="bg-base-300/60 hidden h-12 w-px sm:block" />

        {/* Metrics */}
        {isConnected ? (
          <div className="hidden flex-1 gap-7 sm:flex">
            <MetricCell label="NODES" value={String(row.nodeCount)} />
            <MetricCell label="DISK" value={diskPct} />
            <MetricCell label="MEMORY" value={memPct} />
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
          <ChevronRight
            className={cn(
              "h-5 w-5 transition-colors",
              isConnected ? "text-primary/40 group-hover:text-primary" : "text-base-content/20",
            )}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e) => e.stopPropagation()}
              className="border-base-300 text-muted-foreground hover:bg-base-200 hover:text-base-content inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors sm:hidden sm:group-hover:inline-flex"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(row.id);
                }}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(row);
                }}
                className="text-error"
              >
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
      <EmptyState icon={Server} title="No clusters" description="Add a connection to get started" />
    );
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="border-base-300 bg-base-100 h-24 animate-pulse rounded-2xl border"
          />
        ))}
      </div>
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
