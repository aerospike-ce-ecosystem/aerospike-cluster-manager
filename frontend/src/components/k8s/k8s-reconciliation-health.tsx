"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Clock, RotateCcw, Zap, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import type { ReconciliationStatus } from "@/lib/api/types";

const AUTO_REFRESH_INTERVAL = 10_000;

interface K8sReconciliationHealthProps {
  namespace: string;
  name: string;
  onResetCircuitBreaker?: () => void;
  className?: string;
}

type Severity = "healthy" | "warning" | "critical";

function getSeverity(failedCount: number): Severity {
  if (failedCount === 0) return "healthy";
  if (failedCount <= 5) return "warning";
  return "critical";
}

function getSeverityColor(severity: Severity) {
  switch (severity) {
    case "healthy":
      return {
        border: "border-green-500/50",
        text: "text-green-600",
        bg: "bg-green-500",
        badgeBg: "bg-green-500/10",
        icon: "text-green-500",
      };
    case "warning":
      return {
        border: "border-amber-500/50",
        text: "text-amber-600",
        bg: "bg-amber-500",
        badgeBg: "bg-amber-500/10",
        icon: "text-amber-500",
      };
    case "critical":
      return {
        border: "border-error/50",
        text: "text-error",
        bg: "bg-error",
        badgeBg: "bg-error/10",
        icon: "text-error",
      };
  }
}

export function K8sReconciliationHealth({
  namespace,
  name,
  onResetCircuitBreaker,
  className,
}: K8sReconciliationHealthProps) {
  const [status, setStatus] = useState<ReconciliationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelFetchRef = useRef<(() => void) | null>(null);

  const fetchStatus = useCallback(() => {
    let cancelled = false;
    api
      .getK8sReconciliationStatus(namespace, name)
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [namespace, name]);

  // Initial fetch
  useEffect(() => {
    return fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh when failures > 0
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (status && status.failedReconcileCount > 0) {
      intervalRef.current = setInterval(() => {
        cancelFetchRef.current?.();
        cancelFetchRef.current = fetchStatus();
      }, AUTO_REFRESH_INTERVAL);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      cancelFetchRef.current?.();
      cancelFetchRef.current = null;
    };
  }, [status?.failedReconcileCount, fetchStatus]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base-content/60 text-sm font-normal">Reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-base-200 h-8 animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  const severity = getSeverity(status.failedReconcileCount);
  const colors = getSeverityColor(severity);

  // Show healthy state briefly
  if (severity === "healthy" && !status.circuitBreakerActive) {
    return (
      <Card className={cn("border-green-500/30", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-normal">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-green-600">Reconciliation Healthy</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base-content/60 text-xs">
            No reconciliation errors detected.
            {status.lastReconcileTime && (
              <span className="ml-1">Last reconciled: {status.lastReconcileTime}</span>
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  const progressPct =
    status.circuitBreakerThreshold > 0
      ? Math.min((status.failedReconcileCount / status.circuitBreakerThreshold) * 100, 100)
      : 0;

  return (
    <Card className={cn(colors.border, className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-normal">
          {status.circuitBreakerActive ? (
            <>
              <Zap className={cn("h-4 w-4", colors.icon)} />
              <span className={colors.text}>Circuit Breaker Active</span>
            </>
          ) : (
            <>
              <Activity className={cn("h-4 w-4", colors.icon)} />
              <span className={colors.text}>Reconciliation Errors</span>
            </>
          )}
          <Badge
            variant="outline"
            className={cn(
              "ml-auto text-[10px]",
              severity === "critical" && "border-error/30 bg-error/10 text-error",
              severity === "warning" && "border-amber-500/30 bg-amber-500/10 text-amber-600",
            )}
          >
            {severity === "critical" ? "CRITICAL" : "WARNING"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress toward circuit breaker */}
        <div>
          <div className="text-base-content/60 mb-1 flex items-center justify-between text-xs">
            <span>
              Failures: {status.failedReconcileCount} / {status.circuitBreakerThreshold}
            </span>
            {status.circuitBreakerActive && (
              <Badge variant="destructive" className="text-[10px]">
                TRIPPED
              </Badge>
            )}
          </div>
          <div className="bg-base-200 h-2 w-full overflow-hidden rounded-full">
            <div
              className={cn("h-full rounded-full transition-all", colors.bg)}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Severity indicator dot legend */}
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            Healthy (0)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            Warning (1-5)
          </span>
          <span className="flex items-center gap-1">
            <span className="bg-error inline-block h-2 w-2 rounded-full" />
            Critical (6+)
          </span>
        </div>

        {/* Backoff info */}
        {status.estimatedBackoffSeconds && (
          <div className="text-base-content/60 flex items-center gap-1.5 text-xs">
            <Clock className="h-3 w-3" />
            <span>Next retry in ~{status.estimatedBackoffSeconds}s</span>
          </div>
        )}

        {/* Last error */}
        {status.lastReconcileError && (
          <div className={cn("rounded p-2", colors.badgeBg)}>
            <p className={cn("text-xs font-medium", colors.text)}>Last error:</p>
            <p className="text-base-content/60 mt-0.5 line-clamp-3 text-xs">
              {status.lastReconcileError}
            </p>
          </div>
        )}

        {/* Auto-refresh indicator */}
        <div className="text-base-content/60 flex items-center gap-1 text-[10px]">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          Auto-refreshing every 10s
        </div>

        {/* Reset button */}
        {status.circuitBreakerActive && onResetCircuitBreaker && (
          <Button variant="outline" size="sm" className="w-full" onClick={onResetCircuitBreaker}>
            <RotateCcw className="mr-2 h-3 w-3" />
            Reset Circuit Breaker
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
