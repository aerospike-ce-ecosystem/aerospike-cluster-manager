"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnPinningState,
  SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
  RowSelectionState,
  OnChangeFn,
  Row,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";

type Density = "compact" | "default" | "comfortable";

const densityPadding: Record<Density, { th: string; td: string }> = {
  compact: { th: "px-3 py-1.5", td: "px-3 py-1.5" },
  default: { th: "px-4 py-2.5", td: "px-4 py-3" },
  comfortable: { th: "px-4 py-3", td: "px-4 py-4" },
};

interface DataTableProps<TData, TValue> {
  data: TData[];
  columns: ColumnDef<TData, TValue>[];
  loading?: boolean;
  emptyState?: React.ReactNode;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  onRowClick?: (row: Row<TData>) => void;
  enableColumnPinning?: boolean;
  columnPinning?: ColumnPinningState;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  getRowId?: (row: TData) => string;
  tableMinWidth?: number;
  density?: Density;
  className?: string;
  testId?: string;
}

export function DataTable<TData, TValue>({
  data,
  columns,
  loading = false,
  emptyState,
  rowSelection,
  onRowSelectionChange,
  onRowClick,
  enableColumnPinning = false,
  columnPinning,
  sorting,
  onSortingChange,
  getRowId,
  tableMinWidth,
  density = "default",
  className,
  testId = "data-table",
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    state: {
      rowSelection: rowSelection || {},
      ...(enableColumnPinning && columnPinning ? { columnPinning } : {}),
      ...(sorting ? { sorting } : {}),
    },
    enableRowSelection: true,
    enableColumnPinning,
    onRowSelectionChange: onRowSelectionChange,
    ...(onSortingChange ? { onSortingChange } : {}),
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    ...(getRowId ? { getRowId } : {}),
  });

  const pad = densityPadding[density];

  return (
    <div className={cn("relative flex-1 overflow-auto", className)} data-testid={testId}>
      {loading && data.length > 0 && (
        <div className="bg-accent/10 sticky top-0 right-0 left-0 z-30 h-[2px] overflow-hidden">
          <div className="loading-bar bg-accent h-full w-1/4 rounded-full" />
        </div>
      )}

      {loading && data.length === 0 ? (
        <div
          className="border-border/50 bg-card overflow-hidden rounded-lg border"
          data-testid={`${testId}-skeleton`}
        >
          <table className={cn("table w-full table-fixed")}>
            <thead className="grid-header sticky top-0 z-20">
              <tr>
                {columns.map((_, i) => (
                  <th
                    key={i}
                    className={cn(
                      "bg-muted/50 text-muted-foreground dark:bg-muted/30 text-[11px] font-semibold tracking-wider uppercase",
                      pad.th,
                    )}
                  >
                    <Skeleton className="h-3 w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="border-border/20 border-b last:border-b-0"
                  style={{ animationDelay: `${rowIdx * 60}ms` }}
                >
                  {columns.map((_, colIdx) => (
                    <td key={colIdx} className={pad.td}>
                      <Skeleton
                        className={cn("h-3.5", colIdx === 0 ? "w-3/4" : "w-1/2")}
                        style={{ animationDelay: `${colIdx * 40}ms` }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data.length === 0 ? (
        emptyState || <EmptyState title="No records" description="No data available to display" />
      ) : (
        <div className="border-border/50 bg-card overflow-hidden rounded-lg border">
          <table
            className={cn("table table-fixed", !tableMinWidth && "w-full")}
            style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}
          >
            <thead className="grid-header sticky top-0 z-20" data-testid={`${testId}-head`}>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const pinned = header.column.getIsPinned();
                    const canSort = onSortingChange && header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          "bg-muted/50 text-muted-foreground dark:bg-muted/30 overflow-hidden text-left text-[11px] font-semibold tracking-wider text-ellipsis whitespace-nowrap uppercase",
                          pad.th,
                          canSort && "cursor-pointer select-none",
                          (header.column.columnDef.meta as Record<string, unknown>)?.className as
                            | string
                            | undefined,
                        )}
                        style={{
                          width: header.getSize() !== 150 ? header.getSize() : undefined,
                          ...(pinned === "left"
                            ? {
                                position: "sticky" as const,
                                left: header.column.getStart("left"),
                                zIndex: 30,
                              }
                            : {}),
                          ...(pinned === "right"
                            ? {
                                position: "sticky" as const,
                                right: header.column.getAfter("right"),
                                zIndex: 30,
                              }
                            : {}),
                          ...((header.column.columnDef.meta as Record<string, unknown>)?.style as
                            | React.CSSProperties
                            | undefined),
                        }}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      >
                        <div className="flex items-center gap-1.5">
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            <>
                              {sorted === "asc" && (
                                <ChevronUp className="text-accent h-3 w-3 shrink-0" />
                              )}
                              {sorted === "desc" && (
                                <ChevronDown className="text-accent h-3 w-3 shrink-0" />
                              )}
                              {!sorted && (
                                <ChevronsUpDown className="text-muted-foreground/30 h-3 w-3 shrink-0" />
                              )}
                            </>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody data-testid={`${testId}-body`}>
              {table.getRowModel().rows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={cn(
                    "record-grid-row border-border/20 group border-b last:border-b-0",
                    onRowClick && "cursor-pointer",
                    onRowClick &&
                      "focus-visible:ring-primary focus:outline-none focus-visible:ring-2",
                  )}
                  style={{ animationDelay: `${idx * 25}ms` }}
                  onClick={() => onRowClick?.(row)}
                  onKeyDown={(e) => {
                    if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onRowClick(row);
                    }
                  }}
                  tabIndex={onRowClick ? 0 : undefined}
                  data-testid={`${testId}-row-${idx}`}
                >
                  {row.getVisibleCells().map((cell) => {
                    const pinned = cell.column.getIsPinned();
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "overflow-hidden text-ellipsis whitespace-nowrap",
                          pad.td,
                          pinned && "bg-card",
                          (cell.column.columnDef.meta as Record<string, unknown>)?.className as
                            | string
                            | undefined,
                        )}
                        style={{
                          ...(pinned === "left"
                            ? {
                                position: "sticky" as const,
                                left: cell.column.getStart("left"),
                                zIndex: 10,
                              }
                            : {}),
                          ...(pinned === "right"
                            ? {
                                position: "sticky" as const,
                                right: cell.column.getAfter("right"),
                                zIndex: 10,
                              }
                            : {}),
                          ...((cell.column.columnDef.meta as Record<string, unknown>)?.style as
                            | React.CSSProperties
                            | undefined),
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
