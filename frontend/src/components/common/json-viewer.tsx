"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface JsonViewerProps {
  data: unknown;
  collapsed?: boolean;
  level?: number;
  className?: string;
}

export function JsonViewer({ data, collapsed = false, level = 0, className }: JsonViewerProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed && level > 0);

  if (data === null) return <span className="text-muted-foreground">null</span>;
  if (data === undefined) return <span className="text-muted-foreground">undefined</span>;

  if (typeof data === "string") {
    return <span className="text-success">&quot;{data}&quot;</span>;
  }

  if (typeof data === "number") {
    return <span className="text-info">{data}</span>;
  }

  if (typeof data === "boolean") {
    return <span className="text-secondary">{data.toString()}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-muted-foreground">[]</span>;

    return (
      <span className={cn("font-mono text-sm", className)}>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hover:text-primary inline-flex items-center"
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand JSON array" : "Collapse JSON array"}
        >
          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {isCollapsed ? (
          <span className="text-muted-foreground"> [{data.length} items]</span>
        ) : (
          <>
            {"["}
            <div className="ml-4">
              {data.map((item, i) => (
                <div key={i}>
                  <JsonViewer data={item} collapsed={collapsed} level={level + 1} />
                  {i < data.length - 1 && ","}
                </div>
              ))}
            </div>
            {"]"}
          </>
        )}
      </span>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;

    return (
      <span className={cn("font-mono text-sm", className)}>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hover:text-primary inline-flex items-center"
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand JSON object" : "Collapse JSON object"}
        >
          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {isCollapsed ? (
          <span className="text-muted-foreground">
            {" "}
            {"{"}...{entries.length} keys{"}"}
          </span>
        ) : (
          <>
            {"{"}
            <div className="ml-4">
              {entries.map(([key, value], i) => (
                <div key={key}>
                  <span className="text-error">&quot;{key}&quot;</span>
                  {": "}
                  <JsonViewer data={value} collapsed={collapsed} level={level + 1} />
                  {i < entries.length - 1 && ","}
                </div>
              ))}
            </div>
            {"}"}
          </>
        )}
      </span>
    );
  }

  return <span>{String(data)}</span>;
}
