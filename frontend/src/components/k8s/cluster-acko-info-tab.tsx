import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { K8sClusterStatusBadge } from "@/components/k8s/k8s-cluster-status-badge";
import { K8sPodTable } from "@/components/k8s/k8s-pod-table";
import { cn } from "@/lib/utils";
import type {
  ClusterHealthSummary,
  K8sClusterDetail,
  K8sClusterEvent,
  K8sClusterPhase,
} from "@/lib/api/types";

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return "just now";
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
  } catch {
    return isoString;
  }
}

function getPhaseBorderClass(phase: K8sClusterPhase | string): string {
  switch (phase) {
    case "Completed":
      return "border-success/40";
    case "Error":
      return "border-destructive/40";
    case "InProgress":
    case "WaitingForMigration":
    case "RollingRestart":
      return "border-warning/40";
    case "ScalingUp":
    case "ScalingDown":
    case "ACLSync":
      return "border-info/40";
    default:
      return "border-border";
  }
}

interface ClusterAckoInfoTabProps {
  k8sDetail: K8sClusterDetail;
  health: ClusterHealthSummary | null;
  events: K8sClusterEvent[];
  selectedPods: string[];
  onSelectPods: (pods: string[]) => void;
  namespace: string;
  clusterName: string;
}

export function ClusterAckoInfoTab({
  k8sDetail,
  health,
  events,
  selectedPods,
  onSelectPods,
  namespace,
  clusterName,
}: ClusterAckoInfoTabProps) {
  const [pendingPodsExpanded, setPendingPodsExpanded] = useState(false);

  return (
    <div className="space-y-6">
      {/* ── Phase Status + Health Overview ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Phase Status Card */}
        <Card className={cn("border-2", getPhaseBorderClass(k8sDetail.phase))}>
          <CardHeader className="pb-3">
            <CardDescription className="text-xs font-medium tracking-wider uppercase">
              Cluster Phase
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <K8sClusterStatusBadge phase={k8sDetail.phase} />
            {k8sDetail.phaseReason && (
              <p className="text-muted-foreground text-sm">{k8sDetail.phaseReason}</p>
            )}
            <div className="flex items-baseline gap-1.5 pt-1">
              <span className="text-3xl font-bold">{k8sDetail.size}</span>
              <span className="text-muted-foreground text-sm">nodes</span>
              {k8sDetail.aerospikeClusterSize != null &&
                k8sDetail.aerospikeClusterSize !== k8sDetail.size && (
                  <span className="text-muted-foreground ml-2 text-xs">
                    (AS: {k8sDetail.aerospikeClusterSize})
                  </span>
                )}
            </div>
          </CardContent>
        </Card>

        {/* Health Overview Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-xs font-medium tracking-wider uppercase">
              Health Overview
            </CardDescription>
          </CardHeader>
          <CardContent>
            {health ? (
              <div className="space-y-3">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold">
                    {health.readyPods}/{health.desiredPods}
                  </span>
                  <span className="text-muted-foreground text-sm">Pods Ready</span>
                  {health.pendingRestartCount > 0 && (
                    <Badge
                      variant="outline"
                      className="ml-auto text-[11px] bg-warning/10 text-warning border-warning/20"
                    >
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {health.pendingRestartCount} pending restart
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px]",
                      health.migrating
                        ? "bg-warning/10 text-warning border-warning/20"
                        : "bg-success/10 text-success border-success/20",
                    )}
                  >
                    {health.migrating ? "Migrating" : "Stable"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px]",
                      health.configApplied
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-warning/10 text-warning border-warning/20",
                    )}
                  >
                    Config {health.configApplied ? "Applied" : "Pending"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px]",
                      health.available
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-destructive/10 text-destructive border-destructive/20",
                    )}
                  >
                    {health.available ? "Available" : "Unavailable"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px]",
                      health.aclSynced
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-warning/10 text-warning border-warning/20",
                    )}
                  >
                    ACL {health.aclSynced ? "Synced" : "Pending"}
                  </Badge>
                </div>
                {health.rackDistribution.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-muted-foreground mr-1 text-xs">Racks:</span>
                    {health.rackDistribution.map((r) => (
                      <Badge key={r.id} variant="outline" className="px-1.5 text-[10px]">
                        R{r.id}: {r.ready}/{r.total}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-5 w-48" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Cluster Info ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers className="text-muted-foreground h-4 w-4" />
            Cluster Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground shrink-0">Image</dt>
              <dd className="truncate text-right font-mono text-xs">{k8sDetail.image}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Age</dt>
              <dd className="font-medium">{k8sDetail.age || "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Dynamic Config</dt>
              <dd>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px]",
                    k8sDetail.spec?.enableDynamicConfigUpdate
                      ? "bg-success/10 text-success border-success/20"
                      : "bg-muted text-muted-foreground border-border",
                  )}
                >
                  {k8sDetail.spec?.enableDynamicConfigUpdate ? "Enabled" : "Disabled"}
                </Badge>
              </dd>
            </div>
            {k8sDetail.lastReconcileTime && (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last Reconcile
                </dt>
                <dd className="font-medium" title={k8sDetail.lastReconcileTime}>
                  {formatRelativeTime(k8sDetail.lastReconcileTime)}
                </dd>
              </div>
            )}
            {k8sDetail.operatorVersion && (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Operator Version</dt>
                <dd className="font-mono text-xs">{k8sDetail.operatorVersion}</dd>
              </div>
            )}
            {k8sDetail.failedReconcileCount > 0 && (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="text-warning h-3 w-3" />
                  Reconcile Errors
                </dt>
                <dd className="text-warning font-semibold">{k8sDetail.failedReconcileCount}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* ── Pods ── */}
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          Pods ({k8sDetail.pods.length})
          {k8sDetail.pendingRestartPods.length > 0 && (
            <Badge
              variant="outline"
              className="px-1.5 text-[10px] bg-warning/10 text-warning border-warning/20"
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              {k8sDetail.pendingRestartPods.length} pending restart
            </Badge>
          )}
        </h2>

        {k8sDetail.pendingRestartPods.length > 0 && (
          <Card className="border-warning/30 bg-warning/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-warning flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4" />
                Pending Restart ({k8sDetail.pendingRestartPods.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
                onClick={() => setPendingPodsExpanded(!pendingPodsExpanded)}
              >
                {pendingPodsExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {pendingPodsExpanded ? "Hide pods" : "Show pods"}
              </button>
              {pendingPodsExpanded && (
                <ul className="mt-2 space-y-0.5">
                  {k8sDetail.pendingRestartPods.map((pod) => (
                    <li key={pod} className="font-mono text-xs">
                      {pod}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {selectedPods.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 px-2 py-1">
              {selectedPods.length} pod{selectedPods.length > 1 ? "s" : ""} selected
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectPods([])}
              className="h-7 px-2"
            >
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          </div>
        )}

        <K8sPodTable
          pods={k8sDetail.pods}
          selectable
          selectedPods={selectedPods}
          onSelectionChange={onSelectPods}
          namespace={namespace}
          clusterName={clusterName}
        />
      </div>

      {/* ── Conditions ── */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Activity className="text-muted-foreground h-4 w-4" />
          Conditions ({k8sDetail.conditions?.length ?? 0})
        </h2>
        {!k8sDetail.conditions || k8sDetail.conditions.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No conditions"
            description="No conditions reported for this cluster."
          />
        ) : (
          <div className="space-y-2">
            {k8sDetail.conditions.map((cond, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      cond.status === "True" ? "bg-success" : "bg-muted-foreground",
                    )}
                  />
                  <span className="font-medium">{cond.type}</span>
                </div>
                <div className="text-muted-foreground flex items-center gap-4">
                  {cond.reason && <span>{cond.reason}</span>}
                  {cond.message && (
                    <span className="max-w-xs truncate" title={cond.message}>
                      {cond.message}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Events ── */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Activity className="text-muted-foreground h-4 w-4" />
          Events ({events.length})
        </h2>
        {events.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No events"
            description="No events recorded for this cluster yet."
          />
        ) : (
          <div className="space-y-2">
            {events.map((event, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border p-3 text-sm"
              >
                <span
                  className={cn(
                    "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                    event.type === "Warning" ? "bg-warning" : "bg-info",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{event.reason}</span>
                    {event.count && event.count > 1 && (
                      <span className="text-muted-foreground text-xs">x{event.count}</span>
                    )}
                  </div>
                  {event.message && (
                    <p className="text-muted-foreground mt-0.5 text-xs">{event.message}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
