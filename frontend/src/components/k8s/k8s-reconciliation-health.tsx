"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Clock, RotateCcw, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import type { ReconciliationStatus } from "@/lib/api/types";

interface K8sReconciliationHealthProps {
  namespace: string;
  name: string;
  onResetCircuitBreaker?: () => void;
  className?: string;
}

export function K8sReconciliationHealth({
  namespace,
  name,
  onResetCircuitBreaker,
  className,
}: K8sReconciliationHealthProps) {
  const [status, setStatus] = useState<ReconciliationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm font-normal">
            Reconciliation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted h-8 animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!status || (status.failedReconcileCount === 0 && !status.circuitBreakerActive)) {
    return null;
  }

  const progressPct = Math.min(
    (status.failedReconcileCount / status.circuitBreakerThreshold) * 100,
    100,
  );

  return (
    <Card
      className={cn(
        status.circuitBreakerActive ? "border-destructive/50" : "border-amber-500/50",
        className,
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-normal">
          {status.circuitBreakerActive ? (
            <>
              <Zap className="text-destructive h-4 w-4" />
              <span className="text-destructive">Circuit Breaker Active</span>
            </>
          ) : (
            <>
              <Activity className="h-4 w-4 text-amber-500" />
              <span className="text-amber-600">Reconciliation Errors</span>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress toward circuit breaker */}
        <div>
          <div className="text-muted-foreground mb-1 flex items-center justify-between text-xs">
            <span>
              Failures: {status.failedReconcileCount} / {status.circuitBreakerThreshold}
            </span>
            {status.circuitBreakerActive && (
              <Badge variant="destructive" className="text-[10px]">
                TRIPPED
              </Badge>
            )}
          </div>
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                status.circuitBreakerActive ? "bg-destructive" : "bg-amber-500",
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Backoff info */}
        {status.estimatedBackoffSeconds && (
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Clock className="h-3 w-3" />
            <span>Next retry in ~{status.estimatedBackoffSeconds}s</span>
          </div>
        )}

        {/* Last error */}
        {status.lastReconcileError && (
          <div className="bg-destructive/5 rounded p-2">
            <p className="text-destructive text-xs font-medium">Last error:</p>
            <p className="text-muted-foreground mt-0.5 line-clamp-3 text-xs">
              {status.lastReconcileError}
            </p>
          </div>
        )}

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
