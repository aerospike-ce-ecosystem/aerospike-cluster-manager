import { useState } from "react";
import { Activity, CheckCircle2, XCircle, Clock, RefreshCw, Zap, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { OperationStatusResponse } from "@/lib/api/types";

interface K8sOperationStatusProps {
  operationStatus: OperationStatusResponse;
  /** Total pod count in the cluster, used as fallback when podList is empty (targets all pods) */
  totalPodCount: number;
  /** Callback to clear spec.operations and unblock the cluster */
  onClear?: () => Promise<void>;
}

function getPhaseStyle(phase: string) {
  switch (phase) {
    case "Completed":
      return { color: "text-success", bg: "bg-success/10", border: "border-success/20" };
    case "Failed":
    case "Error":
      return { color: "text-error", bg: "bg-error/10", border: "border-error/20" };
    case "InProgress":
    case "Running":
      return { color: "text-info", bg: "bg-info/10", border: "border-info/20" };
    default:
      return { color: "text-base-content/60", bg: "bg-base-200", border: "border-base-300" };
  }
}

function getOperationIcon(kind: string) {
  switch (kind) {
    case "WarmRestart":
      return <Zap className="h-4 w-4" />;
    case "PodRestart":
      return <RefreshCw className="h-4 w-4" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
}

function getOperationLabel(kind: string) {
  switch (kind) {
    case "WarmRestart":
      return "Warm Restart";
    case "PodRestart":
      return "Pod Restart";
    default:
      return kind;
  }
}

export function K8sOperationStatus({
  operationStatus,
  totalPodCount,
  onClear,
}: K8sOperationStatusProps) {
  const [clearing, setClearing] = useState(false);
  const { kind, phase, completedPods, failedPods, podList, id } = operationStatus;
  const phaseStyle = getPhaseStyle(phase);

  // Target pods: if podList is specified, use it; otherwise all cluster pods are targeted
  const targetPods = podList.length > 0 ? podList : [];
  const targetCount = targetPods.length > 0 ? targetPods.length : totalPodCount;
  const completedCount = completedPods.length;
  const failedCount = failedPods.length;
  const processedCount = completedCount + failedCount;
  const progressPercent = targetCount > 0 ? Math.round((processedCount / targetCount) * 100) : 0;
  const isAllPods = podList.length === 0;

  // Determine which pods are still pending (not yet completed or failed)
  const doneSet = new Set([...completedPods, ...failedPods]);
  const pendingPods = targetPods.filter((p) => !doneSet.has(p));

  const isRunning = phase === "InProgress" || phase === "Running";

  return (
    <Card
      className={cn(
        "border-l-4 transition-all duration-200",
        isRunning ? "border-l-info" : phase === "Completed" ? "border-l-success" : "border-l-error",
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-sm">
          <span className={cn("flex items-center gap-2", phaseStyle.color)}>
            {getOperationIcon(kind)}
            Active Operation: {getOperationLabel(kind)}
          </span>
          <Badge
            variant="outline"
            className={cn("text-[11px]", phaseStyle.bg, phaseStyle.color, phaseStyle.border)}
          >
            {phase}
          </Badge>
          <span className="ml-auto flex items-center gap-2">
            {id && <span className="text-base-content/40 font-mono text-[10px]">ID: {id}</span>}
            {onClear && (
              <Button
                variant="ghost"
                size="sm"
                className="text-error hover:bg-error/10 h-6 gap-1 px-2 text-[11px]"
                disabled={clearing}
                onClick={async () => {
                  const confirmed = window.confirm(
                    "Clear the active operation? This will unblock the cluster for new operations.",
                  );
                  if (!confirmed) return;
                  setClearing(true);
                  try {
                    await onClear();
                  } finally {
                    setClearing(false);
                  }
                }}
              >
                <Trash2 className="h-3 w-3" />
                {clearing ? "Clearing..." : "Clear"}
              </Button>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-base-content/60">
              Progress: {processedCount}/{targetCount} pods
              {isAllPods && " (all pods)"}
            </span>
            <span className="font-medium">{progressPercent}%</span>
          </div>
          <Progress
            value={processedCount}
            max={targetCount}
            className={cn(failedCount > 0 ? "[&>div]:bg-error" : "[&>div]:bg-success")}
          />
        </div>

        {/* Pod Status Grid */}
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Completed Pods */}
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="text-success h-3.5 w-3.5" />
              <span className="text-xs font-medium">Completed ({completedCount})</span>
            </div>
            {completedPods.length > 0 ? (
              <ul className="space-y-1">
                {completedPods.map((pod) => (
                  <li
                    key={pod}
                    className="text-success flex items-center gap-1.5 font-mono text-xs"
                  >
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    <span className="truncate" title={pod}>
                      {pod}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base-content/40 text-xs">None yet</p>
            )}
          </div>

          {/* Failed Pods */}
          <div
            className={cn("rounded-lg border p-3", failedCount > 0 && "border-error/30 bg-error/5")}
          >
            <div className="mb-2 flex items-center gap-1.5">
              <XCircle
                className={cn(
                  "h-3.5 w-3.5",
                  failedCount > 0 ? "text-error" : "text-base-content/40",
                )}
              />
              <span className="text-xs font-medium">Failed ({failedCount})</span>
            </div>
            {failedPods.length > 0 ? (
              <ul className="space-y-1">
                {failedPods.map((pod) => (
                  <li key={pod} className="text-error flex items-center gap-1.5 font-mono text-xs">
                    <XCircle className="h-3 w-3 shrink-0" />
                    <span className="truncate" title={pod}>
                      {pod}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base-content/40 text-xs">None</p>
            )}
          </div>

          {/* Pending Pods */}
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <Clock
                className={cn(
                  "h-3.5 w-3.5",
                  isRunning ? "text-info animate-pulse" : "text-base-content/40",
                )}
              />
              <span className="text-xs font-medium">Pending ({targetCount - processedCount})</span>
            </div>
            {pendingPods.length > 0 ? (
              <ul className="space-y-1">
                {pendingPods.map((pod) => (
                  <li
                    key={pod}
                    className="text-base-content/60 flex items-center gap-1.5 font-mono text-xs"
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    <span className="truncate" title={pod}>
                      {pod}
                    </span>
                  </li>
                ))}
              </ul>
            ) : isAllPods && targetCount - processedCount > 0 ? (
              <p className="text-base-content/40 text-xs">
                {targetCount - processedCount} pod{targetCount - processedCount !== 1 ? "s" : ""}{" "}
                remaining
              </p>
            ) : (
              <p className="text-base-content/40 text-xs">None</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
