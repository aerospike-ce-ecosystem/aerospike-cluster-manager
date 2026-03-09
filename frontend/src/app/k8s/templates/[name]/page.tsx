"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/common/inline-alert";
import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { K8sTemplateEditDialog } from "@/components/k8s/k8s-template-edit-dialog";
import { useK8sClusterStore } from "@/stores/k8s-cluster-store";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import type { UpdateK8sTemplateRequest } from "@/lib/api/types";

export default function TemplateDetailPage() {
  const router = useRouter();
  const params = useParams<{ name: string }>();
  const { selectedTemplate, loading, error, fetchTemplate, updateTemplate, deleteTemplate } =
    useK8sClusterStore();
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (params.name) {
      fetchTemplate(params.name);
    }
  }, [params.name, fetchTemplate]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteTemplate(params.name);
      toast.success(`Template "${params.name}" deleted`);
      router.push("/k8s/templates");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  };

  const handleCopySpec = async () => {
    if (!selectedTemplate?.spec) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selectedTemplate.spec, null, 2));
      toast.success("Spec copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (loading && !selectedTemplate) {
    return (
      <div className="p-6 lg:p-8">
        <Skeleton className="mb-6 h-8 w-64" />
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  if (!selectedTemplate) {
    return (
      <div className="p-6 lg:p-8">
        <InlineAlert message={error || "Template not found"} />
        <Button variant="outline" className="mt-4" onClick={() => router.push("/k8s/templates")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to AerospikeClusterTemplates
        </Button>
      </div>
    );
  }

  const spec = selectedTemplate.spec;
  const status = selectedTemplate.status || {};
  const usedBy = (status.usedBy as string[]) || [];
  const scheduling = spec.scheduling as Record<string, unknown> | undefined;
  const monitoring = spec.monitoring as Record<string, unknown> | undefined;
  const resources = spec.resources as Record<string, Record<string, string>> | undefined;

  return (
    <div className="animate-fade-in space-y-6 p-6 lg:p-8">
      <PageHeader
        title={selectedTemplate.name}
        description={`Cluster-scoped · Created ${selectedTemplate.age || "unknown"} ago`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/k8s/templates")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Templates
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopySpec}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Spec
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDelete(true)}
              disabled={usedBy.length > 0}
              title={usedBy.length > 0 ? `Used by: ${usedBy.join(", ")}` : undefined}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        }
      />

      <InlineAlert message={error} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Overview Card */}
        <div className="bg-card rounded-xl border p-5">
          <h3 className="mb-3 text-sm font-semibold">Overview</h3>
          <dl className="space-y-2 text-sm">
            {spec.description ? (
              <>
                <dt className="text-muted-foreground text-xs">Description</dt>
                <dd className="text-xs">{String(spec.description)}</dd>
              </>
            ) : null}
            {spec.image ? (
              <>
                <dt className="text-muted-foreground text-xs">Image</dt>
                <dd className="font-mono text-xs">{String(spec.image)}</dd>
              </>
            ) : null}
            {spec.size != null ? (
              <>
                <dt className="text-muted-foreground text-xs">Default Size</dt>
                <dd>{String(spec.size)} nodes</dd>
              </>
            ) : null}
            {scheduling?.podAntiAffinityLevel ? (
              <>
                <dt className="text-muted-foreground text-xs">Anti-Affinity</dt>
                <dd>{String(scheduling.podAntiAffinityLevel)}</dd>
              </>
            ) : null}
            {monitoring?.enabled ? (
              <>
                <dt className="text-muted-foreground text-xs">Monitoring</dt>
                <dd>Port {String(monitoring.port)}</dd>
              </>
            ) : null}
          </dl>
        </div>

        {/* Resources Card */}
        {resources && (
          <div className="bg-card rounded-xl border p-5">
            <h3 className="mb-3 text-sm font-semibold">Resources</h3>
            <dl className="space-y-2 text-sm">
              <dt className="text-muted-foreground text-xs">Requests</dt>
              <dd className="font-mono text-xs">
                CPU: {resources.requests?.cpu || "–"} · Memory: {resources.requests?.memory || "–"}
              </dd>
              <dt className="text-muted-foreground text-xs">Limits</dt>
              <dd className="font-mono text-xs">
                CPU: {resources.limits?.cpu || "–"} · Memory: {resources.limits?.memory || "–"}
              </dd>
            </dl>
          </div>
        )}

        {/* Usage Card */}
        <div className="bg-card rounded-xl border p-5">
          <h3 className="mb-3 text-sm font-semibold">Usage</h3>
          {usedBy.length > 0 ? (
            <ul className="space-y-1">
              {usedBy.map((cluster) => (
                <li key={cluster} className="text-sm">
                  <button
                    className="text-accent hover:underline"
                    onClick={() => {
                      const parts = cluster.split("/");
                      if (parts.length === 2) {
                        router.push(`/k8s/clusters/${parts[0]}/${parts[1]}`);
                      }
                    }}
                  >
                    {cluster}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-xs">No clusters are using this template.</p>
          )}
        </div>
      </div>

      {/* Full Spec */}
      <div className="bg-card rounded-xl border p-5">
        <h3 className="mb-3 text-sm font-semibold">Full Spec</h3>
        <pre className="bg-muted max-h-[50vh] overflow-auto rounded-lg p-4 font-mono text-xs leading-relaxed">
          {JSON.stringify(spec, null, 2)}
        </pre>
      </div>

      <K8sTemplateEditDialog
        open={showEdit}
        onOpenChange={setShowEdit}
        template={selectedTemplate}
        onSave={async (data: UpdateK8sTemplateRequest) => {
          await updateTemplate(params.name, data);
          toast.success("Template updated");
        }}
      />

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete AerospikeClusterTemplate"
        description={`Are you sure you want to delete "${selectedTemplate.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
