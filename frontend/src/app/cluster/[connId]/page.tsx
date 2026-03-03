"use client";

import { use, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Layers,
  Network,
  Pencil,
  RefreshCw,
  Scale,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/page-header";
import { FullPageError } from "@/components/common/full-page-error";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { InlineAlert } from "@/components/common/inline-alert";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { K8sClusterStatusBadge } from "@/components/k8s/k8s-cluster-status-badge";
import { K8sPodTable } from "@/components/k8s/k8s-pod-table";
import { K8sScaleDialog } from "@/components/k8s/k8s-scale-dialog";
import { K8sDeleteDialog } from "@/components/k8s/k8s-delete-dialog";
import { K8sEditDialog } from "@/components/k8s/k8s-edit-dialog";
import { useAsyncData } from "@/hooks/use-async-data";
import { useK8sClusterStore } from "@/stores/k8s-cluster-store";
import { api } from "@/lib/api/client";
import {
  TRANSITIONAL_PHASES,
  type ClusterHealthSummary,
  type K8sClusterEvent,
  type K8sClusterPhase,
  type UpdateK8sClusterRequest,
} from "@/lib/api/types";
import { formatNumber, formatUptime } from "@/lib/formatters";
import { cn, getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

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

export default function ClusterPage({ params }: { params: Promise<{ connId: string }> }) {
  const { connId } = use(params);

  // Static cluster data (Aerospike direct API)
  const {
    data: cluster,
    loading: clusterLoading,
    error: clusterError,
    refetch: refetchCluster,
  } = useAsyncData(() => api.getCluster(connId), [connId]);

  // K8s cluster store
  const k8sClusters = useK8sClusterStore((s) => s.clusters);
  const k8sDetail = useK8sClusterStore((s) => s.selectedCluster);
  const k8sLoading = useK8sClusterStore((s) => s.loading);
  const k8sAvailable = useK8sClusterStore((s) => s.k8sAvailable);
  const fetchClusters = useK8sClusterStore((s) => s.fetchClusters);
  const fetchK8sCluster = useK8sClusterStore((s) => s.fetchCluster);
  const scaleCluster = useK8sClusterStore((s) => s.scaleCluster);
  const deleteCluster = useK8sClusterStore((s) => s.deleteCluster);
  const updateCluster = useK8sClusterStore((s) => s.updateCluster);
  const triggerOperation = useK8sClusterStore((s) => s.triggerOperation);
  const pauseCluster = useK8sClusterStore((s) => s.pauseCluster);
  const resumeCluster = useK8sClusterStore((s) => s.resumeCluster);

  // Ensure K8s clusters are loaded (may not be if navigated directly to this page)
  useEffect(() => {
    if (k8sClusters.length === 0) {
      fetchClusters().catch(() => {
        // K8s not available — silently ignore
      });
    }
  }, [k8sClusters.length, fetchClusters, k8sAvailable]);

  // Derived K8s info — link connection to K8s cluster via connectionId field
  const linkedK8s = k8sClusters.find((c) => c.connectionId === connId);
  const isK8s = !!linkedK8s;
  const k8sNamespace = linkedK8s?.namespace ?? "";
  const k8sName = linkedK8s?.name ?? "";

  // K8s auxiliary state
  const [events, setEvents] = useState<K8sClusterEvent[]>([]);
  const [health, setHealth] = useState<ClusterHealthSummary | null>(null);
  const [selectedPods, setSelectedPods] = useState<string[]>([]);
  const [pendingPodsExpanded, setPendingPodsExpanded] = useState(false);

  // K8s dialog state
  const [scaleOpen, setScaleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [warmRestartConfirmOpen, setWarmRestartConfirmOpen] = useState(false);
  const [podRestartConfirmOpen, setPodRestartConfirmOpen] = useState(false);

  // Fetch K8s data when linked cluster is found
  useEffect(() => {
    if (!isK8s || !k8sNamespace || !k8sName) return;
    fetchK8sCluster(k8sNamespace, k8sName);
    api
      .getK8sClusterEvents(k8sNamespace, k8sName)
      .then(setEvents)
      .catch((err) => console.error("Failed to fetch cluster events:", err));
    api
      .getK8sClusterHealth(k8sNamespace, k8sName)
      .then(setHealth)
      .catch((err) => console.error("Failed to fetch cluster health:", err));
  }, [isK8s, k8sNamespace, k8sName, fetchK8sCluster]);

  // Auto-refresh when K8s cluster is in transitional phase
  useEffect(() => {
    if (!k8sDetail?.phase || !(TRANSITIONAL_PHASES as string[]).includes(k8sDetail.phase)) return;
    const interval = setInterval(() => {
      fetchK8sCluster(k8sNamespace, k8sName);
      api.getK8sClusterEvents(k8sNamespace, k8sName).then(setEvents).catch(console.error);
      api.getK8sClusterHealth(k8sNamespace, k8sName).then(setHealth).catch(console.error);
    }, 5000);
    return () => clearInterval(interval);
  }, [k8sDetail?.phase, k8sNamespace, k8sName, fetchK8sCluster]);

  const handleRefresh = () => {
    refetchCluster();
    if (isK8s && k8sNamespace && k8sName) {
      fetchK8sCluster(k8sNamespace, k8sName);
      api.getK8sClusterEvents(k8sNamespace, k8sName).then(setEvents).catch(console.error);
      api.getK8sClusterHealth(k8sNamespace, k8sName).then(setHealth).catch(console.error);
    }
  };

  const handleK8sEdit = async (data: UpdateK8sClusterRequest) => {
    try {
      await updateCluster(k8sNamespace, k8sName, data);
      toast.success("Cluster updated successfully");
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleK8sScale = async (size: number) => {
    try {
      await scaleCluster(k8sNamespace, k8sName, size);
      toast.success(`Cluster scaled to ${size} nodes`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleK8sDelete = async () => {
    setDeleting(true);
    try {
      await deleteCluster(k8sNamespace, k8sName);
      toast.success(`Cluster "${k8sName}" deletion initiated`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  // Loading state
  if (clusterLoading) {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[180px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  // Error state
  if (clusterError) {
    return (
      <FullPageError
        title="Failed to load cluster info"
        message={clusterError}
        onRetry={refetchCluster}
      />
    );
  }

  if (!cluster) return null;

  const firstNode = cluster.nodes[0];
  const edition = firstNode?.edition ?? "Unknown";
  const build = firstNode?.build ?? "Unknown";

  return (
    <div className="animate-fade-in space-y-6 p-6 lg:p-8">
      {/* ── Page Header ── */}
      <PageHeader
        title="Overview"
        description={
          isK8s && k8sDetail ? (
            <span className="font-mono text-xs">
              {k8sDetail.namespace} / {k8sDetail.image}
            </span>
          ) : (
            <>
              {edition} &middot; Build {build}
            </>
          )
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            {isK8s && k8sDetail && (
              <>
                <Button variant="outline" size="sm" onClick={() => setScaleOpen(true)}>
                  <Scale className="mr-2 h-4 w-4" />
                  Scale
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={k8sLoading}
                  onClick={() => setWarmRestartConfirmOpen(true)}
                >
                  Warm Restart
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={k8sLoading}
                  onClick={() => setPodRestartConfirmOpen(true)}
                >
                  Pod Restart
                </Button>
                {k8sDetail.phase === "Paused" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={k8sLoading}
                    onClick={async () => {
                      try {
                        await resumeCluster(k8sNamespace, k8sName);
                        toast.success("Reconciliation resumed");
                      } catch (err) {
                        toast.error(getErrorMessage(err));
                      }
                    }}
                  >
                    Resume
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={k8sLoading}
                    onClick={async () => {
                      try {
                        await pauseCluster(k8sNamespace, k8sName);
                        toast.success("Reconciliation paused");
                      } catch (err) {
                        toast.error(getErrorMessage(err));
                      }
                    }}
                  >
                    Pause
                  </Button>
                )}
                <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* ── Reconcile Error Alert ── */}
      {isK8s && k8sDetail && k8sDetail.failedReconcileCount > 0 && (
        <InlineAlert
          message={`Reconcile errors: ${k8sDetail.failedReconcileCount} failures. ${k8sDetail.lastReconcileError || ""}`}
        />
      )}

      {/* ══════════════════════════════════════════════
          ACKO 클러스터 전용 레이아웃
          ══════════════════════════════════════════════ */}
      {isK8s && k8sDetail && (
        <>
          {/* ── Hero Row: Phase Status + Health Overview ── */}
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

          {/* ── Details Grid: Cluster Info + Aerospike Info ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Cluster Info Card */}
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
                      <dd className="text-warning font-semibold">
                        {k8sDetail.failedReconcileCount}
                      </dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>

            {/* Aerospike Info Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Database className="text-muted-foreground h-4 w-4" />
                  Aerospike Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{cluster.nodes.length}</span>
                  <span className="text-muted-foreground text-sm">Nodes</span>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase">
                    Namespaces ({cluster.namespaces.length})
                  </p>
                  <p className="text-sm">{cluster.namespaces.map((n) => n.name).join(", ")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase">
                    Node Names
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {cluster.nodes.map((node) => (
                      <Badge key={node.name} variant="outline" className="font-mono text-[11px]">
                        {node.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <p className="text-muted-foreground pt-1 font-mono text-xs">
                  {edition} {build}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Tabs: Nodes / Pods / Conditions / Events ── */}
          <Tabs defaultValue="nodes">
            <TabsList>
              <TabsTrigger value="nodes">
                <Server className="mr-1.5 h-3.5 w-3.5" />
                Nodes ({cluster.nodes.length})
              </TabsTrigger>
              <TabsTrigger value="pods">
                Pods ({k8sDetail.pods.length})
                {k8sDetail.pendingRestartPods.length > 0 && (
                  <Badge
                    variant="outline"
                    className="ml-1.5 px-1.5 text-[10px] bg-warning/10 text-warning border-warning/20"
                  >
                    {k8sDetail.pendingRestartPods.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="conditions">
                Conditions ({k8sDetail.conditions?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="events">
                <Activity className="mr-1.5 h-3.5 w-3.5" />
                Events ({events.length})
              </TabsTrigger>
            </TabsList>

            {/* Nodes Tab */}
            <TabsContent value="nodes" className="mt-4">
              {cluster.nodes.length === 0 ? (
                <EmptyState
                  icon={Server}
                  title="No nodes"
                  description="No nodes found in this cluster."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {cluster.nodes.map((node, idx) => (
                    <Card
                      key={node.name}
                      className="animate-fade-in-up"
                      style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: "backwards" }}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="font-mono text-base">{node.name}</CardTitle>
                          <StatusBadge status="connected" label="Active" />
                        </div>
                        <CardDescription className="font-mono text-xs">
                          {node.address}:{node.port}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground text-xs tracking-wider uppercase">
                              Build
                            </span>
                            <p className="mt-0.5 font-medium">{node.build}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs tracking-wider uppercase">
                              Edition
                            </span>
                            <p className="mt-0.5 font-medium">{node.edition}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs tracking-wider uppercase">
                              Uptime
                            </span>
                            <p className="mt-0.5 flex items-center gap-1 font-medium">
                              <Clock className="text-muted-foreground h-3 w-3" />
                              {formatUptime(node.uptime)}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs tracking-wider uppercase">
                              Connections
                            </span>
                            <p className="metric-value mt-0.5 font-medium">
                              {formatNumber(node.clientConnections)}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs tracking-wider uppercase">
                              Cluster Size
                            </span>
                            <p className="metric-value mt-0.5 font-medium">{node.clusterSize}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Pods Tab */}
            <TabsContent value="pods" className="mt-4 space-y-4">
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
                    onClick={() => setSelectedPods([])}
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
                onSelectionChange={setSelectedPods}
                namespace={k8sNamespace}
                clusterName={k8sName}
              />
            </TabsContent>

            {/* Conditions Tab */}
            <TabsContent value="conditions" className="mt-4">
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
            </TabsContent>

            {/* Events Tab */}
            <TabsContent value="events" className="mt-4">
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
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* ══════════════════════════════════════════════
          Direct Connection 클러스터 레이아웃 (isK8s=false)
          ══════════════════════════════════════════════ */}
      {!isK8s && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="card-interactive">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2 text-xs font-medium tracking-wider uppercase">
                  <Server className="text-accent h-3.5 w-3.5" />
                  Nodes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="metric-value text-3xl font-bold">{cluster.nodes.length}</div>
                <p className="text-muted-foreground mt-1 font-mono text-xs">
                  {edition} {build}
                </p>
              </CardContent>
            </Card>

            <Card className="card-interactive">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2 text-xs font-medium tracking-wider uppercase">
                  <Database className="text-accent h-3.5 w-3.5" />
                  Namespaces
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="metric-value text-3xl font-bold">{cluster.namespaces.length}</div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {cluster.namespaces.map((n) => n.name).join(", ")}
                </p>
              </CardContent>
            </Card>

            <Card className="card-interactive">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2 text-xs font-medium tracking-wider uppercase">
                  <Network className="text-accent h-3.5 w-3.5" />
                  Node Names
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {cluster.nodes.map((node) => (
                    <Badge key={node.name} variant="outline" className="font-mono text-[11px]">
                      {node.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Nodes Section */}
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Server className="text-muted-foreground h-4 w-4" />
              Nodes ({cluster.nodes.length})
            </h2>
            {cluster.nodes.length === 0 ? (
              <EmptyState
                icon={Server}
                title="No nodes"
                description="No nodes found in this cluster."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {cluster.nodes.map((node, idx) => (
                  <Card
                    key={node.name}
                    className="animate-fade-in-up"
                    style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: "backwards" }}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="font-mono text-base">{node.name}</CardTitle>
                        <StatusBadge status="connected" label="Active" />
                      </div>
                      <CardDescription className="font-mono text-xs">
                        {node.address}:{node.port}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs tracking-wider uppercase">
                            Build
                          </span>
                          <p className="mt-0.5 font-medium">{node.build}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs tracking-wider uppercase">
                            Edition
                          </span>
                          <p className="mt-0.5 font-medium">{node.edition}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs tracking-wider uppercase">
                            Uptime
                          </span>
                          <p className="mt-0.5 flex items-center gap-1 font-medium">
                            <Clock className="text-muted-foreground h-3 w-3" />
                            {formatUptime(node.uptime)}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs tracking-wider uppercase">
                            Connections
                          </span>
                          <p className="metric-value mt-0.5 font-medium">
                            {formatNumber(node.clientConnections)}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs tracking-wider uppercase">
                            Cluster Size
                          </span>
                          <p className="metric-value mt-0.5 font-medium">{node.clusterSize}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── K8s Dialogs ── */}
      {isK8s && k8sDetail && (
        <>
          <K8sScaleDialog
            open={scaleOpen}
            onOpenChange={setScaleOpen}
            clusterName={k8sDetail.name}
            currentSize={k8sDetail.size}
            onScale={handleK8sScale}
          />
          <K8sDeleteDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            clusterName={k8sDetail.name}
            onConfirm={handleK8sDelete}
            loading={deleting}
          />
          <K8sEditDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            cluster={k8sDetail}
            onSave={handleK8sEdit}
          />
          <ConfirmDialog
            open={warmRestartConfirmOpen}
            onOpenChange={setWarmRestartConfirmOpen}
            title="Confirm Warm Restart"
            description={
              selectedPods.length > 0
                ? `This will warm-restart ${selectedPods.length} selected pod(s). The operation applies configuration changes without a full pod restart but may briefly affect ongoing requests.`
                : "This will warm-restart all pods in the cluster. The operation applies configuration changes without a full pod restart but may briefly affect ongoing requests."
            }
            confirmLabel="Warm Restart"
            onConfirm={async () => {
              try {
                const pods = selectedPods.length > 0 ? selectedPods : undefined;
                await triggerOperation(k8sNamespace, k8sName, "WarmRestart", pods);
                toast.success(
                  pods
                    ? `Warm restart initiated for ${pods.length} pod(s)`
                    : "Warm restart initiated",
                );
                setSelectedPods([]);
              } catch (err) {
                toast.error(getErrorMessage(err));
              }
            }}
          />
          <ConfirmDialog
            open={podRestartConfirmOpen}
            onOpenChange={setPodRestartConfirmOpen}
            title="Confirm Pod Restart"
            description={
              selectedPods.length > 0
                ? `This will restart ${selectedPods.length} selected pod(s). Pods will be deleted and recreated, which is disruptive and will temporarily reduce cluster capacity.`
                : "This will restart all pods in the cluster. Pods will be deleted and recreated one by one, which is disruptive and will temporarily reduce cluster capacity."
            }
            confirmLabel="Pod Restart"
            variant="destructive"
            onConfirm={async () => {
              try {
                const pods = selectedPods.length > 0 ? selectedPods : undefined;
                await triggerOperation(k8sNamespace, k8sName, "PodRestart", pods);
                toast.success(
                  pods
                    ? `Pod restart initiated for ${pods.length} pod(s)`
                    : "Pod restart initiated for all pods",
                );
                setSelectedPods([]);
              } catch (err) {
                toast.error(getErrorMessage(err));
              }
            }}
          />
        </>
      )}
    </div>
  );
}
