"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnMeta,
  ColumnPinningState,
  OnChangeFn,
  Row,
  RowSelectionState,
  SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cn } from "@/lib/utils";

type Density = "compact" | "default" | "comfortable";

const densityPadding: Record<Density, { th: string; td: string }> = {
  compact: { th: "px-3 py-1.5", td: "px-3 py-1.5" },
  default: { th: "px-4 py-2.5", td: "px-4 py-3" },
  comfortable: { th: "px-4 py-3", td: "px-4 py-4" },
};

const densityRowHeight: Record<Density, number> = {
  compact: 32,
  default: 40,
  comfortable: 48,
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
  virtualScrolling?: boolean;
  maxHeight?: string;
  mobileLayout?: "table" | "cards";
  mobileCardRenderer?: (row: Row<TData>, index: number) => React.ReactNode;
  /** Number of skeleton rows to show while loading (default: 8). Card mode uses half this value. */
  loadingRows?: number;
}

function shouldHideColumn<TData, TValue>(
  meta: ColumnMeta<TData, TValue> | undefined,
  isMobile: boolean,
  isTablet: boolean,
) {
  if (!meta?.hideOn) return false;
  if (isMobile && meta.hideOn.includes("mobile")) return true;
  if (isTablet && meta.hideOn.includes("tablet")) return true;
  return false;
}

function getMobileLabel<TData, TValue>(column: ColumnDef<TData, TValue>, fallback: string) {
  if (column.meta?.mobileLabel) return column.meta.mobileLabel;
  if (typeof column.header === "string") return column.header;
  if ("accessorKey" in column && typeof column.accessorKey === "string") return column.accessorKey;
  return fallback;
}

function getColumnWidthStyle(size: number | undefined) {
  if (!size) return undefined;

  return {
    width: size,
    minWidth: size,
    maxWidth: size,
  };
}

function getPinnedZIndex(
  pinned: false | "left" | "right",
  pinnedIndex: number,
  surface: "header" | "cell",
) {
  if (!pinned) return undefined;

  const base = surface === "header" ? 40 : 20;
  return base - Math.max(pinnedIndex, 0);
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
  virtualScrolling = false,
  maxHeight = "600px",
  mobileLayout = "table",
  mobileCardRenderer,
  loadingRows = 8,
}: DataTableProps<TData, TValue>) {
  const { isMobile, isTablet } = useBreakpoint();
  const isCardMode = isMobile && mobileLayout === "cards";

  const responsiveColumns = React.useMemo(
    () =>
      columns.filter((column) => {
        const meta = column.meta as ColumnMeta<TData, TValue> | undefined;
        return !shouldHideColumn(meta, isMobile, isTablet);
      }),
    [columns, isMobile, isTablet],
  );

  const table = useReactTable({
    data,
    columns: responsiveColumns,
    state: {
      rowSelection: rowSelection || {},
      ...(!isCardMode && enableColumnPinning && columnPinning ? { columnPinning } : {}),
      ...(sorting ? { sorting } : {}),
    },
    enableRowSelection: true,
    enableColumnPinning: !isCardMode && enableColumnPinning,
    onRowSelectionChange,
    ...(onSortingChange ? { onSortingChange } : {}),
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    ...(getRowId ? { getRowId } : {}),
  });

  const pad = densityPadding[density];
  const { rows } = table.getRowModel();

  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => densityRowHeight[density],
    overscan: 10,
    enabled: virtualScrolling && !isCardMode,
  });

  const renderHeaderGroups = () =>
    table.getHeaderGroups().map((headerGroup) => (
      <tr key={headerGroup.id}>
        {headerGroup.headers.map((header) => {
          const pinned = header.column.getIsPinned();
          const widthStyle = getColumnWidthStyle(header.column.columnDef.size);
          const pinnedIndex = header.column.getPinnedIndex();
          const pinnedShadow =
            pinned === "left"
              ? "1px 0 0 var(--color-base-300)"
              : pinned === "right"
                ? "-1px 0 0 var(--color-base-300)"
                : undefined;
          const canSort = onSortingChange && header.column.getCanSort();
          const sorted = header.column.getIsSorted();
          const meta = header.column.columnDef.meta;

          return (
            <th
              key={header.id}
              className={cn(
                "text-muted-foreground overflow-hidden text-left text-[11px] font-semibold tracking-wider text-ellipsis whitespace-nowrap uppercase",
                pinned ? "bg-base-200 dark:bg-base-200" : "bg-base-200/50 dark:bg-base-200/30",
                pinned && "relative isolate",
                pad.th,
                canSort && "cursor-pointer select-none",
                meta?.headerClassName ?? meta?.className,
              )}
              style={{
                ...widthStyle,
                ...(pinned === "left"
                  ? {
                      position: "sticky" as const,
                      left: header.column.getStart("left"),
                      zIndex: getPinnedZIndex(pinned, pinnedIndex, "header"),
                    }
                  : {}),
                ...(pinned === "right"
                  ? {
                      position: "sticky" as const,
                      right: header.column.getAfter("right"),
                      zIndex: getPinnedZIndex(pinned, pinnedIndex, "header"),
                    }
                  : {}),
                ...(pinned
                  ? {
                      backgroundColor: "var(--color-base-200)",
                      backgroundClip: "padding-box",
                      boxShadow: pinnedShadow,
                      isolation: "isolate",
                    }
                  : {}),
                ...meta?.style,
              }}
              onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
            >
              <div className="flex items-center gap-1.5">
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
                {canSort && (
                  <>
                    {sorted === "asc" && <ChevronUp className="text-primary h-3 w-3 shrink-0" />}
                    {sorted === "desc" && <ChevronDown className="text-primary h-3 w-3 shrink-0" />}
                    {!sorted && (
                      <ChevronsUpDown className="text-muted-foreground/50 h-3 w-3 shrink-0" />
                    )}
                  </>
                )}
              </div>
            </th>
          );
        })}
      </tr>
    ));

  const renderRow = (row: Row<TData>, idx: number) => (
    <tr
      key={row.id}
      className={cn(
        "record-grid-row border-base-300 group border-b last:border-b-0",
        onRowClick && "cursor-pointer",
        onRowClick && "focus-visible:ring-primary focus:outline-none focus-visible:ring-2",
      )}
      style={virtualScrolling ? undefined : { animationDelay: `${idx * 25}ms` }}
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
        const widthStyle = getColumnWidthStyle(cell.column.columnDef.size);
        const pinnedIndex = cell.column.getPinnedIndex();
        const pinnedShadow =
          pinned === "left"
            ? "1px 0 0 var(--color-base-300)"
            : pinned === "right"
              ? "-1px 0 0 var(--color-base-300)"
              : undefined;
        const meta = cell.column.columnDef.meta;

        return (
          <td
            key={cell.id}
            className={cn(
              "overflow-hidden text-ellipsis whitespace-nowrap",
              pad.td,
              pinned && "bg-base-100",
              pinned && "relative isolate",
              meta?.cellClassName ?? meta?.className,
            )}
            style={{
              ...widthStyle,
              ...(pinned === "left"
                ? {
                    position: "sticky" as const,
                    left: cell.column.getStart("left"),
                    zIndex: getPinnedZIndex(pinned, pinnedIndex, "cell"),
                  }
                : {}),
              ...(pinned === "right"
                ? {
                    position: "sticky" as const,
                    right: cell.column.getAfter("right"),
                    zIndex: getPinnedZIndex(pinned, pinnedIndex, "cell"),
                  }
                : {}),
              ...(pinned
                ? {
                    backgroundColor: "var(--color-base-100)",
                    backgroundClip: "padding-box",
                    boxShadow: pinnedShadow,
                    isolation: "isolate",
                  }
                : {}),
              ...meta?.style,
            }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );

  const renderDefaultMobileCard = (row: Row<TData>, idx: number) => {
    const sections = {
      title: [] as Array<{ key: string; label: string; content: React.ReactNode }>,
      meta: [] as Array<{ key: string; label: string; content: React.ReactNode }>,
      content: [] as Array<{ key: string; label: string; content: React.ReactNode }>,
      actions: [] as Array<{ key: string; label: string; content: React.ReactNode }>,
    };

    row.getVisibleCells().forEach((cell) => {
      const meta = cell.column.columnDef.meta;
      const slot: keyof typeof sections = meta?.mobileSlot ?? "content";
      sections[slot].push({
        key: cell.id,
        label: getMobileLabel(cell.column.columnDef, cell.column.id),
        content: flexRender(cell.column.columnDef.cell, cell.getContext()),
      });
    });

    return (
      <div
        key={row.id}
        className={cn(
          "record-card border-base-300 bg-base-100/90 animate-fade-in rounded-2xl border p-4 shadow-sm",
          onRowClick && "cursor-pointer",
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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            {sections.title.length > 0 ? (
              sections.title.map((entry, titleIndex) => (
                <div key={entry.key} className="min-w-0">
                  {titleIndex === 0 ? (
                    <div className="text-base-content truncate text-sm font-semibold">
                      {entry.content}
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-xs">
                      <span className="mr-1 uppercase">{entry.label}:</span>
                      {entry.content}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground text-xs">{row.id}</div>
            )}
          </div>

          {sections.actions.length > 0 && (
            <div className="flex shrink-0 items-center gap-1.5">
              {sections.actions.map((entry) => (
                <div key={entry.key}>{entry.content}</div>
              ))}
            </div>
          )}
        </div>

        {sections.meta.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {sections.meta.map((entry) => (
              <div key={entry.key} className="text-muted-foreground flex items-center gap-1.5">
                <span className="uppercase opacity-60">{entry.label}</span>
                <span className="text-base-content">{entry.content}</span>
              </div>
            ))}
          </div>
        )}

        {sections.content.length > 0 && (
          <div className="border-base-300/40 mt-3 space-y-2 border-t pt-3">
            {sections.content.map((entry) => (
              <div key={entry.key} className="flex items-start gap-3 text-sm">
                <span className="text-muted-foreground/70 w-24 shrink-0 text-[11px] font-medium uppercase">
                  {entry.label}
                </span>
                <div className="min-w-0 flex-1">{entry.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading && data.length === 0) {
    if (isCardMode) {
      return (
        <div className={cn("relative min-w-0 flex-1", className)} data-testid={testId}>
          <div className="space-y-3" data-testid={`${testId}-skeleton`}>
            {Array.from({ length: Math.ceil(loadingRows / 2) }).map((_, idx) => (
              <div key={idx} className="border-base-300 bg-base-100 rounded-2xl border p-4">
                <Skeleton className="mb-3 h-4 w-32" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className={cn("relative min-w-0 flex-1 overflow-auto", className)} data-testid={testId}>
        <div
          className="border-base-300 bg-base-100 overflow-hidden rounded-lg border"
          data-testid={`${testId}-skeleton`}
        >
          <table className="table-pin-rows table w-full table-fixed">
            <thead className="grid-header sticky top-0 z-20">
              <tr>
                {responsiveColumns.map((_, i) => (
                  <th
                    key={i}
                    className={cn(
                      "bg-base-200/50 text-muted-foreground dark:bg-base-200/30 text-[11px] font-semibold tracking-wider uppercase",
                      pad.th,
                    )}
                  >
                    <Skeleton className="h-3 w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: loadingRows }).map((_, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="border-base-300 border-b last:border-b-0"
                  style={{ animationDelay: `${rowIdx * 60}ms` }}
                >
                  {responsiveColumns.map((_, colIdx) => (
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
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={cn("relative min-w-0 flex-1 overflow-auto", className)} data-testid={testId}>
        {emptyState || <EmptyState title="No records" description="No data available to display" />}
      </div>
    );
  }

  const loadingBar = loading && data.length > 0 && (
    <div className="bg-accent/10 sticky top-0 right-0 left-0 z-30 h-[2px] overflow-hidden">
      <div className="loading-bar bg-accent h-full w-1/4 rounded-full" />
    </div>
  );

  if (isCardMode) {
    return (
      <div className={cn("relative min-w-0 flex-1", className)} data-testid={testId}>
        {loadingBar}
        <div className="space-y-3" data-testid={`${testId}-body`}>
          {rows.map((row, idx) =>
            mobileCardRenderer ? (
              <React.Fragment key={row.id}>{mobileCardRenderer(row, idx)}</React.Fragment>
            ) : (
              renderDefaultMobileCard(row, idx)
            ),
          )}
        </div>
      </div>
    );
  }

  if (virtualScrolling) {
    const virtualItems = virtualizer.getVirtualItems();
    const totalSize = virtualizer.getTotalSize();

    return (
      <div className={cn("relative min-h-0 min-w-0 flex-1", className)} data-testid={testId}>
        {loadingBar}
        <div className="border-base-300 bg-base-100 min-w-0 overflow-hidden rounded-lg border">
          <div ref={parentRef} className="w-full overflow-auto" style={{ maxHeight }}>
            <table
              className={cn("table-pin-rows table table-fixed", !tableMinWidth && "w-full")}
              style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}
            >
              <thead className="grid-header sticky top-0 z-20" data-testid={`${testId}-head`}>
                {renderHeaderGroups()}
              </thead>
              <tbody data-testid={`${testId}-body`}>
                {virtualItems.length > 0 && virtualItems[0].start > 0 && (
                  <tr>
                    <td
                      colSpan={responsiveColumns.length}
                      style={{ height: virtualItems[0].start, padding: 0, border: "none" }}
                    />
                  </tr>
                )}
                {virtualItems.map((virtualRow: { index: number }) =>
                  renderRow(rows[virtualRow.index], virtualRow.index),
                )}
                {virtualItems.length > 0 &&
                  virtualItems[virtualItems.length - 1].end < totalSize && (
                    <tr>
                      <td
                        colSpan={responsiveColumns.length}
                        style={{
                          height: totalSize - virtualItems[virtualItems.length - 1].end,
                          padding: 0,
                          border: "none",
                        }}
                      />
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("relative min-h-0 min-w-0 flex-1 overflow-auto", className)}
      data-testid={testId}
    >
      {loadingBar}
      <div className="border-base-300 bg-base-100 min-w-0 overflow-hidden rounded-lg border">
        <div className="w-full overflow-auto">
          <table
            className={cn("table-pin-rows table table-fixed", !tableMinWidth && "w-full")}
            style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}
          >
            <thead className="grid-header sticky top-0 z-20" data-testid={`${testId}-head`}>
              {renderHeaderGroups()}
            </thead>
            <tbody data-testid={`${testId}-body`}>
              {rows.map((row, idx) => renderRow(row, idx))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
