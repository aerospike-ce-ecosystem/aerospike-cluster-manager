"use client";

import { cn } from "@/lib/utils";
import { formatBytes, formatPercent } from "@/lib/formatters";

interface MemoryDiskCellProps {
  used?: number;
  total?: number;
  type: "memory" | "disk";
}

export function MemoryDiskCell({ used, total }: MemoryDiskCellProps) {
  if (used === undefined || total === undefined) {
    return <span className="text-muted-foreground">--</span>;
  }

  const percent = formatPercent(used, total);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-1.5 text-sm">
        <span>{formatBytes(used)}</span>
        <span className="text-muted-foreground text-xs">{percent}%</span>
      </div>
      <div className="bg-base-300 h-1 w-full overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            percent < 50 && "bg-success",
            percent >= 50 && percent < 80 && "bg-warning",
            percent >= 80 && "bg-error",
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
