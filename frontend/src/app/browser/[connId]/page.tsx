"use client";

import React, { use, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  RefreshCw,
  ChevronRight,
  Layers,
  HardDrive,
  Plus,
  Settings,
  FlaskConical,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

import { Skeleton } from "@/components/ui/skeleton";
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
import { EmptyState } from "@/components/common/empty-state";
import { FullPageError } from "@/components/common/full-page-error";
import { PageHeader } from "@/components/common/page-header";
import { InlineAlert } from "@/components/common/inline-alert";
import { StatusBadge } from "@/components/common/status-badge";
import { LoadingButton } from "@/components/common/loading-button";
import { useAsyncData } from "@/hooks/use-async-data";
import { api } from "@/lib/api/client";
import { formatNumber, formatBytes, formatPercent } from "@/lib/formatters";
import { cn, getErrorMessage } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection-store";
import { CreateSampleDataDialog } from "@/components/browser/create-sample-data-dialog";
import { useToastStore } from "@/stores/toast-store";

export default function BrowserSetListPage({ params }: { params: Promise<{ connId: string }> }) {
  const { connId } = use(params);
  const router = useRouter();

  // Connection health check
  const healthStatus = useConnectionStore((s) => s.healthStatuses[connId]);
  const fetchConnectionHealth = useConnectionStore((s) => s.fetchConnectionHealth);
  const isDisconnected = healthStatus !== undefined && !healthStatus.connected;

  const {
    data: clusterInfo,
    loading,
    error,
    refetch: fetchData,
  } = useAsyncData(() => api.getCluster(connId), [connId]);

  const namespaces = clusterInfo?.namespaces ?? [];
  const totalSets = namespaces.reduce((sum, ns) => sum + ns.sets.length, 0);

  // Configure Namespace dialog state
  const [configNsOpen, setConfigNsOpen] = useState(false);
  const [configNsName, setConfigNsName] = useState("");
  const [nsMemorySizeMB, setNsMemorySizeMB] = useState("1024");
  const [nsReplicationFactor, setNsReplicationFactor] = useState("2");
  const [configuringNs, setConfiguringNs] = useState(false);

  // Sample Data dialog state
  const [sampleDataOpen, setSampleDataOpen] = useState(false);

  // Create Set dialog state
  const [createSetOpen, setCreateSetOpen] = useState(false);
  const [createSetNs, setCreateSetNs] = useState("");
  const [setName, setSetName] = useState("");

  const openConfigureNsDialog = (ns: {
    name: string;
    memoryTotal: number;
    replicationFactor: number;
  }) => {
    setConfigNsName(ns.name);
    setNsMemorySizeMB(String(Math.round(ns.memoryTotal / (1024 * 1024))));
    setNsReplicationFactor(String(ns.replicationFactor));
    setConfigNsOpen(true);
  };

  const handleConfigureNamespace = async () => {
    const memorySizeMB = parseInt(nsMemorySizeMB, 10);
    if (isNaN(memorySizeMB) || memorySizeMB <= 0) {
      useToastStore.getState().addToast("error", "Memory size must be a positive number");
      return;
    }
    const rf = parseInt(nsReplicationFactor, 10);
    if (isNaN(rf) || rf < 1) {
      useToastStore.getState().addToast("error", "Replication factor must be at least 1");
      return;
    }

    setConfiguringNs(true);
    try {
      await api.configureNamespace(connId, {
        name: configNsName,
        memorySize: memorySizeMB * 1024 * 1024,
        replicationFactor: rf,
      });
      useToastStore
        .getState()
        .addToast("success", `Namespace "${configNsName}" configured successfully`);
      setConfigNsOpen(false);
      await fetchData();
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setConfiguringNs(false);
    }
  };

  const handleCreateSet = () => {
    if (!setName.trim()) {
      useToastStore.getState().addToast("error", "Set name is required");
      return;
    }
    router.push(
      `/browser/${connId}/${encodeURIComponent(createSetNs)}/${encodeURIComponent(setName.trim())}`,
    );
    setCreateSetOpen(false);
    setSetName("");
    useToastStore
      .getState()
      .addToast(
        "success",
        `Navigating to set "${setName.trim()}" — create your first record to initialize it`,
      );
  };

  const openCreateSetDialog = (namespaceName: string) => {
    setCreateSetNs(namespaceName);
    setSetName("");
    setCreateSetOpen(true);
  };

  // Disconnected state — show immediately instead of infinite skeleton loading
  if (isDisconnected) {
    return (
      <FullPageError
        icon={WifiOff}
        title="Connection is not available"
        message="The Aerospike connection is disconnected. Check the server status and try again."
        onRetry={() => {
          fetchConnectionHealth(connId);
          fetchData();
        }}
        retryLabel="Refresh"
      />
    );
  }

  return (
    <div className="animate-fade-in space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Namespaces"
        description="Select a set to browse records"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="warning" size="sm" onClick={() => setSampleDataOpen(true)}>
              <FlaskConical className="mr-2 h-4 w-4" />
              Create Sample Data
            </Button>
            <Button variant="neutral" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Stats */}
      {!loading && clusterInfo && (
        <div className="text-muted-foreground flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Layers className="h-4 w-4" />
            <span>
              <span className="text-base-content font-semibold">{namespaces.length}</span>{" "}
              namespaces
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <HardDrive className="h-4 w-4" />
            <span>
              <span className="text-base-content font-semibold">{totalSets}</span> sets
            </span>
          </div>
        </div>
      )}

      <InlineAlert message={error} />

      {/* Content */}
      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-6 w-28" />
                    <Skeleton className="h-5 w-24 rounded-full" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
                <div className="flex gap-8">
                  <Skeleton className="h-10 w-20" />
                  <Skeleton className="h-10 w-20" />
                  <Skeleton className="h-10 w-20" />
                </div>
                <Skeleton className="h-px w-full" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : namespaces.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No namespaces"
          description="No namespaces found. Namespaces must be defined in aerospike.conf and require a server restart."
        />
      ) : (
        <div className="grid gap-4">
          {namespaces.map((ns, idx) => {
            const memPercent = formatPercent(ns.memoryUsed, ns.memoryTotal);
            const devPercent = formatPercent(ns.deviceUsed, ns.deviceTotal);
            return (
              <Card
                key={ns.name}
                className="animate-fade-in-up"
                style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: "backwards" }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <CardTitle className="text-base">{ns.name}</CardTitle>
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {formatNumber(ns.objects)} objects
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {ns.stopWrites && <StatusBadge status="error" label="Stop Writes" />}
                      {ns.hwmBreached && <StatusBadge status="warning" label="HWM Breached" />}
                      {!ns.stopWrites && !ns.hwmBreached && (
                        <StatusBadge status="ready" label="Healthy" />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => openConfigureNsDialog(ns)}
                        aria-label={`Configure namespace ${ns.name}`}
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Memory */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <HardDrive className="h-3 w-3" />
                        Memory
                      </span>
                      <span className="font-mono text-xs">
                        {formatBytes(ns.memoryUsed)} / {formatBytes(ns.memoryTotal)} ({memPercent}%)
                      </span>
                    </div>
                    <Progress
                      value={memPercent}
                      className={cn("h-1.5", memPercent > 80 && "[&>div]:bg-error")}
                    />
                  </div>

                  {/* Device */}
                  {ns.deviceTotal > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                          <HardDrive className="h-3 w-3" />
                          Device
                        </span>
                        <span className="font-mono text-xs">
                          {formatBytes(ns.deviceUsed)} / {formatBytes(ns.deviceTotal)} ({devPercent}
                          %)
                        </span>
                      </div>
                      <Progress
                        value={devPercent}
                        className={cn("h-1.5", devPercent > 80 && "[&>div]:bg-error")}
                      />
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs tracking-wider uppercase">
                        Replication
                      </span>
                      <p className="metric-value font-medium">{ns.replicationFactor}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs tracking-wider uppercase">
                        HWM Memory
                      </span>
                      <p className="metric-value font-medium">{ns.highWaterMemoryPct}%</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs tracking-wider uppercase">
                        HWM Disk
                      </span>
                      <p className="metric-value font-medium">{ns.highWaterDiskPct}%</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs tracking-wider uppercase">
                        NSUP Period
                      </span>
                      <p className="metric-value font-medium">
                        {ns.nsupPeriod > 0 ? `${ns.nsupPeriod}s` : "Off"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs tracking-wider uppercase">
                        Default TTL
                      </span>
                      <p className="metric-value font-medium">
                        {ns.defaultTtl === 0 ? "None" : `${ns.defaultTtl}s`}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs tracking-wider uppercase">
                        TTL w/o NSUP
                      </span>
                      <p className="metric-value font-medium">
                        {ns.allowTtlWithoutNsup ? "Allowed" : "Denied"}
                      </p>
                    </div>
                  </div>

                  {/* Sets */}
                  <div className="bg-base-300 my-0 h-px" />
                  <div>
                    <div className="mb-2.5 flex items-center justify-between">
                      <h4 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                        Sets ({ns.sets.length})
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => openCreateSetDialog(ns.name)}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Create Set
                      </Button>
                    </div>
                    {ns.sets.length === 0 ? (
                      <p className="text-muted-foreground py-3 text-center text-xs">
                        No sets in this namespace
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {ns.sets.map((s) => (
                          <button
                            key={s.name}
                            onClick={() =>
                              router.push(
                                `/browser/${connId}/${encodeURIComponent(ns.name)}/${encodeURIComponent(s.name)}`,
                              )
                            }
                            className="group border-base-300/60 hover:border-accent/40 hover:bg-accent/5 flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all"
                          >
                            <span className="font-medium">{s.name}</span>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="font-mono text-[11px]">
                                {formatNumber(s.objects)} obj
                              </Badge>
                              {s.memoryDataBytes > 0 && (
                                <Badge variant="outline" className="font-mono text-[11px]">
                                  {formatBytes(s.memoryDataBytes)}
                                </Badge>
                              )}
                              <ChevronRight className="text-muted-foreground/40 group-hover:text-primary h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Sample Data Dialog */}
      <CreateSampleDataDialog
        open={sampleDataOpen}
        onOpenChange={setSampleDataOpen}
        connId={connId}
        namespaces={namespaces.map((ns) => ns.name)}
        onSuccess={fetchData}
      />

      {/* Configure Namespace Dialog */}
      <Dialog open={configNsOpen} onOpenChange={setConfigNsOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Configure Namespace</DialogTitle>
            <DialogDescription>
              Update runtime configuration for namespace &quot;{configNsName}&quot;. Changes apply
              immediately without restart. Not all parameters may be dynamically tunable.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Namespace</Label>
              <Input value={configNsName} disabled />
            </div>
            <div className="grid gap-2">
              <Label>Memory Size (MB)</Label>
              <Input
                type="number"
                placeholder="1024"
                value={nsMemorySizeMB}
                onChange={(e) => setNsMemorySizeMB(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Replication Factor</Label>
              <Input
                type="number"
                placeholder="2"
                value={nsReplicationFactor}
                onChange={(e) => setNsReplicationFactor(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfigNsOpen(false)}
              disabled={configuringNs}
            >
              Cancel
            </Button>
            <LoadingButton onClick={handleConfigureNamespace} loading={configuringNs}>
              Apply
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Set Dialog */}
      <Dialog open={createSetOpen} onOpenChange={setCreateSetOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create Set</DialogTitle>
            <DialogDescription>
              Create a new set in namespace &quot;{createSetNs}&quot;. Sets are created when the
              first record is written.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Set Name</Label>
              <Input
                placeholder="my_set"
                value={setName}
                onChange={(e) => setSetName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSet} disabled={!setName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
