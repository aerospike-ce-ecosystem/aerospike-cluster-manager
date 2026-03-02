"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Scale,
  Trash2,
  RefreshCw,
  Activity,
  X,
  ChevronDown,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { InlineAlert } from "@/components/common/inline-alert";
import { K8sClusterStatusBadge } from "@/components/k8s/k8s-cluster-status-badge";
import { K8sPodTable } from "@/components/k8s/k8s-pod-table";
import { K8sScaleDialog } from "@/components/k8s/k8s-scale-dialog";
import { K8sDeleteDialog } from "@/components/k8s/k8s-delete-dialog";
import { K8sEditDialog } from "@/components/k8s/k8s-edit-dialog";
import { useK8sClusterStore } from "@/stores/k8s-cluster-store";
import { toast } from "sonner";
import { cn, getErrorMessage } from "@/lib/utils";
import {
  TRANSITIONAL_PHASES,
  type K8sClusterEvent,
  type K8sClusterPhase,
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
    triggerOperation,
    pauseCluster,
    resumeCluster,
  } = useK8sClusterStore();
  const [scaleOpen, setScaleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [events, setEvents] = useState<K8sClusterEvent[]>([]);
  const [selectedPods, setSelectedPods] = useState<string[]>([]);
  const [templateSpecOpen, setTemplateSpecOpen] = useState(false);

  const namespace = params?.namespace || "";
  const name = params?.name || "";

  useEffect(() => {
    if (namespace && name) {
      fetchCluster(namespace, name);
      api
        .getK8sClusterEvents(namespace, name)
        .then(setEvents)
        .catch(() => {});
    }
  }, [namespace, name, fetchCluster]);

  // Auto-refresh polling when cluster is in a transitional phase
  useEffect(() => {
    if (
      !selectedCluster?.phase ||
      !(TRANSITIONAL_PHASES as string[]).includes(selectedCluster.phase)
    )
      return;
    const interval = setInterval(() => {
      fetchCluster(namespace, name);
      api
        .getK8sClusterEvents(namespace, name)
        .then(setEvents)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedCluster?.phase, namespace, name, fetchCluster]);

  const handleEdit = async (data: UpdateK8sClusterRequest) => {
    await updateCluster(namespace, name, data);
    toast.success("Cluster updated successfully");
  };

  const handleScale = async (size: number) => {
    try {
      await scaleCluster(namespace, name, size);
      toast.success(`Cluster scaled to ${size} nodes`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCluster(namespace, name);
      toast.success(`Cluster "${name}" deletion initiated`);
      router.push("/k8s/clusters");
    } catch (err) {
      toast.error(getErrorMessage(err));
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
            <Button variant="outline" size="sm" onClick={() => router.push("/k8s/clusters")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchCluster(namespace, name)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
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
              disabled={loading}
              onClick={async () => {
                try {
                  const pods = selectedPods.length > 0 ? selectedPods : undefined;
                  await triggerOperation(namespace, name, "WarmRestart", pods);
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
            >
              Warm Restart
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={async () => {
                try {
                  const pods = selectedPods.length > 0 ? selectedPods : undefined;
                  await triggerOperation(namespace, name, "PodRestart", pods);
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
            {selectedCluster.phase === "Paused" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={async () => {
                  try {
                    await resumeCluster(namespace, name);
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
                disabled={loading}
                onClick={async () => {
                  try {
                    await pauseCluster(namespace, name);
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
        }
      />

      <InlineAlert message={error} />
      {selectedCluster.failedReconcileCount > 0 && (
        <InlineAlert
          message={`Reconcile errors: ${selectedCluster.failedReconcileCount} failures. ${selectedCluster.lastReconcileError || ""}`}
        />
      )}

      {/* Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-normal">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <K8sClusterStatusBadge phase={selectedCluster.phase} />
            {selectedCluster.phaseReason && (
              <p className="text-muted-foreground mt-1 text-xs">{selectedCluster.phaseReason}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-normal">Size</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{selectedCluster.size}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-normal">Image</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-sm">{selectedCluster.image}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-normal">Age</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{selectedCluster.age || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-normal">
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
                  : "bg-muted text-muted-foreground border-border",
              )}
            >
              {selectedCluster.spec?.enableDynamicConfigUpdate ? "Enabled" : "Disabled"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Operation Status */}
      {selectedCluster.operationStatus && (
        <Card>
          <CardHeader>
            <CardTitle>Active Operation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">{selectedCluster.operationStatus.kind}</span>
              <span className="text-muted-foreground">Phase</span>
              <K8sClusterStatusBadge
                phase={selectedCluster.operationStatus.phase as K8sClusterPhase}
              />
              <span className="text-muted-foreground">Completed</span>
              <span className="font-medium">
                {selectedCluster.operationStatus.completedPods.length} pods
              </span>
              {selectedCluster.operationStatus.failedPods.length > 0 && (
                <>
                  <span className="text-muted-foreground">Failed</span>
                  <span className="text-destructive font-medium">
                    {selectedCluster.operationStatus.failedPods.join(", ")}
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conditions */}
      {selectedCluster.conditions && selectedCluster.conditions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {selectedCluster.conditions.map((cond, i) => (
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
          />
        </CardContent>
      </Card>

      {/* Events */}
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {events.slice(0, 20).map((event, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
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
          </CardContent>
        </Card>
      )}

      {/* Spec (collapsible JSON) */}
      <Card>
        <CardHeader>
          <CardTitle>Spec</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted max-h-80 overflow-auto rounded-lg p-4 font-mono text-xs">
            {JSON.stringify(selectedCluster.spec, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {/* Template Snapshot */}
      {selectedCluster.status?.templateSnapshot != null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              Template Snapshot
              <Badge
                variant="outline"
                className={cn(
                  "text-[11px]",
                  (selectedCluster.status.templateSnapshot as Record<string, unknown>).synced
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-warning/10 text-warning border-warning/20",
                )}
              >
                {(selectedCluster.status.templateSnapshot as Record<string, unknown>).synced
                  ? "Synced"
                  : "Out of Sync"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div>
                  <span className="text-muted-foreground text-xs">Template Name</span>
                  <p className="font-medium">
                    {String(
                      (selectedCluster.status.templateSnapshot as Record<string, unknown>)
                        .templateName || "-",
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Resource Version</span>
                  <p className="font-mono text-xs">
                    {String(
                      (selectedCluster.status.templateSnapshot as Record<string, unknown>)
                        .resourceVersion || "-",
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Snapshot Time</span>
                  <p className="text-xs">
                    {String(
                      (selectedCluster.status.templateSnapshot as Record<string, unknown>)
                        .snapshotTimestamp || "-",
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Sync Status</span>
                  <p className="text-xs">
                    {(selectedCluster.status.templateSnapshot as Record<string, unknown>).synced
                      ? "Up to date"
                      : "Template has been updated since last sync"}
                  </p>
                </div>
              </div>
              <div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium transition-colors"
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
                  <pre className="bg-muted mt-2 max-h-60 overflow-auto rounded-lg p-4 font-mono text-xs">
                    {JSON.stringify(
                      (selectedCluster.status.templateSnapshot as Record<string, unknown>).spec ||
                        selectedCluster.status.templateSnapshot,
                      null,
                      2,
                    )}
                  </pre>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

      <K8sEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        cluster={selectedCluster}
        onSave={handleEdit}
      />
    </div>
  );
}
