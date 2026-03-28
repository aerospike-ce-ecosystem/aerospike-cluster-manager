"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Boxes, Loader2, Wifi, WifiOff, Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { InlineAlert } from "@/components/common/inline-alert";
import { LoadingButton } from "@/components/common/loading-button";
import { PageHeader } from "@/components/common/page-header";
import { ClusterCardList } from "@/components/cluster-list/cluster-card-list";
import { K8sImportDialog } from "@/components/k8s/k8s-import-dialog";
import { useConnectionStore } from "@/stores/connection-store";
import { useClusterListStore } from "@/stores/cluster-list-store";
import { useK8sClusterStore } from "@/stores/k8s-cluster-store";
import type { ConnectionProfile, UnifiedClusterRow } from "@/lib/api/types";
import { cn, getErrorMessage } from "@/lib/utils";
import { PRESET_COLORS } from "@/lib/constants";
import { useToastStore } from "@/stores/toast-store";

interface ConnectionFormData {
  name: string;
  hosts: string;
  port: string;
  username: string;
  password: string;
  color: string;
  description: string;
}

const emptyForm: ConnectionFormData = {
  name: "",
  hosts: "127.0.0.1",
  port: "3000",
  username: "",
  password: "",
  color: PRESET_COLORS[0],
  description: "",
};

export default function ConnectionsPage() {
  const router = useRouter();
  const { createConnection, updateConnection, deleteConnection, testConnection } =
    useConnectionStore();
  const { rows, loading, error, fetchAll, fetchAllHealth } = useClusterListStore();
  const { k8sAvailable, checkAvailability } = useK8sClusterStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ConnectionFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedClusterRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    // Populate connection-store so openEditDialog can access full connection data
    useConnectionStore.getState().fetchConnections();
    fetchAll()
      .then(() => {
        fetchAllHealth();
      })
      .catch((err) => {
        // eslint-disable-next-line no-console -- intentional: surface initial load failures
        console.error("Failed to load cluster list:", err);
      });
  }, [fetchAll, fetchAllHealth]);

  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  const openCreateDialog = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setTestResult(null);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((id: string) => {
    const row = useClusterListStore.getState().rows.find((r) => r.id === id);
    if (!row || row.source === "k8s") return;

    // Fetch connection details from the connection store
    const connections = useConnectionStore.getState().connections;
    const conn = connections.find((c) => c.id === id);
    if (conn) {
      setEditingId(conn.id);
      setForm({
        name: conn.name,
        hosts: conn.hosts.join(", "),
        port: String(conn.port),
        username: conn.username ?? "",
        password: "",
        color: conn.color,
        description: conn.description ?? "",
      });
    } else {
      // Fallback: populate from row data
      setEditingId(id);
      setForm({
        name: row.name,
        hosts: row.hosts,
        port: "3000",
        username: "",
        password: "",
        color: row.color,
        description: row.description ?? "",
      });
    }
    setTestResult(null);
    setDialogOpen(true);
  }, []);

  const handleSave = async () => {
    if (!form.name.trim() || !form.hosts.trim()) return;
    setSaving(true);
    try {
      const data: Partial<ConnectionProfile> = {
        name: form.name.trim(),
        hosts: form.hosts
          .split(",")
          .map((h) => h.trim())
          .filter(Boolean),
        port: parseInt(form.port, 10) || 3000,
        username: form.username || undefined,
        password: form.password || undefined,
        color: form.color,
        description: form.description.trim() || undefined,
      };
      if (editingId) {
        await updateConnection(editingId, data);
        useToastStore.getState().addToast("success", "Connection updated");
      } else {
        await createConnection(data);
        useToastStore.getState().addToast("success", "Connection created");
      }
      setDialogOpen(false);
      // Refresh the unified list and health data
      await fetchAll();
      fetchAllHealth();
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!form.hosts.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection({
        hosts: form.hosts
          .split(",")
          .map((h) => h.trim())
          .filter(Boolean),
        port: parseInt(form.port, 10) || 3000,
        username: form.username || undefined,
        password: form.password || undefined,
      });
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !deleteTarget.connectionId) return;
    setDeleting(true);
    try {
      await deleteConnection(deleteTarget.connectionId);
      useToastStore.getState().addToast("success", "Connection deleted");
      setDeleteTarget(null);
      // Refresh the unified list
      await fetchAll();
      fetchAllHealth();
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleRowClick = useCallback(
    (row: UnifiedClusterRow) => {
      if (row.source === "k8s") {
        if (row.k8sNamespace && row.k8sClusterName) {
          router.push(`/k8s/clusters/${row.k8sNamespace}/${row.k8sClusterName}`);
        }
      } else {
        if (row.status === "connected") {
          router.push(`/browser/${row.connectionId}`);
        } else {
          router.push(`/cluster/${row.connectionId}`);
        }
      }
    },
    [router],
  );

  return (
    <div className="animate-fade-in space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Connected Clusters"
        description="Manage your Aerospike clusters and connections"
        actions={
          <>
            {k8sAvailable && (
              <>
                <Button variant="info" onClick={() => router.push("/k8s/clusters/new")}>
                  <Boxes className="mr-2 h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Create Cluster</span>
                </Button>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="mr-2 h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Import CR</span>
                </Button>
              </>
            )}
            <Button variant="success" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Connection</span>
            </Button>
          </>
        }
      />

      <InlineAlert message={error} />

      <ClusterCardList
        rows={rows}
        loading={loading}
        onRowClick={handleRowClick}
        onEdit={openEditDialog}
        onDelete={setDeleteTarget}
      />

      {/* Connection Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Connection" : "New Connection"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the connection settings." : "Create a new Aerospike connection."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="conn-name">Name</Label>
              <Input
                id="conn-name"
                placeholder="My Connection"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="conn-hosts">Hosts (comma-separated, host:port supported)</Label>
              <Input
                id="conn-hosts"
                placeholder="host1:3000, host2:3010"
                value={form.hosts}
                onChange={(e) => setForm({ ...form, hosts: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="conn-port">Default Port</Label>
              <Input
                id="conn-port"
                type="number"
                placeholder="3000"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="conn-user">Username</Label>
                <Input
                  id="conn-user"
                  placeholder="Optional"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="conn-pass">Password</Label>
                <Input
                  id="conn-pass"
                  type="password"
                  placeholder={editingId ? "••••••••" : "Optional"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      "h-8 w-8 rounded-full transition-all duration-150",
                      form.color === color
                        ? "ring-offset-base-100 scale-110 ring-2 ring-offset-2"
                        : "opacity-70 hover:scale-110 hover:opacity-100",
                    )}
                    style={{
                      backgroundColor: color,
                      boxShadow:
                        form.color === color
                          ? `0 0 0 2px var(--color-base-100), 0 0 0 4px ${color}`
                          : undefined,
                    }}
                    onClick={() => setForm({ ...form, color })}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="conn-desc">Description</Label>
              <Textarea
                id="conn-desc"
                placeholder="Optional description for this connection"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="resize-none"
              />
            </div>

            {testResult && (
              <div
                className={cn(
                  "animate-scale-in flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm",
                  testResult.success
                    ? "border-success/20 bg-success/5 text-success"
                    : "border-error/20 bg-error/5 text-error",
                )}
              >
                {testResult.success ? (
                  <Check className="h-4 w-4 shrink-0" />
                ) : (
                  <WifiOff className="h-4 w-4 shrink-0" />
                )}
                {testResult.message}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={testing || !form.hosts.trim()}
              className="mr-auto"
            >
              {testing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="mr-2 h-4 w-4" />
              )}
              Test Connection
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <LoadingButton
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.hosts.trim()}
              loading={saving}
            >
              {editingId ? "Update" : "Create"}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <K8sImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={async () => {
          await fetchAll();
          fetchAllHealth();
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Connection"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
