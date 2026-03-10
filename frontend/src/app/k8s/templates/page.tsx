"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCode, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { InlineAlert } from "@/components/common/inline-alert";
import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useK8sClusterStore } from "@/stores/k8s-cluster-store";
import { useToastStore } from "@/stores/toast-store";
import { getErrorMessage } from "@/lib/utils";
import type { K8sTemplateSummary } from "@/lib/api/types";

export default function K8sTemplatesPage() {
  const router = useRouter();
  const { templates, loading, error, fetchTemplates, deleteTemplate } = useK8sClusterStore();
  const [deleteTarget, setDeleteTarget] = useState<K8sTemplateSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTemplate(deleteTarget.name);
      useToastStore.getState().addToast("success", `Template "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  if (loading && templates.length === 0) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-8 flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 p-6 lg:p-8">
      <PageHeader
        title="AerospikeClusterTemplates"
        description="Reusable cluster configuration templates"
        actions={
          <div className="flex gap-2">
            <Button variant="neutral" size="sm" onClick={() => fetchTemplates()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="info" onClick={() => router.push("/k8s/templates/new")}>
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">New Template</span>
            </Button>
          </div>
        }
      />

      <InlineAlert message={error} />

      {templates.length === 0 ? (
        <EmptyState
          icon={FileCode}
          title="No AerospikeClusterTemplates"
          description="Create a reusable cluster template to standardize deployments."
          action={
            <Button onClick={() => router.push("/k8s/templates/new")}>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tmpl) => (
            <div
              key={tmpl.name}
              className="bg-base-100 hover:border-accent/50 group cursor-pointer rounded-xl border p-5 shadow-sm transition-all"
              onClick={() => router.push(`/k8s/templates/${tmpl.name}`)}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileCode className="text-accent h-4 w-4 shrink-0" />
                    <h3 className="truncate text-sm font-semibold">{tmpl.name}</h3>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(tmpl);
                  }}
                >
                  <Trash2 className="text-error h-3.5 w-3.5" />
                </Button>
              </div>
              {tmpl.description && (
                <p className="text-base-content/60 mt-2 line-clamp-2 text-xs">{tmpl.description}</p>
              )}
              <div className="mt-3 flex gap-4 text-xs">
                {tmpl.image && (
                  <span className="text-base-content/60 truncate">
                    Image: <span className="text-base-content">{tmpl.image}</span>
                  </span>
                )}
                {tmpl.size != null && (
                  <span className="text-base-content/60">
                    Size: <span className="text-base-content">{tmpl.size}</span>
                  </span>
                )}
              </div>
              {tmpl.age && (
                <p className="text-base-content/60 mt-2 text-[10px]">Created {tmpl.age} ago</p>
              )}
              <div className="mt-2">
                <span className="text-base-content/60 text-[10px]">Referenced By: </span>
                {tmpl.usedBy && tmpl.usedBy.length > 0 ? (
                  <span className="mt-0.5 inline-flex flex-wrap gap-1">
                    {tmpl.usedBy.map((ref) => (
                      <Badge key={ref} variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {ref}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  <span className="text-base-content/60 text-[10px]">&mdash;</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
        title="Delete AerospikeClusterTemplate"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Clusters referencing this template must be updated first. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
