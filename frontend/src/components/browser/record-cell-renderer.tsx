import type { BinValue } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { truncateMiddle } from "@/lib/formatters";

export function renderCellValue(value: BinValue): React.ReactNode {
  if (value === null || value === undefined)
    return <span className="cell-val-null font-mono text-xs">—</span>;

  if (typeof value === "boolean")
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono text-xs",
          value ? "text-success" : "text-error/80",
        )}
      >
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
            value ? "bg-success" : "bg-error/80",
          )}
        />
        {value.toString()}
      </span>
    );

  if (typeof value === "number")
    return <span className="cell-val-number font-mono text-[13px]">{value.toLocaleString()}</span>;

  if (Array.isArray(value))
    return (
      <span className="cell-val-complex font-mono">
        <span className="opacity-40">[</span>
        {value.length} items
        <span className="opacity-40">]</span>
      </span>
    );

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("type" in obj && "coordinates" in obj) {
      return <span className="cell-val-geo font-mono">◉ geo</span>;
    }
    const keyCount = Object.keys(obj).length;
    return (
      <span className="cell-val-complex font-mono">
        <span className="opacity-40">{"{"}</span>
        {keyCount} keys
        <span className="opacity-40">{"}"}</span>
      </span>
    );
  }

  return (
    <span className="text-base-content/85 font-mono text-[13px]">
      {truncateMiddle(String(value), 50)}
    </span>
  );
}
