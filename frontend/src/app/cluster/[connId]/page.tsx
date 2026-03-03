"use client";

import { use, useEffect, useState } from "react";
import { Pencil, RefreshCw, Scale, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/page-header";
import { FullPageError } from "@/components/common/full-page-error";
import { InlineAlert } from "@/components/common/inline-alert";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { K8sScaleDialog } from "@/components/k8s/k8s-scale-dialog";
import { K8sDeleteDialog } from "@/components/k8s/k8s-delete-dialog";
import { K8sEditDialog } from "@/components/k8s/k8s-edit-dialog";
import { ClusterOverviewTab } from "@/components/k8s/cluster-overview-tab";
import { ClusterAckoInfoTab } from "@/components/k8s/cluster-acko-info-tab";
import { useAsyncData } from "@/hooks/use-async-data";
import { useK8sClusterStore } from "@/stores/k8s-cluster-store";
import { api } from "@/lib/api/client";
import {
  TRANSITIONAL_PHASES,
  type ClusterHealthSummary,
  type K8sClusterEvent,
  type UpdateK8sClusterRequest,
} from "@/lib/api/types";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

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
  const [activeTab, setActiveTab] = useState<"overview" | "acko-info">("overview");

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
          ACKO 클러스터 전용 레이아웃 — Overview | ACKO INFO 탭
          ══════════════════════════════════════════════ */}
      {isK8s && k8sDetail && (
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "overview" | "acko-info")}
        >
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="acko-info">ACKO INFO</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <ClusterOverviewTab cluster={cluster} />
          </TabsContent>

          <TabsContent value="acko-info" className="mt-6">
            <ClusterAckoInfoTab
              k8sDetail={k8sDetail}
              health={health}
              events={events}
              selectedPods={selectedPods}
              onSelectPods={setSelectedPods}
              namespace={k8sNamespace}
              clusterName={k8sName}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* ══════════════════════════════════════════════
          Direct Connection 클러스터 레이아웃 (isK8s=false)
          ══════════════════════════════════════════════ */}
      {!isK8s && <ClusterOverviewTab cluster={cluster} />}

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
