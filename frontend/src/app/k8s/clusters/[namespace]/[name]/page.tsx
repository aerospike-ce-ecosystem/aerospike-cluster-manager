"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Scale,
  Trash2,
  RefreshCw,
  X,
  ChevronDown,
  ChevronRight,
  Pencil,
  Clock,
  AlertTriangle,
  Copy,
  Gauge,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { InlineAlert } from "@/components/common/inline-alert";
import { K8sClusterStatusBadge } from "@/components/k8s/k8s-cluster-status-badge";
import { K8sConfigDriftCard } from "@/components/k8s/k8s-config-drift-card";
import { K8sPodTable } from "@/components/k8s/k8s-pod-table";
import { K8sScaleDialog } from "@/components/k8s/k8s-scale-dialog";
import { K8sDeleteDialog } from "@/components/k8s/k8s-delete-dialog";
import { K8sEventTimeline } from "@/components/k8s/k8s-event-timeline";
import { K8sEditDialog } from "@/components/k8s/k8s-edit-dialog";
import { K8sHPADialog } from "@/components/k8s/k8s-hpa-dialog";
import { K8sReconciliationHealth } from "@/components/k8s/k8s-reconciliation-health";
import { K8sMigrationStatus } from "@/components/k8s/k8s-migration-status";
import { K8sOperationStatus } from "@/components/k8s/k8s-operation-status";
import { K8sRackTopology } from "@/components/k8s/k8s-rack-topology";
import { K8sOperationTriggerDialog } from "@/components/k8s/k8s-operation-trigger-dialog";
import { K8sPVCStatus } from "@/components/k8s/k8s-pvc-status";
import { PauseResumeButton } from "@/components/k8s/pause-resume-button";
import { K8sCloneDialog } from "@/components/k8s/k8s-clone-dialog";
import { useK8sClusterStore } from "@/stores/k8s-cluster-store";
import { useToastStore } from "@/stores/toast-store";
import { cn, getErrorMessage } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/formatters";
import {
  TRANSITIONAL_PHASES,
  type MigrationStatus,
  type UpdateK8sClusterRequest,
} from "@/lib/api/types";
import { api } from "@/lib/api/client";

export default function K8sClusterDetailPage() {
  const params = useParams<{ namespace: string; name: string }>();
  const router = useRouter();
  const {
    selectedCluster,
    loading,
    error,
    fetchCluster,
    scaleCluster,
    deleteCluster,
    updateCluster,
    resyncTemplate,
    pauseCluster,
    resumeCluster,
    detailEvents: events,
    detailHealth: health,
    startDetailPolling,
    stopDetailPolling,
    clearDetailData,
  } = useK8sClusterStore();
  const [scaleOpen, setScaleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [hpaOpen, setHpaOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [selectedPods, setSelectedPods] = useState<string[]>([]);
  const [templateSpecOpen, setTemplateSpecOpen] = useState(false);
  const [operationDialogOpen, setOperationDialogOpen] = useState(false);
  const [operationDialogKind, setOperationDialogKind] = useState<"WarmRestart" | "PodRestart">(
    "WarmRestart",
  );
  const [cloneOpen, setCloneOpen] = useState(false);
  const [pendingPodsExpanded, setPendingPodsExpanded] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);

  const namespace = params?.namespace || "";
  const name = params?.name || "";

  const operationInProgress =
    selectedCluster?.operationStatus?.phase === "InProgress" ||
    selectedCluster?.operationStatus?.phase === "Running";

  const handleMigrationUpdate = useCallback((status: MigrationStatus | null) => {
    setMigrationStatus(status);
  }, []);

  useEffect(() => {
    if (namespace && name) {
      fetchCluster(namespace, name);
    }
  }, [namespace, name, fetchCluster]);

  // Fetch events and health once after initial cluster load, then keep polling when in a transitional phase.
  // startDetailPolling already fetches events and health on each tick (including the first immediate call),
  // so we delegate entirely to it when polling is active to avoid duplicate in-flight requests.
  useEffect(() => {
    if (!selectedCluster?.phase) return;

    const isTransitional = (TRANSITIONAL_PHASES as string[]).includes(selectedCluster.phase);

    if (isTransitional) {
      startDetailPolling(namespace, name);
      return () => stopDetailPolling();
    }

    // Non-transitional phase: fetch once without starting a polling interval.
    Promise.all([
      api.getK8sClusterEvents(namespace, name).catch(() => {
        return useK8sClusterStore.getState().detailEvents;
      }),
      api.getK8sClusterHealth(namespace, name).catch(() => {
        return useK8sClusterStore.getState().detailHealth;
      }),
    ]).then(([events, health]) => {
      useK8sClusterStore.setState({ detailEvents: events, detailHealth: health });
    });
  }, [selectedCluster?.phase, namespace, name, startDetailPolling, stopDetailPolling]);

  // Clear detail data when navigating away from this page entirely
  useEffect(() => {
    return () => {
      stopDetailPolling();
      clearDetailData();
    };
  }, [stopDetailPolling, clearDetailData]);

  const handleEdit = async (data: UpdateK8sClusterRequest) => {
    try {
      await updateCluster(namespace, name, data);
      useToastStore.getState().addToast("success", "Cluster updated successfully");
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    }
  };

  const handleScale = async (size: number) => {
    try {
      await scaleCluster(namespace, name, size);
      useToastStore.getState().addToast("success", `Cluster scaled to ${size} nodes`);
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCluster(namespace, name);
      useToastStore.getState().addToast("success", `Cluster "${name}" deletion initiated`);
      router.push("/k8s/clusters");
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !selectedCluster) {
    return (
      <div className="p-6 lg:p-8">
        <Skeleton className="mb-6 h-8 w-64" />
        <div className="space-y-4">
          <Skeleton className="h-[200px] rounded-xl" />
          <Skeleton className="h-[300px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!selectedCluster) {
    return (
      <div className="p-6 lg:p-8">
        <InlineAlert message={error || "Cluster not found"} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 p-6 lg:p-8">
      <PageHeader
        title={selectedCluster.name}
        description={`${selectedCluster.namespace} / ${selectedCluster.image}`}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => router.push("/k8s/clusters")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button variant="neutral" size="sm" onClick={() => fetchCluster(namespace, name)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="info" size="sm" onClick={() => setScaleOpen(true)}>
              <Scale className="mr-2 h-4 w-4" />
              Scale
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="info" size="sm" onClick={() => setHpaOpen(true)}>
              <Gauge className="mr-2 h-4 w-4" />
              HPA
            </Button>
            <Button
              variant="warning"
              size="sm"
              disabled={loading || operationInProgress}
              title={operationInProgress ? "Another operation is in progress" : undefined}
              onClick={() => {
                setOperationDialogKind("WarmRestart");
                setOperationDialogOpen(true);
              }}
            >
              Warm Restart
            </Button>
            <Button
              variant="warning"
              size="sm"
              disabled={loading || operationInProgress}
              title={operationInProgress ? "Another operation is in progress" : undefined}
              onClick={() => {
                setOperationDialogKind("PodRestart");
                setOperationDialogOpen(true);
              }}
            >
              Pod Restart
            </Button>
            {selectedPods.length > 0 && (
              <>
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
              </>
            )}
            <PauseResumeButton
              namespace={namespace}
              name={name}
              phase={selectedCluster.phase}
              disabled={loading}
              pauseCluster={pauseCluster}
              resumeCluster={resumeCluster}
            />
            <Button variant="outline" size="sm" onClick={() => setCloneOpen(true)}>
              <Copy className="mr-2 h-4 w-4" />
              Clone
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </>
        }
      />

      <InlineAlert message={error} />

      {/* Split-brain detection warning */}
      {selectedCluster.splitBrainDetected && (
        <div className="border-warning/50 bg-warning/10 flex items-center gap-2 rounded-lg border p-3">
          <AlertTriangle className="text-warning h-5 w-5 shrink-0" />
          <div>
            <p className="text-warning text-sm font-medium">Split-brain Detected</p>
            <p className="text-base-content/60 text-xs">
              Aerospike cluster size ({selectedCluster.aerospikeClusterSize}) differs from expected
              pod count ({selectedCluster.size}). Nodes may not be forming a single cluster.
            </p>
          </div>
        </div>
      )}

      <K8sReconciliationHealth
        namespace={namespace}
        name={name}
        onResetCircuitBreaker={async () => {
          try {
            await api.resetK8sCircuitBreaker(namespace, name);
            useToastStore.getState().addToast("success", "Circuit breaker reset triggered");
            fetchCluster(namespace, name);
          } catch (err) {
            useToastStore.getState().addToast("error", getErrorMessage(err));
          }
        }}
      />

      <K8sMigrationStatus namespace={namespace} name={name} onUpdate={handleMigrationUpdate} />

      {/* Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base-content/60 text-sm font-normal">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <K8sClusterStatusBadge phase={selectedCluster.phase} />
            {selectedCluster.phaseReason && (
              <p className="text-base-content/60 mt-1 text-xs">{selectedCluster.phaseReason}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base-content/60 text-sm font-normal">Size</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{selectedCluster.size}</p>
            {selectedCluster.aerospikeClusterSize != null &&
              selectedCluster.aerospikeClusterSize !== selectedCluster.size && (
                <p className="text-base-content/60 mt-1 text-xs">
                  AS cluster-size: {selectedCluster.aerospikeClusterSize}
                </p>
              )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base-content/60 text-sm font-normal">Image</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-sm">{selectedCluster.image}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base-content/60 text-sm font-normal">Age</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{selectedCluster.age || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base-content/60 text-sm font-normal">
              Dynamic Config
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant="outline"
              className={cn(
                "text-[11px]",
                selectedCluster.spec?.enableDynamicConfigUpdate
                  ? "bg-success/10 text-success border-success/20"
                  : "bg-base-200 text-base-content/60 border-base-300",
              )}
            >
              {selectedCluster.spec?.enableDynamicConfigUpdate ? "Enabled" : "Disabled"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Config Drift */}
      <K8sConfigDriftCard namespace={namespace} name={name} />

      {/* Cluster Health */}
      {health && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cluster Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {health.readyPods}/{health.desiredPods}
                </p>
                <p className="text-base-content/60 text-xs">Pods Ready</p>
              </div>
              <div className="text-center">
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
                <p className="text-base-content/60 mt-1 text-xs">Migration</p>
              </div>
              <div className="text-center">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px]",
                    health.configApplied
                      ? "bg-success/10 text-success border-success/20"
                      : "bg-warning/10 text-warning border-warning/20",
                  )}
                >
                  {health.configApplied ? "Applied" : "Pending"}
                </Badge>
                <p className="text-base-content/60 mt-1 text-xs">Config</p>
              </div>
              <div className="text-center">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px]",
                    health.available
                      ? "bg-success/10 text-success border-success/20"
                      : "bg-error/10 text-error border-error/20",
                  )}
                >
                  {health.available ? "Available" : "Unavailable"}
                </Badge>
                <p className="text-base-content/60 mt-1 text-xs">Availability</p>
              </div>
              {health.pendingRestartCount > 0 && (
                <div className="text-center">
                  <p className="text-warning text-2xl font-bold">{health.pendingRestartCount}</p>
                  <p className="text-base-content/60 text-xs">Pending Restart</p>
                </div>
              )}
              {health.rackDistribution.length > 1 && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    {health.rackDistribution.map((r) => (
                      <Badge key={r.id} variant="outline" className="px-1.5 text-[10px]">
                        R{r.id}: {r.ready}/{r.total}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-base-content/60 mt-1 text-xs">Rack Distribution</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rack Topology */}
      <K8sRackTopology
        rackConfig={selectedCluster.spec?.rackConfig}
        pods={selectedCluster.pods}
        migrationStatus={migrationStatus}
      />

      {/* PVC / Storage Status */}
      <K8sPVCStatus namespace={namespace} name={name} />

      {/* Status Dashboard: Pending Restart Pods, Last Reconcile, Operator Version */}
      {(selectedCluster.pendingRestartPods.length > 0 ||
        selectedCluster.lastReconcileTime ||
        selectedCluster.operatorVersion ||
        selectedCluster.aerospikeClusterSize != null) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {selectedCluster.aerospikeClusterSize != null && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base-content/60 text-sm font-normal">
                  Aerospike Cluster Size
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{selectedCluster.aerospikeClusterSize}</p>
                <p className="text-base-content/60 mt-1 text-xs">
                  Reported by asinfo (spec: {selectedCluster.size})
                </p>
              </CardContent>
            </Card>
          )}
          {selectedCluster.pendingRestartPods.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base-content/60 flex items-center gap-1.5 text-sm font-normal">
                  <AlertTriangle className="text-warning h-3.5 w-3.5" />
                  Pending Restart
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{selectedCluster.pendingRestartPods.length}</p>
                <button
                  type="button"
                  className="text-base-content/60 hover:text-base-content mt-1 flex items-center gap-1 text-xs transition-colors"
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
                    {selectedCluster.pendingRestartPods.map((pod) => (
                      <li key={pod} className="font-mono text-xs">
                        {pod}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
          {selectedCluster.lastReconcileTime && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base-content/60 flex items-center gap-1.5 text-sm font-normal">
                  <Clock className="h-3.5 w-3.5" />
                  Last Reconcile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">
                  {formatRelativeTime(selectedCluster.lastReconcileTime)}
                </p>
                <p
                  className="text-base-content/60 mt-1 text-[10px]"
                  title={selectedCluster.lastReconcileTime}
                >
                  {selectedCluster.lastReconcileTime}
                </p>
              </CardContent>
            </Card>
          )}
          {selectedCluster.operatorVersion && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base-content/60 text-sm font-normal">
                  Operator Version
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-sm">{selectedCluster.operatorVersion}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Rolling Update Strategy */}
      {Boolean(
        selectedCluster.spec?.rollingUpdateBatchSize ||
        selectedCluster.spec?.maxUnavailable ||
        selectedCluster.spec?.disablePDB,
      ) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Rolling Update Strategy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-base-content/60 text-xs">Batch Size</span>
                <p className="font-medium">
                  {String(selectedCluster.spec?.rollingUpdateBatchSize ?? "-")}
                </p>
              </div>
              <div>
                <span className="text-base-content/60 text-xs">Max Unavailable</span>
                <p className="font-medium">{String(selectedCluster.spec?.maxUnavailable ?? "-")}</p>
              </div>
              <div>
                <span className="text-base-content/60 text-xs">PDB</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px]",
                    selectedCluster.spec?.disablePDB
                      ? "bg-warning/10 text-warning border-warning/20"
                      : "bg-success/10 text-success border-success/20",
                  )}
                >
                  {selectedCluster.spec?.disablePDB ? "Disabled" : "Enabled"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Operation Status */}
      {selectedCluster.operationStatus && (
        <K8sOperationStatus
          operationStatus={selectedCluster.operationStatus}
          totalPodCount={selectedCluster.pods.length}
          onClear={async () => {
            try {
              await api.clearK8sClusterOperations(namespace, name);
              fetchCluster(namespace, name);
            } catch (err) {
              useToastStore.getState().addToast("error", getErrorMessage(err));
            }
          }}
        />
      )}

      {/* Conditions */}
      {selectedCluster.conditions && selectedCluster.conditions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {selectedCluster.conditions.map((cond) => (
                <div
                  key={cond.type}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        cond.status === "True" ? "bg-success" : "bg-base-content/40",
                      )}
                    />
                    <span className="font-medium">{cond.type}</span>
                  </div>
                  <div className="text-base-content/60 flex items-center gap-4">
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
          </CardContent>
        </Card>
      )}

      {/* Pods */}
      <Card>
        <CardHeader>
          <CardTitle>Pods</CardTitle>
        </CardHeader>
        <CardContent>
          <K8sPodTable
            pods={selectedCluster.pods}
            selectable
            selectedPods={selectedPods}
            onSelectionChange={setSelectedPods}
            namespace={namespace}
            clusterName={name}
            migrationStatus={migrationStatus}
          />
        </CardContent>
      </Card>

      {/* Events */}
      {events.length > 0 && <K8sEventTimeline events={events} />}

      {/* Spec (collapsible JSON) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Spec
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const result = await api.getK8sClusterYaml(namespace, name);
                    await navigator.clipboard.writeText(JSON.stringify(result.yaml, null, 2));
                    useToastStore.getState().addToast("success", "CR YAML copied to clipboard");
                  } catch (err) {
                    useToastStore.getState().addToast("error", getErrorMessage(err));
                  }
                }}
              >
                <Copy className="mr-2 h-3 w-3" />
                Copy CR
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const result = await api.getK8sClusterYaml(namespace, name);
                    const json = JSON.stringify(result.yaml, null, 2);
                    const blob = new Blob([json], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${name}.${namespace}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    useToastStore.getState().addToast("success", "CR exported");
                  } catch (err) {
                    useToastStore.getState().addToast("error", getErrorMessage(err));
                  }
                }}
              >
                <Download className="mr-2 h-3 w-3" />
                Export
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-base-200 max-h-80 overflow-auto rounded-lg p-4 font-mono text-xs">
            {JSON.stringify(selectedCluster.spec, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {/* Template Snapshot */}
      {(() => {
        const templateSnapshot = selectedCluster.templateSnapshot;
        if (templateSnapshot == null) return null;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                Template Snapshot
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px]",
                    templateSnapshot.synced
                      ? "bg-success/10 text-success border-success/20"
                      : "bg-warning/10 text-warning border-warning/20",
                  )}
                >
                  {templateSnapshot.synced ? "Synced" : "Out of Sync"}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resyncing || loading}
                  className="ml-auto"
                  onClick={async () => {
                    setResyncing(true);
                    try {
                      await resyncTemplate(namespace, name);
                      useToastStore.getState().addToast("success", "Template resync triggered");
                    } catch (err) {
                      useToastStore.getState().addToast("error", getErrorMessage(err));
                    } finally {
                      setResyncing(false);
                    }
                  }}
                >
                  <RefreshCw className={cn("mr-2 h-4 w-4", resyncing && "animate-spin")} />
                  Resync
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {templateSnapshot.synced === false && (
                  <div className="bg-warning/10 text-warning border-warning/20 flex items-start gap-2 rounded-lg border p-3 text-sm">
                    <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-medium">Template out of sync</p>
                      <p className="text-warning/80 text-xs">
                        The source template has been updated since the last snapshot. Click
                        &quot;Resync&quot; to pull the latest template changes into this cluster.
                      </p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div>
                    <span className="text-base-content/60 text-xs">Template Name</span>
                    <p className="font-medium">{String(templateSnapshot.name || "-")}</p>
                  </div>
                  <div>
                    <span className="text-base-content/60 text-xs">Resource Version</span>
                    <p className="font-mono text-xs">
                      {String(templateSnapshot.resourceVersion || "-")}
                    </p>
                  </div>
                  <div>
                    <span className="text-base-content/60 text-xs">Snapshot Time</span>
                    <p className="text-xs">{String(templateSnapshot.snapshotTimestamp || "-")}</p>
                  </div>
                  <div>
                    <span className="text-base-content/60 text-xs">Sync Status</span>
                    <p className="text-xs">
                      {templateSnapshot.synced
                        ? "Up to date"
                        : "Template has been updated since last sync"}
                    </p>
                  </div>
                </div>
                <div>
                  <button
                    type="button"
                    className="text-base-content/60 hover:text-base-content flex items-center gap-1 text-xs font-medium transition-colors"
                    onClick={() => setTemplateSpecOpen(!templateSpecOpen)}
                  >
                    {templateSpecOpen ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    Template Spec
                  </button>
                  {templateSpecOpen && (
                    <pre className="bg-base-200 mt-2 max-h-60 overflow-auto rounded-lg p-4 font-mono text-xs">
                      {JSON.stringify(templateSnapshot.spec || templateSnapshot, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Dialogs */}
      <K8sScaleDialog
        open={scaleOpen}
        onOpenChange={setScaleOpen}
        clusterName={selectedCluster.name}
        currentSize={selectedCluster.size}
        onScale={handleScale}
      />

      <K8sDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        clusterName={selectedCluster.name}
        onConfirm={handleDelete}
        loading={deleting}
      />

      <K8sCloneDialog
        open={cloneOpen}
        onOpenChange={setCloneOpen}
        sourceNamespace={namespace}
        sourceName={name}
        onCloned={(ns, clonedName) => {
          useToastStore.getState().addToast("success", `Cluster "${clonedName}" created`);
          router.push(`/k8s/clusters/${ns}/${clonedName}`);
        }}
      />

      <K8sEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        cluster={selectedCluster}
        onSave={handleEdit}
      />

      <K8sHPADialog
        open={hpaOpen}
        onOpenChange={setHpaOpen}
        namespace={namespace}
        clusterName={name}
      />

      <K8sOperationTriggerDialog
        open={operationDialogOpen}
        onOpenChange={setOperationDialogOpen}
        namespace={namespace}
        clusterName={name}
        pods={selectedCluster.pods}
        initialSelectedPods={selectedPods}
        initialKind={operationDialogKind}
        operationPhase={selectedCluster.operationStatus?.phase}
        onSuccess={() => {
          setSelectedPods([]);
          fetchCluster(namespace, name);
        }}
      />
    </div>
  );
}
