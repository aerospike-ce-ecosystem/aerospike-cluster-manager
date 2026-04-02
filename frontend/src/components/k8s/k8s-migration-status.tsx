"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber, formatRelativeTime } from "@/lib/formatters";
import { api } from "@/lib/api/client";
import type { MigrationStatus } from "@/lib/api/types";

interface K8sMigrationStatusProps {
  namespace: string;
  name: string;
  className?: string;
  onUpdate?: (status: MigrationStatus | null) => void;
}

export function K8sMigrationStatus({
  namespace,
  name,
  className,
  onUpdate,
}: K8sMigrationStatusProps) {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const fetchStatus = useCallback(() => {
    api
      .getK8sMigrationStatus(namespace, name)
      .then((data) => {
        setStatus(data);
        onUpdateRef.current?.(data);
      })
      .catch(() => {
        // Keep previous status to avoid UI flickering on transient errors
      })
      .finally(() => setLoading(false));
  }, [namespace, name]);

  // Fetch on mount and when namespace/name change; clear any stale interval
  useEffect(() => {
    // Clear stale interval from a previous cluster
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    fetchStatus();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchStatus]);

  // Auto-refresh every 5 seconds when migration is in progress
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (status?.inProgress) {
      intervalRef.current = setInterval(fetchStatus, 5000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status?.inProgress, fetchStatus]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base-content/60 text-sm font-normal">
            Migration Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-base-200 h-8 animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  const inProgress = status.inProgress;

  return (
    <Card className={cn(inProgress ? "border-warning/50" : "border-success/30", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-normal">
          <ArrowRightLeft className={cn("h-4 w-4", inProgress ? "text-warning" : "text-success")} />
          <span className={inProgress ? "text-warning" : "text-success"}>Migration Status</span>
          <Badge
            variant="outline"
            className={cn(
              "ml-auto text-[11px]",
              inProgress
                ? "bg-warning/10 text-warning border-warning/20"
                : "bg-success/10 text-success border-success/20",
            )}
          >
            {inProgress ? "Migrating" : "No Migration"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Remaining partitions */}
        {inProgress && (
          <div>
            <div className="text-base-content/60 mb-1 flex items-center justify-between text-xs">
              <span>Remaining partitions</span>
              <span className="font-mono font-medium">
                {formatNumber(status.remainingPartitions)}
              </span>
            </div>
            <div className="bg-base-200 relative h-2 w-full overflow-hidden rounded-full">
              {status.remainingPartitions > 0 ? (
                <div className="bg-warning absolute inset-0 h-full w-1/3 animate-[migrationSlide_1.5s_ease-in-out_infinite] rounded-full" />
              ) : (
                <div className="bg-success h-full w-full rounded-full" />
              )}
            </div>
          </div>
        )}

        {/* Per-pod breakdown */}
        {inProgress && status.pods.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-base-content/60 text-xs font-medium">Per-pod breakdown</p>
            <div className="space-y-1">
              {status.pods.map((pod) => (
                <div
                  key={pod.podName}
                  className="flex items-center justify-between rounded border px-2 py-1 text-xs"
                >
                  <span className="font-mono">{pod.podName}</span>
                  <Badge
                    variant="outline"
                    className="bg-warning/10 text-warning border-warning/20 text-[10px]"
                  >
                    {formatNumber(pod.migratingPartitions)} partitions
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last checked */}
        <div className="text-base-content/60 flex items-center gap-1.5 text-xs">
          <Clock className="h-3 w-3" />
          <span>Last checked: {formatRelativeTime(status.lastChecked)}</span>
          {inProgress && (
            <span className="text-base-content/60 ml-auto">Auto-refreshing every 5s</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
