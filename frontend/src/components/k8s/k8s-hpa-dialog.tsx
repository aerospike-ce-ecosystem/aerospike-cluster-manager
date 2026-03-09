"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/common/form-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { getErrorMessage, cn } from "@/lib/utils";
import type { HPAConfig, HPAResponse } from "@/lib/api/types";

interface K8sHPADialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namespace: string;
  clusterName: string;
}

export function K8sHPADialog({ open, onOpenChange, namespace, clusterName }: K8sHPADialogProps) {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingHPA, setExistingHPA] = useState<HPAResponse | null>(null);
  const [hpaEnabled, setHpaEnabled] = useState(false);

  // Form fields
  const [minReplicas, setMinReplicas] = useState(1);
  const [maxReplicas, setMaxReplicas] = useState(4);
  const [cpuEnabled, setCpuEnabled] = useState(true);
  const [cpuTarget, setCpuTarget] = useState(70);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [memoryTarget, setMemoryTarget] = useState(80);

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const fetchHPA = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      const response = await api.getK8sClusterHPA(namespace, clusterName);
      setExistingHPA(response);
      setHpaEnabled(true);
      // Populate form from existing config
      setMinReplicas(response.config.minReplicas);
      setMaxReplicas(response.config.maxReplicas);
      if (response.config.cpuTargetPercent != null) {
        setCpuEnabled(true);
        setCpuTarget(response.config.cpuTargetPercent);
      } else {
        setCpuEnabled(false);
      }
      if (response.config.memoryTargetPercent != null) {
        setMemoryEnabled(true);
        setMemoryTarget(response.config.memoryTargetPercent);
      } else {
        setMemoryEnabled(false);
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      // 404 means no HPA exists -- that's fine
      if (
        msg.includes("404") ||
        msg.includes("not found") ||
        msg.toLowerCase().includes("not found")
      ) {
        setExistingHPA(null);
        setHpaEnabled(false);
      } else {
        setError(msg);
      }
    } finally {
      setFetching(false);
    }
  }, [namespace, clusterName]);

  useEffect(() => {
    if (open) {
      setError(null);
      setDeleteConfirm(false);
      fetchHPA();
    }
  }, [open, fetchHPA]);

  const handleSubmit = async () => {
    if (!hpaEnabled && existingHPA) {
      // Delete HPA
      setLoading(true);
      setError(null);
      try {
        await api.deleteK8sClusterHPA(namespace, clusterName);
        setExistingHPA(null);
        onOpenChange(false);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!hpaEnabled) {
      onOpenChange(false);
      return;
    }

    // Validate
    if (maxReplicas < minReplicas) {
      setError("Max replicas must be >= min replicas");
      return;
    }
    if (!cpuEnabled && !memoryEnabled) {
      setError("At least one metric target (CPU or Memory) must be enabled");
      return;
    }

    const config: HPAConfig = {
      minReplicas,
      maxReplicas,
      cpuTargetPercent: cpuEnabled ? cpuTarget : undefined,
      memoryTargetPercent: memoryEnabled ? memoryTarget : undefined,
    };

    setLoading(true);
    setError(null);
    try {
      await api.createK8sClusterHPA(namespace, clusterName, config);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.deleteK8sClusterHPA(namespace, clusterName);
      setExistingHPA(null);
      setHpaEnabled(false);
      setDeleteConfirm(false);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const submitLabel =
    !hpaEnabled && existingHPA ? "Remove HPA" : existingHPA ? "Update HPA" : "Create HPA";
  const disabled = hpaEnabled && !cpuEnabled && !memoryEnabled;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Horizontal Pod Autoscaler"
      description={`Configure autoscaling for "${clusterName}" in ${namespace}.`}
      loading={loading}
      error={error}
      onSubmit={handleSubmit}
      submitLabel={submitLabel}
      disabled={disabled}
      size="lg"
      footer={
        existingHPA && hpaEnabled ? (
          deleteConfirm ? (
            <div className="mr-auto flex items-center gap-2">
              <span className="text-destructive text-sm">Delete HPA?</span>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading}>
                Confirm
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteConfirm(false)}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive mr-auto"
              onClick={() => setDeleteConfirm(true)}
              disabled={loading}
            >
              Delete HPA
            </Button>
          )
        ) : undefined
      }
    >
      {fetching ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Enable/Disable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Autoscaling</Label>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Automatically scale the cluster based on resource utilization.
              </p>
            </div>
            <Switch checked={hpaEnabled} onCheckedChange={setHpaEnabled} />
          </div>

          {/* Current HPA status */}
          {existingHPA && hpaEnabled && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                  Current Status
                </span>
                <Badge
                  variant="outline"
                  className="bg-info/10 text-info border-info/20 text-[11px]"
                >
                  Active
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Current Replicas</span>
                  <p className="font-semibold">{existingHPA.status.currentReplicas}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Desired Replicas</span>
                  <p className="font-semibold">{existingHPA.status.desiredReplicas}</p>
                </div>
              </div>
              {existingHPA.status.conditions.length > 0 && (
                <div className="space-y-1">
                  {existingHPA.status.conditions.map((cond, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          cond.status === "True" ? "bg-success" : "bg-muted-foreground",
                        )}
                      />
                      <span className="font-medium">{cond.type}</span>
                      {cond.reason && (
                        <span className="text-muted-foreground">({cond.reason})</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HPA config form */}
          {hpaEnabled && (
            <div className="space-y-4">
              {/* Replicas */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="hpa-min-replicas">Min Replicas</Label>
                  <Input
                    id="hpa-min-replicas"
                    type="number"
                    min={1}
                    max={8}
                    value={minReplicas}
                    onChange={(e) => {
                      const val = Math.min(8, Math.max(1, parseInt(e.target.value) || 1));
                      setMinReplicas(val);
                      if (maxReplicas < val) setMaxReplicas(val);
                      setError(null);
                    }}
                    disabled={loading}
                  />
                  <p className="text-muted-foreground text-[11px]">
                    Minimum cluster size (1-8 for CE)
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="hpa-max-replicas">Max Replicas</Label>
                  <Input
                    id="hpa-max-replicas"
                    type="number"
                    min={1}
                    max={8}
                    value={maxReplicas}
                    onChange={(e) => {
                      const val = Math.min(8, Math.max(1, parseInt(e.target.value) || 1));
                      setMaxReplicas(val);
                      if (minReplicas > val) setMinReplicas(val);
                      setError(null);
                    }}
                    disabled={loading}
                  />
                  <p className="text-muted-foreground text-[11px]">
                    Maximum cluster size (1-8 for CE)
                  </p>
                </div>
              </div>

              {/* CPU Target */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">CPU Target Utilization</Label>
                  <Switch
                    checked={cpuEnabled}
                    onCheckedChange={(checked) => {
                      setCpuEnabled(checked);
                      setError(null);
                    }}
                  />
                </div>
                {cpuEnabled && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={cpuTarget}
                      onChange={(e) => {
                        setCpuTarget(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)));
                        setError(null);
                      }}
                      disabled={loading}
                      className="w-24"
                    />
                    <span className="text-muted-foreground text-sm">%</span>
                    <p className="text-muted-foreground text-[11px]">
                      Scale when average CPU exceeds this threshold.
                    </p>
                  </div>
                )}
              </div>

              {/* Memory Target */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Memory Target Utilization</Label>
                  <Switch
                    checked={memoryEnabled}
                    onCheckedChange={(checked) => {
                      setMemoryEnabled(checked);
                      setError(null);
                    }}
                  />
                </div>
                {memoryEnabled && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={memoryTarget}
                      onChange={(e) => {
                        setMemoryTarget(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)));
                        setError(null);
                      }}
                      disabled={loading}
                      className="w-24"
                    />
                    <span className="text-muted-foreground text-sm">%</span>
                    <p className="text-muted-foreground text-[11px]">
                      Scale when average memory exceeds this threshold.
                    </p>
                  </div>
                )}
              </div>

              {!cpuEnabled && !memoryEnabled && (
                <p className="text-destructive text-sm">
                  At least one metric target must be enabled.
                </p>
              )}
            </div>
          )}

          {/* Disabled state info */}
          {!hpaEnabled && !existingHPA && (
            <p className="text-muted-foreground text-sm">
              Enable autoscaling to automatically adjust the number of Aerospike nodes based on CPU
              and/or memory utilization. The HPA will target the AerospikeCluster /scale
              subresource.
            </p>
          )}

          {!hpaEnabled && existingHPA && (
            <p className="text-warning text-sm">
              Saving with autoscaling disabled will remove the existing HPA.
            </p>
          )}
        </div>
      )}
    </FormDialog>
  );
}
