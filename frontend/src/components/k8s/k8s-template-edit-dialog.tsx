"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingButton } from "@/components/common/loading-button";
import { getErrorMessage } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { K8sTemplateDetail, UpdateK8sTemplateRequest } from "@/lib/api/types";

interface K8sTemplateEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: K8sTemplateDetail;
  onSave: (data: UpdateK8sTemplateRequest) => Promise<void>;
}

export function K8sTemplateEditDialog({
  open,
  onOpenChange,
  template,
  onSave,
}: K8sTemplateEditDialogProps) {
  const spec = template.spec;

  // Form state
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [size, setSize] = useState<number | undefined>(undefined);
  const [antiAffinity, setAntiAffinity] = useState<string>("");
  const [podManagementPolicy, setPodManagementPolicy] = useState<string>("");
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [monitoringPort, setMonitoringPort] = useState(9145);
  const [cpuRequest, setCpuRequest] = useState("");
  const [memRequest, setMemRequest] = useState("");
  const [cpuLimit, setCpuLimit] = useState("");
  const [memLimit, setMemLimit] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive initial values
  const scheduling = spec.scheduling as Record<string, unknown> | undefined;
  const monitoring = spec.monitoring as Record<string, unknown> | undefined;
  const resources = spec.resources as Record<string, Record<string, string>> | undefined;

  const initialDescription = String(spec.description || "");
  const initialImage = String(spec.image || "");
  const initialSize = spec.size != null ? Number(spec.size) : undefined;
  const initialAntiAffinity = String(scheduling?.podAntiAffinityLevel || "");
  const initialPodManagementPolicy = String(scheduling?.podManagementPolicy || "");
  const initialMonitoringEnabled = Boolean(monitoring?.enabled);
  const initialMonitoringPort = Number(monitoring?.port || 9145);
  const initialCpuRequest = resources?.requests?.cpu || "";
  const initialMemRequest = resources?.requests?.memory || "";
  const initialCpuLimit = resources?.limits?.cpu || "";
  const initialMemLimit = resources?.limits?.memory || "";

  // Reset form on open
  useEffect(() => {
    if (open) {
      setDescription(initialDescription);
      setImage(initialImage);
      setSize(initialSize);
      setAntiAffinity(initialAntiAffinity);
      setPodManagementPolicy(initialPodManagementPolicy);
      setMonitoringEnabled(initialMonitoringEnabled);
      setMonitoringPort(initialMonitoringPort);
      setCpuRequest(initialCpuRequest);
      setMemRequest(initialMemRequest);
      setCpuLimit(initialCpuLimit);
      setMemLimit(initialMemLimit);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hasChanges = useMemo(() => {
    return (
      description !== initialDescription ||
      image !== initialImage ||
      size !== initialSize ||
      antiAffinity !== initialAntiAffinity ||
      podManagementPolicy !== initialPodManagementPolicy ||
      monitoringEnabled !== initialMonitoringEnabled ||
      monitoringPort !== initialMonitoringPort ||
      cpuRequest !== initialCpuRequest ||
      memRequest !== initialMemRequest ||
      cpuLimit !== initialCpuLimit ||
      memLimit !== initialMemLimit
    );
  }, [
    description,
    image,
    size,
    antiAffinity,
    podManagementPolicy,
    monitoringEnabled,
    monitoringPort,
    cpuRequest,
    memRequest,
    cpuLimit,
    memLimit,
    initialDescription,
    initialImage,
    initialSize,
    initialAntiAffinity,
    initialPodManagementPolicy,
    initialMonitoringEnabled,
    initialMonitoringPort,
    initialCpuRequest,
    initialMemRequest,
    initialCpuLimit,
    initialMemLimit,
  ]);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const data: UpdateK8sTemplateRequest = {};

      if (description !== initialDescription) data.description = description;
      if (image !== initialImage) data.image = image;
      if (size !== initialSize) data.size = size;

      // Scheduling
      if (
        antiAffinity !== initialAntiAffinity ||
        podManagementPolicy !== initialPodManagementPolicy
      ) {
        data.scheduling = {};
        if (antiAffinity) {
          data.scheduling.podAntiAffinityLevel = antiAffinity as "none" | "preferred" | "required";
        }
        if (podManagementPolicy) {
          data.scheduling.podManagementPolicy = podManagementPolicy as "OrderedReady" | "Parallel";
        }
      }

      // Monitoring
      if (
        monitoringEnabled !== initialMonitoringEnabled ||
        monitoringPort !== initialMonitoringPort
      ) {
        data.monitoring = { enabled: monitoringEnabled, port: monitoringPort };
      }

      // Resources
      const resourcesChanged =
        cpuRequest !== initialCpuRequest ||
        memRequest !== initialMemRequest ||
        cpuLimit !== initialCpuLimit ||
        memLimit !== initialMemLimit;
      if (resourcesChanged && cpuRequest && memRequest && cpuLimit && memLimit) {
        data.resources = {
          requests: { cpu: cpuRequest, memory: memRequest },
          limits: { cpu: cpuLimit, memory: memLimit },
        };
      }

      await onSave(data);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Template: {template.name}</DialogTitle>
          <DialogDescription>
            Modify template configuration. Changes affect new clusters only.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-4">
          {error && <p className="text-destructive text-sm">{error}</p>}

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="tmpl-desc">Description</Label>
            <Input
              id="tmpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder="Template description"
            />
          </div>

          {/* Image */}
          <div className="space-y-1">
            <Label htmlFor="tmpl-image">Image</Label>
            <Input
              id="tmpl-image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="aerospike:ce-8.1.1.1"
            />
          </div>

          {/* Size */}
          <div className="space-y-1">
            <Label htmlFor="tmpl-size">Default Size</Label>
            <Input
              id="tmpl-size"
              type="number"
              min={1}
              max={8}
              value={size ?? ""}
              onChange={(e) => setSize(e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>

          {/* Scheduling */}
          <div className="space-y-1">
            <Label>Anti-Affinity Level</Label>
            <Select value={antiAffinity || "none"} onValueChange={setAntiAffinity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="preferred">Preferred</SelectItem>
                <SelectItem value="required">Required</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Pod Management Policy</Label>
            <Select
              value={podManagementPolicy || "OrderedReady"}
              onValueChange={setPodManagementPolicy}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OrderedReady">OrderedReady</SelectItem>
                <SelectItem value="Parallel">Parallel</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Resources */}
          <div className="space-y-2">
            <Label className="font-semibold">Resources</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="tmpl-cpu-req" className="text-xs">
                  CPU Request
                </Label>
                <Input
                  id="tmpl-cpu-req"
                  value={cpuRequest}
                  onChange={(e) => setCpuRequest(e.target.value)}
                  placeholder="100m"
                />
              </div>
              <div>
                <Label htmlFor="tmpl-mem-req" className="text-xs">
                  Memory Request
                </Label>
                <Input
                  id="tmpl-mem-req"
                  value={memRequest}
                  onChange={(e) => setMemRequest(e.target.value)}
                  placeholder="256Mi"
                />
              </div>
              <div>
                <Label htmlFor="tmpl-cpu-lim" className="text-xs">
                  CPU Limit
                </Label>
                <Input
                  id="tmpl-cpu-lim"
                  value={cpuLimit}
                  onChange={(e) => setCpuLimit(e.target.value)}
                  placeholder="500m"
                />
              </div>
              <div>
                <Label htmlFor="tmpl-mem-lim" className="text-xs">
                  Memory Limit
                </Label>
                <Input
                  id="tmpl-mem-lim"
                  value={memLimit}
                  onChange={(e) => setMemLimit(e.target.value)}
                  placeholder="1Gi"
                />
              </div>
            </div>
          </div>

          {/* Monitoring */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="tmpl-monitoring"
              checked={monitoringEnabled}
              onCheckedChange={(v) => setMonitoringEnabled(v === true)}
            />
            <Label htmlFor="tmpl-monitoring">Enable Monitoring</Label>
          </div>
          {monitoringEnabled && (
            <div className="space-y-1">
              <Label htmlFor="tmpl-mon-port">Monitoring Port</Label>
              <Input
                id="tmpl-mon-port"
                type="number"
                min={1}
                max={65535}
                value={monitoringPort}
                onChange={(e) => setMonitoringPort(Number(e.target.value))}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <LoadingButton onClick={handleSave} disabled={!hasChanges} loading={loading}>
            Save Changes
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
