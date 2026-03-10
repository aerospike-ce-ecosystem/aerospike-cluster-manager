"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatters";
import { PAGE_SIZE_OPTIONS } from "@/lib/constants";

interface TablePaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  loading?: boolean;
  pageSizeOptions?: number[] | readonly number[];
  className?: string;
}

function getVisiblePages(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, 5, "ellipsis", total];
  if (current >= total - 2)
    return [1, "ellipsis", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", total];
}

export function TablePagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  loading = false,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  className,
}: TablePaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  if (total === 0) return null;

  return (
    <div
      className={cn(
        "border-base-300/50 bg-base-100/80 safe-bottom flex w-full min-w-0 shrink-0 flex-col gap-3 border-t px-3 py-2 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6",
        className,
      )}
    >
      {/* Range & page size */}
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
          {start}–{end}
          <span className="text-muted-foreground/60 mx-1.5">of</span>
          {formatNumber(total)}
        </span>
        <Select
          value={String(pageSize)}
          onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
          className="border-base-300/40 text-muted-foreground h-6 w-[62px] bg-transparent px-2 font-mono text-[11px]"
          disabled={loading}
          aria-label="Rows per page"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={String(size)}>
              {size}
            </option>
          ))}
        </Select>
        <span className="text-muted-foreground/60 hidden text-[10px] tracking-wider uppercase sm:inline">
          per page
        </span>
      </div>

      {/* Page navigation */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-1 sm:justify-center">
        {/* First/Last page: hidden on mobile */}
        <button
          className="page-num-btn hidden sm:inline-flex"
          disabled={!hasPrev || loading}
          onClick={() => onPageChange(1)}
          aria-label="Go to first page"
        >
          <ChevronsLeft className="h-3 w-3" />
        </button>
        <button
          className="page-num-btn"
          disabled={!hasPrev || loading}
          onClick={() => onPageChange(page - 1)}
          aria-label="Go to previous page"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>

        {/* Page numbers: show on sm+, on mobile show current/total */}
        <span className="text-muted-foreground px-2 font-mono text-[11px] sm:hidden">
          {page} / {totalPages}
        </span>
        <span className="hidden sm:contents">
          {getVisiblePages(page, totalPages).map((p, i) =>
            p === "ellipsis" ? (
              <span
                key={`dots-${i}`}
                className="text-muted-foreground/50 px-1 font-mono text-[11px] select-none"
                aria-hidden="true"
              >
                ···
              </span>
            ) : (
              <button
                key={p}
                className={cn("page-num-btn", p === page && "current")}
                onClick={() => onPageChange(p as number)}
                disabled={loading}
                aria-label={`Go to page ${p}`}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </button>
            ),
          )}
        </span>

        <button
          className="page-num-btn"
          disabled={!hasNext || loading}
          onClick={() => onPageChange(page + 1)}
          aria-label="Go to next page"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
        <button
          className="page-num-btn hidden sm:inline-flex"
          disabled={!hasNext || loading}
          onClick={() => onPageChange(totalPages)}
          aria-label="Go to last page"
        >
          <ChevronsRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
