"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_COLORS } from "@/lib/status-colors";

type StatusType =
  | "connected"
  | "disconnected"
  | "checking"
  | "ready"
  | "building"
  | "error"
  | "live"
  | "warning";

const statusConfig: Record<StatusType, { label: string; className: string; dotColor: string }> = {
  connected: {
    label: "Connected",
    className: STATUS_COLORS.success,
    dotColor: "bg-success",
  },
  disconnected: {
    label: "Disconnected",
    className: STATUS_COLORS.error,
    dotColor: "bg-destructive",
  },
  checking: {
    label: "Checking...",
    className: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20",
    dotColor: "bg-muted-foreground",
  },
  ready: {
    label: "Ready",
    className: STATUS_COLORS.success,
    dotColor: "bg-success",
  },
  building: {
    label: "Building",
    className: STATUS_COLORS.warning,
    dotColor: "bg-warning",
  },
  error: {
    label: "Error",
    className: STATUS_COLORS.error,
    dotColor: "bg-destructive",
  },
  live: {
    label: "Live",
    className: STATUS_COLORS.success,
    dotColor: "bg-success",
  },
  warning: {
    label: "Warning",
    className: STATUS_COLORS.warning,
    dotColor: "bg-warning",
  },
};

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  className?: string;
  pulse?: boolean;
  showDot?: boolean;
}

export function StatusBadge({ status, label, className, pulse, showDot = true }: StatusBadgeProps) {
  const config = statusConfig[status];
  const showPulse =
    pulse ||
    status === "connected" ||
    status === "live" ||
    status === "ready" ||
    status === "checking";

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 py-0.5 text-[11px] font-medium", config.className, className)}
    >
      {showDot && (
        <span className="relative flex h-1.5 w-1.5">
          {showPulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                config.dotColor,
              )}
            />
          )}
          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", config.dotColor)} />
        </span>
      )}
      {label || config.label}
    </Badge>
  );
}
