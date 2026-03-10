"use client";

import { use, useEffect, useState, useCallback, useMemo } from "react";
import { useAsyncData } from "@/hooks/use-async-data";
import { Plus, Trash2, RefreshCw, ListTree } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { InlineAlert } from "@/components/common/inline-alert";
import { LoadingButton } from "@/components/common/loading-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { api } from "@/lib/api/client";
import type { SecondaryIndex, IndexType, ClusterInfo } from "@/lib/api/types";
import { getErrorMessage } from "@/lib/utils";
import { useToastStore } from "@/stores/toast-store";

const INDEX_TYPES: { value: IndexType; label: string }[] = [
  { value: "numeric", label: "Numeric" },
  { value: "string", label: "String" },
  { value: "geo2dsphere", label: "Geo2DSphere" },
];

function indexTypeBadgeVariant(type: IndexType): "default" | "secondary" | "outline" {
  switch (type) {
    case "numeric":
      return "default";
    case "string":
      return "secondary";
    case "geo2dsphere":
      return "outline";
    default:
      return "secondary";
  }
}

export default function IndexesPage({ params }: { params: Promise<{ connId: string }> }) {
  const { connId } = use(params);
  const {
    data: indexes,
    loading,
    error,
    refetch: fetchIndexes,
  } = useAsyncData(() => api.getIndexes(connId), [connId]);

  // Cluster info for namespace dropdown
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [formNamespace, setFormNamespace] = useState("");
  const [formSet, setFormSet] = useState("");
  const [formBin, setFormBin] = useState("");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<IndexType>("numeric");
  const [creating, setCreating] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<SecondaryIndex | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCluster = useCallback(async () => {
    try {
      const info = await api.getCluster(connId);
      setClusterInfo(info);
      if (info.namespaces.length > 0) {
        setFormNamespace((prev) => prev || info.namespaces[0].name);
      }
    } catch {
      // Cluster info is optional for this page
    }
  }, [connId]);

  useEffect(() => {
    fetchCluster();
  }, [fetchCluster]);

  const handleCreate = async () => {
    if (!formNamespace || !formBin.trim() || !formName.trim()) {
      useToastStore.getState().addToast("error", "All fields are required");
      return;
    }
    setCreating(true);
    try {
      await api.createIndex(connId, {
        namespace: formNamespace,
        set: formSet.trim(),
        bin: formBin.trim(),
        name: formName.trim(),
        type: formType,
      });
      useToastStore.getState().addToast("success", "Index created");
      setCreateOpen(false);
      setFormSet("");
      setFormBin("");
      setFormName("");
      await fetchIndexes();
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteIndex(connId, deleteTarget.name, deleteTarget.namespace);
      useToastStore.getState().addToast("success", "Index deleted");
      setDeleteTarget(null);
      await fetchIndexes();
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const namespaces = clusterInfo?.namespaces ?? [];

  const indexColumns = useMemo<ColumnDef<SecondaryIndex>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ getValue }) => (
          <span className="font-mono font-medium">{getValue() as string}</span>
        ),
        meta: { mobileSlot: "title", mobileLabel: "Index" },
      },
      {
        accessorKey: "namespace",
        header: "Namespace",
        meta: { mobileSlot: "meta" },
      },
      {
        accessorKey: "set",
        header: "Set",
        cell: ({ getValue }) => {
          const val = getValue() as string;
          return val ? val : <span className="text-muted-foreground italic">all</span>;
        },
        meta: { hideOn: ["mobile"], mobileSlot: "meta", mobileLabel: "Set" },
      },
      {
        accessorKey: "bin",
        header: "Bin",
        cell: ({ getValue }) => <span className="font-mono">{getValue() as string}</span>,
        meta: { mobileSlot: "content" },
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ getValue }) => {
          const type = getValue() as IndexType;
          return <Badge variant={indexTypeBadgeVariant(type)}>{type}</Badge>;
        },
        meta: { mobileSlot: "meta" },
      },
      {
        accessorKey: "state",
        header: "State",
        cell: ({ getValue }) => {
          const state = getValue() as string;
          return (
            <StatusBadge
              status={state === "ready" ? "ready" : state === "building" ? "building" : "error"}
            />
          );
        },
        meta: { hideOn: ["mobile"], mobileSlot: "meta" },
      },
      {
        id: "actions",
        header: "Actions",
        size: 80,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            className="text-error h-8 w-8 p-0"
            onClick={() => setDeleteTarget(row.original)}
            aria-label="Delete index"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ),
        meta: { mobileSlot: "actions" },
      },
    ],
    [],
  );

  return (
    <div className="animate-fade-in space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Secondary Indexes"
        description="Manage secondary indexes for faster queries"
        actions={
          <>
            <Button variant="neutral" size="sm" onClick={fetchIndexes}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="info" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Index
            </Button>
          </>
        }
      />

      <InlineAlert message={error} />

      {/* Table */}
      <DataTable
        data={indexes ?? []}
        columns={indexColumns}
        loading={loading}
        emptyState={
          !error ? (
            <EmptyState
              icon={ListTree}
              title="No secondary indexes"
              description="Create an index to speed up queries on specific bins."
              action={
                <Button variant="info" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Index
                </Button>
              }
            />
          ) : undefined
        }
        className="border-base-300/60 rounded-lg border"
        testId="indexes-table"
        mobileLayout="cards"
      />

      {/* Create Index Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create Secondary Index</DialogTitle>
            <DialogDescription>Create a new secondary index on a bin.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Namespace</Label>
              <Select value={formNamespace} onChange={(e) => setFormNamespace(e.target.value)}>
                <option value="">Select namespace</option>
                {namespaces.map((ns) => (
                  <option key={ns.name} value={ns.name}>
                    {ns.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Set (optional)</Label>
              <Input
                placeholder="set name"
                value={formSet}
                onChange={(e) => setFormSet(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Bin</Label>
              <Input
                placeholder="bin name"
                value={formBin}
                onChange={(e) => setFormBin(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Index Name</Label>
              <Input
                placeholder="idx_my_bin"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={formType} onChange={(e) => setFormType(e.target.value as IndexType)}>
                {INDEX_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <LoadingButton
              onClick={handleCreate}
              disabled={creating || !formNamespace || !formBin.trim() || !formName.trim()}
              loading={creating}
            >
              Create
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Index"
        description={`Are you sure you want to delete index "${deleteTarget?.name}"? This may impact query performance.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
