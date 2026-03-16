"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  size?: "sm" | "default";
  className?: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  size = "default",
  className,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const isSmall = size === "sm";

  return (
    <div className={cn("rounded-lg border", isSmall && "rounded border", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center justify-between text-left",
          isSmall ? "px-3 py-2" : "p-4",
        )}
      >
        <div>
          <span className={cn("font-medium", isSmall ? "text-xs" : "text-sm")}>{title}</span>
          {summary && (
            <span
              className={cn(
                "text-base-content/60",
                isSmall ? "ml-1.5 text-[10px]" : "ml-2 text-xs",
              )}
            >
              {summary}
            </span>
          )}
        </div>
        {open ? (
          <ChevronDown
            className={cn("text-base-content/60", isSmall ? "h-3.5 w-3.5" : "h-4 w-4")}
          />
        ) : (
          <ChevronRight
            className={cn("text-base-content/60", isSmall ? "h-3.5 w-3.5" : "h-4 w-4")}
          />
        )}
      </button>
      {open && (
        <div
          className={cn(
            "border-t",
            isSmall ? "space-y-3 px-3 pt-3 pb-3" : "space-y-4 px-4 pt-4 pb-4",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
