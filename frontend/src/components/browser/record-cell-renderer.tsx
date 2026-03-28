import type { BinValue } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { truncateMiddle } from "@/lib/formatters";

export function renderCellValue(value: BinValue, binName?: string): React.ReactNode {
  if (value === null || value === undefined)
    return <span className="cell-val-null font-mono text-xs">—</span>;

  if (typeof value === "boolean")
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono text-xs font-medium",
          value ? "text-success" : "text-error",
        )}
      >
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
            value ? "bg-success" : "bg-error",
          )}
        />
        {value.toString()}
      </span>
    );

  // Detect boolean-like integers (0/1) when bin name strongly suggests boolean.
  // Matches: bin_bool, is_active, has_flag, bool_field, enabled, disabled — but not "hyperbolic".
  if (
    typeof value === "number" &&
    binName &&
    /(?:^bool|bool$|^is[_A-Z]|^has[_A-Z]|_bool_|_bool$|^enabled$|^disabled$|^active$|^flag)/i.test(
      binName,
    ) &&
    (value === 0 || value === 1)
  ) {
    const boolVal = value === 1;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono text-xs font-medium",
          boolVal ? "text-success" : "text-error",
        )}
      >
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
            boolVal ? "bg-success" : "bg-error",
          )}
        />
        {boolVal.toString()}
      </span>
    );
  }

  if (typeof value === "number")
    return (
      <span className="cell-val-number font-mono text-[13px] font-medium">
        {value.toLocaleString()}
      </span>
    );

  if (Array.isArray(value))
    return (
      <span className="cell-val-complex font-mono">
        <span className="opacity-50">[</span>
        {value.length}
        <span className="opacity-50">]</span>
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
        <span className="opacity-50">{"{"}</span>
        {keyCount}
        <span className="opacity-50">{"}"}</span>
      </span>
    );
  }

  // String: detect GeoJSON serialized as string
  const str = String(value);
  if (str.startsWith('{"type":') && str.includes('"coordinates"')) {
    return <span className="cell-val-geo font-mono">◉ geo</span>;
  }

  return <span className="cell-val-string font-mono text-[13px]">{truncateMiddle(str, 50)}</span>;
}
