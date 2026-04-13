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
import { PRESET_COLORS } from "@/lib/constants";
import { EmptyState } from "@/components/common/empty-state";
import type { HealthErrorType, UnifiedClusterRow } from "@/lib/api/types";

interface ClusterCardListProps {
  rows: UnifiedClusterRow[];
  loading: boolean;
  onRowClick: (row: UnifiedClusterRow) => void;
  onEdit: (id: string) => void;
  onDelete: (row: UnifiedClusterRow) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

const ERROR_TYPE_LABELS: Record<HealthErrorType, string> = {
  timeout: "Timeout",
  connection_refused: "Connection Refused",
  cluster_error: "Cluster Error",
  auth_error: "Auth Error",
  unknown: "Unknown Error",
};

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-base-content/60 text-[10px] font-medium tracking-wider">{label}</span>
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
  const safeColor = (PRESET_COLORS as readonly string[]).includes(row.color)
    ? row.color
    : PRESET_COLORS[0];

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
      {/* Left color bar — uses per-cluster preset color */}
      <div
        className={cn("w-1 shrink-0", !isConnected && "from-error to-error/70 bg-gradient-to-b")}
        style={
          isConnected
            ? { background: `linear-gradient(to bottom, ${safeColor}, ${safeColor}B3)` }
            : undefined
        }
      />

      <div className="flex flex-1 items-center gap-6 px-6 py-5 sm:gap-8">
        {/* Identity + Description row */}
        <div className="flex min-w-0 flex-1 items-center gap-6 sm:gap-8">
          {/* Name & meta */}
          <div className="flex min-w-0 flex-col gap-1.5 sm:w-48 sm:shrink-0">
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
              <span className="text-base-content/60 truncate font-mono text-[11px]">
                {row.hosts}
              </span>
              {row.build && (
                <span className="text-base-content/50 text-[11px]">
                  {row.edition ?? "CE"} {row.build}
                </span>
              )}
              {!isConnected && !isChecking && (
                <span className="text-error text-[11px] font-medium">
                  {row.errorType ? ERROR_TYPE_LABELS[row.errorType] : "Unavailable"}
                </span>
              )}
            </div>
          </div>

          {/* Description — shown next to identity when available */}
          {row.description && (
            <>
              <div className="bg-base-300/60 hidden h-12 w-px sm:block" />
              <span className="text-base-content/75 hidden min-w-0 flex-1 truncate text-sm sm:block">
                {row.description}
              </span>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="bg-base-300/60 hidden h-12 w-px sm:block" />

        {/* Metrics */}
        {isConnected ? (
          <div className="hidden shrink-0 gap-7 sm:flex">
            <MetricCell label="NODES" value={String(row.nodeCount)} />
            <MetricCell label="DISK" value={diskPct} />
            <MetricCell label="MEMORY" value={memPct} />
          </div>
        ) : (
          <div className="hidden shrink-0 gap-7 sm:flex">
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
  hasMore,
  isLoadingMore,
  onLoadMore,
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
      {hasMore && onLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className={cn(
            "border-base-300 bg-base-100 hover:bg-base-200 text-base-content/70 hover:text-base-content mx-auto mt-2 rounded-xl border px-6 py-2.5 text-sm font-medium transition-colors",
            isLoadingMore && "cursor-not-allowed opacity-60",
          )}
        >
          {isLoadingMore ? "Loading..." : "Load More"}
        </button>
      )}
    </div>
  );
}
