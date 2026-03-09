"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingButton } from "@/components/common/loading-button";
import { PageHeader } from "@/components/common/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useK8sClusterStore } from "@/stores/k8s-cluster-store";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import type { CreateK8sTemplateRequest } from "@/lib/api/types";

export default function CreateTemplatePage() {
  const router = useRouter();
  const { createTemplate } = useK8sClusterStore();
  const [loading, setLoading] = useState(false);
  const [storageClasses, setStorageClasses] = useState<string[]>([]);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("aerospike:ce-8.1.1.1");
  const [size, setSize] = useState<number | undefined>(undefined);
  const [includeResources, setIncludeResources] = useState(false);
  const [cpuReq, setCpuReq] = useState("500m");
  const [memReq, setMemReq] = useState("1Gi");
  const [cpuLim, setCpuLim] = useState("2");
  const [memLim, setMemLim] = useState("4Gi");
  const [enableMonitoring, setEnableMonitoring] = useState(false);
  const [monitoringPort, setMonitoringPort] = useState(9145);
  const [antiAffinity, setAntiAffinity] = useState<"none" | "preferred" | "required">("none");
  const [podManagementPolicy, setPodManagementPolicy] = useState<"OrderedReady" | "Parallel">(
    "OrderedReady",
  );
  const [includeStorage, setIncludeStorage] = useState(false);
  const [storageClass, setStorageClass] = useState("standard");
  const [volumeSize, setVolumeSize] = useState("10Gi");
  const [accessType, setAccessType] = useState("pod");

  useEffect(() => {
    api
      .getK8sStorageClasses()
      .then(setStorageClasses)
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }
    setLoading(true);
    try {
      const data: CreateK8sTemplateRequest = {
        name: name.trim(),
      };
      if (description.trim()) data.description = description.trim();
      if (image) data.image = image;
      if (size != null && size > 0) data.size = size;
      if (includeResources) {
        data.resources = {
          requests: { cpu: cpuReq, memory: memReq },
          limits: { cpu: cpuLim, memory: memLim },
        };
      }
      if (enableMonitoring) {
        data.monitoring = { enabled: true, port: monitoringPort };
      }
      if (antiAffinity !== "none" || podManagementPolicy !== "OrderedReady") {
        data.scheduling = {};
        if (antiAffinity !== "none") data.scheduling.podAntiAffinityLevel = antiAffinity;
        if (podManagementPolicy !== "OrderedReady")
          data.scheduling.podManagementPolicy = podManagementPolicy;
      }
      if (includeStorage) {
        data.storage = {
          storageClassName: storageClass,
          volumeMode: "Filesystem",
          accessModes: ["ReadWriteOnce"],
          size: volumeSize,
        };
      }
      if (accessType !== "pod") {
        data.networkPolicy = {
          accessType: accessType as "pod" | "hostInternal" | "hostExternal" | "configuredIP",
        };
      }

      await createTemplate(data);
      toast.success(`Template "${name}" created`);
      router.push("/k8s/templates");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Create AerospikeClusterTemplate"
        description="Define a reusable cluster configuration template"
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push("/k8s/templates")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        }
      />

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Basic Info */}
        <div className="bg-card space-y-4 rounded-xl border p-6">
          <h3 className="text-sm font-semibold">Basic Information</h3>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="tmpl-description">Description</Label>
              <Textarea
                id="tmpl-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Production multi-rack cluster for high availability"
                rows={2}
                maxLength={500}
                disabled={loading}
                className="resize-none"
              />
              <p className="text-muted-foreground text-xs">{description.length}/500</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="tmpl-name">Template Name</Label>
              <Input
                id="tmpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-template"
                disabled={loading}
              />
              <p className="text-muted-foreground text-xs">
                Cluster-scoped resource (no namespace)
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tmpl-image">Default Image</Label>
              <Input
                id="tmpl-image"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="aerospike:ce-8.1.1.1"
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tmpl-size">Default Size</Label>
              <Input
                id="tmpl-size"
                type="number"
                min={1}
                max={8}
                value={size ?? ""}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setSize(isNaN(v) ? undefined : Math.min(8, Math.max(1, v)));
                }}
                placeholder="Optional (1-8)"
                disabled={loading}
              />
            </div>
          </div>
        </div>

        {/* Scheduling */}
        <div className="bg-card space-y-4 rounded-xl border p-6">
          <h3 className="text-sm font-semibold">Scheduling</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Pod Anti-Affinity</Label>
              <Select
                value={antiAffinity}
                onValueChange={(v) => setAntiAffinity(v as typeof antiAffinity)}
              >
                <SelectTrigger disabled={loading}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="preferred">Preferred</SelectItem>
                  <SelectItem value="required">Required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Pod Management Policy</Label>
              <Select
                value={podManagementPolicy}
                onValueChange={(v) => setPodManagementPolicy(v as typeof podManagementPolicy)}
              >
                <SelectTrigger disabled={loading}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OrderedReady">OrderedReady</SelectItem>
                  <SelectItem value="Parallel">Parallel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Resources */}
        <div className="bg-card space-y-4 rounded-xl border p-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="tmpl-resources"
              checked={includeResources}
              onCheckedChange={(c) => setIncludeResources(c === true)}
              disabled={loading}
            />
            <Label htmlFor="tmpl-resources" className="cursor-pointer text-sm font-semibold">
              Include Resource Defaults
            </Label>
          </div>
          {includeResources && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-xs">CPU Request</Label>
                <Input
                  value={cpuReq}
                  onChange={(e) => setCpuReq(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Memory Request</Label>
                <Input
                  value={memReq}
                  onChange={(e) => setMemReq(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">CPU Limit</Label>
                <Input
                  value={cpuLim}
                  onChange={(e) => setCpuLim(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Memory Limit</Label>
                <Input
                  value={memLim}
                  onChange={(e) => setMemLim(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          )}
        </div>

        {/* Storage */}
        <div className="bg-card space-y-4 rounded-xl border p-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="tmpl-storage"
              checked={includeStorage}
              onCheckedChange={(c) => setIncludeStorage(c === true)}
              disabled={loading}
            />
            <Label htmlFor="tmpl-storage" className="cursor-pointer text-sm font-semibold">
              Include Storage Defaults
            </Label>
          </div>
          {includeStorage && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-xs">Storage Class</Label>
                <Select value={storageClass} onValueChange={setStorageClass}>
                  <SelectTrigger disabled={loading}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storageClasses.map((sc) => (
                      <SelectItem key={sc} value={sc}>
                        {sc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Volume Size</Label>
                <Input
                  value={volumeSize}
                  onChange={(e) => setVolumeSize(e.target.value)}
                  placeholder="10Gi"
                  disabled={loading}
                />
              </div>
            </div>
          )}
        </div>

        {/* Monitoring & Network */}
        <div className="bg-card space-y-4 rounded-xl border p-6">
          <h3 className="text-sm font-semibold">Monitoring & Network</h3>
          <div className="flex items-center gap-2">
            <Checkbox
              id="tmpl-monitoring"
              checked={enableMonitoring}
              onCheckedChange={(c) => setEnableMonitoring(c === true)}
              disabled={loading}
            />
            <Label htmlFor="tmpl-monitoring" className="cursor-pointer text-xs">
              Enable Prometheus Monitoring
            </Label>
          </div>
          {enableMonitoring && (
            <div className="grid gap-2 sm:w-1/2">
              <Label className="text-xs">Metrics Port</Label>
              <Input
                type="number"
                min={1024}
                max={65535}
                value={monitoringPort}
                onChange={(e) => setMonitoringPort(parseInt(e.target.value) || 9145)}
                disabled={loading}
              />
            </div>
          )}
          <div className="grid gap-2 sm:w-1/2">
            <Label className="text-xs">Network Access Type</Label>
            <Select value={accessType} onValueChange={setAccessType}>
              <SelectTrigger disabled={loading}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pod">Pod IP</SelectItem>
                <SelectItem value="hostInternal">Host Internal</SelectItem>
                <SelectItem value="hostExternal">Host External</SelectItem>
                <SelectItem value="configuredIP">Configured IP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/k8s/templates")}
            disabled={loading}
          >
            Cancel
          </Button>
          <LoadingButton onClick={handleSubmit} loading={loading} disabled={!name.trim()}>
            Create AerospikeClusterTemplate
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
