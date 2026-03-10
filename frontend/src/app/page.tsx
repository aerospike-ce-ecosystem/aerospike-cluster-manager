"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Server,
  Pencil,
  Trash2,
  Database,
  Loader2,
  Wifi,
  WifiOff,
  Check,
  Boxes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { InlineAlert } from "@/components/common/inline-alert";
import { LoadingButton } from "@/components/common/loading-button";
import { PageHeader } from "@/components/common/page-header";
import { K8sClusterCard } from "@/components/k8s/k8s-cluster-card";
import { useConnectionStore } from "@/stores/connection-store";
import { useK8sClusterStore } from "@/stores/k8s-cluster-store";
import type { ConnectionProfile } from "@/lib/api/types";
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
}

const emptyForm: ConnectionFormData = {
  name: "",
  hosts: "127.0.0.1",
  port: "3000",
  username: "",
  password: "",
  color: PRESET_COLORS[0],
};

export default function ConnectionsPage() {
  const router = useRouter();
  const {
    connections,
    healthStatuses,
    checkingHealth,
    loading,
    error,
    fetchConnections,
    fetchAllHealth,
    createConnection,
    updateConnection,
    deleteConnection,
    testConnection,
  } = useConnectionStore();
  const {
    k8sAvailable,
    clusters: k8sClusters,
    loading: k8sLoading,
    checkAvailability,
    fetchClusters: fetchK8sClusters,
  } = useK8sClusterStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ConnectionFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConnectionProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchConnections()
      .then(() => {
        fetchAllHealth();
      })
      .catch((err) => console.error("Failed to load connections:", err));
  }, [fetchConnections, fetchAllHealth]);

  useEffect(() => {
    checkAvailability().then(() => {
      // Fetch clusters after availability is confirmed (store sets k8sAvailable in checkAvailability)
    });
  }, [checkAvailability]);

  useEffect(() => {
    if (k8sAvailable) {
      fetchK8sClusters();
    }
  }, [k8sAvailable, fetchK8sClusters]);

  const openCreateDialog = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setTestResult(null);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((conn: ConnectionProfile) => {
    setEditingId(conn.id);
    setForm({
      name: conn.name,
      hosts: conn.hosts.join(", "),
      port: String(conn.port),
      username: conn.username ?? "",
      password: "",
      color: conn.color,
    });
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
      };
      if (editingId) {
        await updateConnection(editingId, data);
        useToastStore.getState().addToast("success", "Connection updated");
      } else {
        await createConnection(data);
        useToastStore.getState().addToast("success", "Connection created");
      }
      setDialogOpen(false);
      // Refresh health after create/update
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
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteConnection(deleteTarget.id);
      useToastStore.getState().addToast("success", "Connection deleted");
      setDeleteTarget(null);
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const navigateToConnection = useCallback(
    (conn: ConnectionProfile) => {
      const status = healthStatuses[conn.id];
      if (status?.connected) {
        router.push(`/browser/${conn.id}`);
      } else {
        router.push(`/cluster/${conn.id}`);
      }
    },
    [router, healthStatuses],
  );

  if (loading && connections.length === 0) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-8 flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[180px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Clusters"
        description="Manage your Aerospike connections"
        actions={
          <>
            {k8sAvailable && (
              <Button variant="info" onClick={() => router.push("/k8s/clusters/new")}>
                <Boxes className="mr-2 h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Create Cluster</span>
              </Button>
            )}
            <Button variant="success" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Connection</span>
            </Button>
          </>
        }
      />

      <InlineAlert message={error} />

      {connections.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No connections yet"
          description="Create your first connection to start managing Aerospike."
          action={
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              New Connection
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {connections.map((conn, idx) => {
            const status = healthStatuses[conn.id];
            const isChecking = checkingHealth[conn.id] && !status;
            const badgeStatus = isChecking
              ? "checking"
              : status?.connected
                ? "connected"
                : "disconnected";

            return (
              <Card
                key={conn.id}
                className={cn(
                  "group animate-fade-in-up cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
                  "hover:border-accent/30",
                )}
                style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: "backwards" }}
                role="button"
                tabIndex={0}
                onClick={() => navigateToConnection(conn)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigateToConnection(conn);
                  }
                }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="h-3 w-3 shrink-0 rounded-full shadow-sm"
                        style={{
                          backgroundColor: conn.color,
                          boxShadow: `0 0 0 2px var(--color-card), 0 0 0 4px ${conn.color}30`,
                        }}
                      />
                      <CardTitle className="text-base">{conn.name}</CardTitle>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="sr-only">Actions</span>
                          <svg
                            width="15"
                            height="15"
                            viewBox="0 0 15 15"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM13.625 7.5C13.625 8.12132 13.1213 8.625 12.5 8.625C11.8787 8.625 11.375 8.12132 11.375 7.5C11.375 6.87868 11.8787 6.375 12.5 6.375C13.1213 6.375 13.625 6.87868 13.625 7.5Z"
                              fill="currentColor"
                            />
                          </svg>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(conn);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-error focus:text-error"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(conn);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription className="font-mono text-xs tracking-wide">
                    {conn.hosts.every((h) => h.includes(":"))
                      ? conn.hosts.join(", ")
                      : `${conn.hosts.join(", ")}:${conn.port}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={badgeStatus} />
                    {status?.connected && (
                      <>
                        <Badge variant="secondary" className="gap-1 text-[11px]">
                          <Server className="h-3 w-3" />
                          {status.nodeCount} node
                          {status.nodeCount !== 1 ? "s" : ""}
                        </Badge>
                        <Badge variant="secondary" className="gap-1 text-[11px]">
                          <Database className="h-3 w-3" />
                          {status.namespaceCount} ns
                        </Badge>
                      </>
                    )}
                  </div>
                  {status?.connected && status.build && (
                    <p className="text-muted-foreground mt-2.5 font-mono text-xs">
                      {status.edition} {status.build}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* K8s Clusters Section */}
      {k8sAvailable && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Boxes className="text-muted-foreground h-5 w-5" />
            <h2 className="text-lg font-semibold">Kubernetes Clusters</h2>
          </div>
          {k8sLoading && k8sClusters.length === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-[140px] rounded-xl" />
              ))}
            </div>
          ) : k8sClusters.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No Kubernetes clusters"
              description="Deploy an Aerospike cluster on Kubernetes to manage it here."
              action={
                <Button onClick={() => router.push("/k8s/clusters/new")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Cluster
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {k8sClusters.map((cluster, idx) => (
                <K8sClusterCard
                  key={`${cluster.namespace}/${cluster.name}`}
                  cluster={cluster}
                  index={idx}
                  onClick={() => router.push(`/k8s/clusters/${cluster.namespace}/${cluster.name}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}

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
                          ? `0 0 0 2px var(--color-background), 0 0 0 4px ${color}`
                          : undefined,
                    }}
                    onClick={() => setForm({ ...form, color })}
                  />
                ))}
              </div>
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
