"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { InlineAlert } from "@/components/common/inline-alert";
import { PageHeader } from "@/components/common/page-header";
import { K8sClusterCard } from "@/components/k8s/k8s-cluster-card";
import { K8sDeleteDialog } from "@/components/k8s/k8s-delete-dialog";
import { useK8sClusterStore } from "@/stores/k8s-cluster-store";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { TRANSITIONAL_PHASES, type K8sClusterSummary } from "@/lib/api/types";

export default function K8sClustersPage() {
  const router = useRouter();
  const { clusters, loading, error, fetchClusters, deleteCluster } = useK8sClusterStore();
  const [deleteTarget, setDeleteTarget] = useState<K8sClusterSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  // Auto-refresh polling when any cluster is in a transitional phase
  useEffect(() => {
    const hasTransitional = clusters.some((c) =>
      (TRANSITIONAL_PHASES as string[]).includes(c.phase),
    );
    if (!hasTransitional) return;
    const interval = setInterval(() => {
      fetchClusters();
    }, 10000);
    return () => clearInterval(interval);
  }, [clusters, fetchClusters]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCluster(deleteTarget.namespace, deleteTarget.name);
      toast.success(`Cluster "${deleteTarget.name}" deletion initiated`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  if (loading && clusters.length === 0) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-8 flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[160px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 p-6 lg:p-8">
      <PageHeader
        title="K8s Clusters"
        description="Manage Aerospike clusters on Kubernetes"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fetchClusters()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button onClick={() => router.push("/k8s/clusters/new")}>
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Create Cluster</span>
            </Button>
          </div>
        }
      />

      <InlineAlert message={error} />

      {clusters.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No K8s clusters"
          description="Create your first Aerospike cluster on Kubernetes."
          action={
            <Button onClick={() => router.push("/k8s/clusters/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Cluster
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clusters.map((cluster, idx) => (
            <K8sClusterCard
              key={`${cluster.namespace}/${cluster.name}`}
              cluster={cluster}
              index={idx}
              onClick={() => router.push(`/k8s/clusters/${cluster.namespace}/${cluster.name}`)}
            />
          ))}
        </div>
      )}

      <K8sDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        clusterName={deleteTarget?.name || ""}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
