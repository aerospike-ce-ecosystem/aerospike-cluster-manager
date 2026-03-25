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
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { KeyValueEditor } from "@/components/common/key-value-editor";
import { Plus, X } from "lucide-react";
import type {
  K8sTemplateDetail,
  UpdateK8sTemplateRequest,
  TopologySpreadConstraintConfig,
  TemplateServiceConfig,
} from "@/lib/api/types";

const KNOWN_SERVICE_KEYS = new Set([
  "proto-fd-max",
  "protoFdMax",
  "feature-key-file",
  "featureKeyFile",
]);

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
  // Network config (heartbeat)
  const [heartbeatMode, setHeartbeatMode] = useState<"mesh" | "multicast">("mesh");
  const [heartbeatInterval, setHeartbeatInterval] = useState<number | undefined>(undefined);
  const [heartbeatTimeout, setHeartbeatTimeout] = useState<number | undefined>(undefined);
  // Rack config
  const [maxRacksPerNode, setMaxRacksPerNode] = useState<number | undefined>(undefined);
  // Topology Spread Constraints
  const [topologySpreadConstraints, setTopologySpreadConstraints] = useState<
    TopologySpreadConstraintConfig[]
  >([]);
  // Service Config
  const [protoFdMax, setProtoFdMax] = useState<number | undefined>(undefined);
  const [serviceExtraParams, setServiceExtraParams] = useState<{ key: string; value: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive initial values
  const scheduling = spec.scheduling as Record<string, unknown> | undefined;
  const monitoring = spec.monitoring as Record<string, unknown> | undefined;
  const resources = spec.resources as Record<string, Record<string, string>> | undefined;
  const networkConfig = spec.networkConfig as Record<string, unknown> | undefined;
  const rackConfigSpec = spec.rackConfig as Record<string, unknown> | undefined;

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
  const initialHeartbeatMode = (networkConfig?.heartbeatMode as "mesh" | "multicast") || "mesh";
  const initialHeartbeatInterval =
    networkConfig?.heartbeatInterval != null ? Number(networkConfig.heartbeatInterval) : undefined;
  const initialHeartbeatTimeout =
    networkConfig?.heartbeatTimeout != null ? Number(networkConfig.heartbeatTimeout) : undefined;
  const initialMaxRacksPerNode =
    rackConfigSpec?.maxRacksPerNode != null ? Number(rackConfigSpec.maxRacksPerNode) : undefined;
  const initialTopologySpreadConstraints = useMemo<TopologySpreadConstraintConfig[]>(
    () =>
      (scheduling?.topologySpreadConstraints as TopologySpreadConstraintConfig[] | undefined) ?? [],
    [scheduling?.topologySpreadConstraints],
  );
  // Service config: read from spec.aerospikeConfig.service (CRD format) or spec.serviceConfig (API format)
  const aerospikeConfig = spec.aerospikeConfig as Record<string, unknown> | undefined;
  const serviceSection =
    (aerospikeConfig?.service as Record<string, unknown> | undefined) ??
    (spec.serviceConfig as Record<string, unknown> | undefined);
  const initialProtoFdMax =
    serviceSection?.["proto-fd-max"] != null
      ? Number(serviceSection["proto-fd-max"])
      : serviceSection?.protoFdMax != null
        ? Number(serviceSection.protoFdMax)
        : undefined;
  const initialServiceExtraParams = useMemo<{ key: string; value: string }[]>(
    () =>
      serviceSection
        ? Object.entries(serviceSection)
            .filter(([k]) => !KNOWN_SERVICE_KEYS.has(k))
            .map(([k, v]) => ({ key: k, value: String(v) }))
        : [],
    [serviceSection],
  );

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
      setHeartbeatMode(initialHeartbeatMode);
      setHeartbeatInterval(initialHeartbeatInterval);
      setHeartbeatTimeout(initialHeartbeatTimeout);
      setMaxRacksPerNode(initialMaxRacksPerNode);
      setTopologySpreadConstraints(initialTopologySpreadConstraints.map((t) => ({ ...t })));
      setProtoFdMax(initialProtoFdMax);
      setServiceExtraParams(initialServiceExtraParams.map((p) => ({ ...p })));
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
      memLimit !== initialMemLimit ||
      heartbeatMode !== initialHeartbeatMode ||
      heartbeatInterval !== initialHeartbeatInterval ||
      heartbeatTimeout !== initialHeartbeatTimeout ||
      maxRacksPerNode !== initialMaxRacksPerNode ||
      JSON.stringify(topologySpreadConstraints) !==
        JSON.stringify(initialTopologySpreadConstraints) ||
      protoFdMax !== initialProtoFdMax ||
      JSON.stringify(serviceExtraParams) !== JSON.stringify(initialServiceExtraParams)
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
    heartbeatMode,
    heartbeatInterval,
    heartbeatTimeout,
    maxRacksPerNode,
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
    initialHeartbeatMode,
    initialHeartbeatInterval,
    initialHeartbeatTimeout,
    initialMaxRacksPerNode,
    topologySpreadConstraints,
    initialTopologySpreadConstraints,
    protoFdMax,
    initialProtoFdMax,
    serviceExtraParams,
    initialServiceExtraParams,
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
      const schedulingChanged =
        antiAffinity !== initialAntiAffinity ||
        podManagementPolicy !== initialPodManagementPolicy ||
        JSON.stringify(topologySpreadConstraints) !==
          JSON.stringify(initialTopologySpreadConstraints);
      if (schedulingChanged) {
        data.scheduling = {};
        if (antiAffinity) {
          data.scheduling.podAntiAffinityLevel = antiAffinity as "none" | "preferred" | "required";
        }
        if (podManagementPolicy) {
          data.scheduling.podManagementPolicy = podManagementPolicy as "OrderedReady" | "Parallel";
        }
        if (topologySpreadConstraints.length > 0) {
          data.scheduling.topologySpreadConstraints =
            topologySpreadConstraints as unknown as Record<string, unknown>[];
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

      // Network Config
      if (
        heartbeatMode !== initialHeartbeatMode ||
        heartbeatInterval !== initialHeartbeatInterval ||
        heartbeatTimeout !== initialHeartbeatTimeout
      ) {
        data.networkConfig = {
          heartbeatMode: heartbeatMode,
          ...(heartbeatInterval != null ? { heartbeatInterval } : {}),
          ...(heartbeatTimeout != null ? { heartbeatTimeout } : {}),
        };
      }

      // Rack Config
      if (maxRacksPerNode !== initialMaxRacksPerNode) {
        data.rackConfig = maxRacksPerNode != null ? { maxRacksPerNode } : undefined;
      }

      // Service Config
      const serviceChanged =
        protoFdMax !== initialProtoFdMax ||
        JSON.stringify(serviceExtraParams) !== JSON.stringify(initialServiceExtraParams);
      if (serviceChanged) {
        const svcConfig: TemplateServiceConfig = {};
        if (protoFdMax != null) {
          svcConfig.protoFdMax = protoFdMax;
        }
        const validExtra = serviceExtraParams.filter((p) => p.key.trim() && p.value.trim());
        if (validExtra.length > 0) {
          svcConfig.extraParams = {};
          for (const param of validExtra) {
            const numVal = Number(param.value);
            svcConfig.extraParams[param.key.trim()] = isNaN(numVal) ? param.value.trim() : numVal;
          }
        }
        data.serviceConfig = svcConfig;
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
          {error && <p className="text-error text-sm">{error}</p>}

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
            <Select
              value={antiAffinity || "none"}
              onChange={(e) => setAntiAffinity(e.target.value)}
            >
              <option value="none">None</option>
              <option value="preferred">Preferred</option>
              <option value="required">Required</option>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Pod Management Policy</Label>
            <Select
              value={podManagementPolicy || "OrderedReady"}
              onChange={(e) => setPodManagementPolicy(e.target.value)}
            >
              <option value="OrderedReady">OrderedReady</option>
              <option value="Parallel">Parallel</option>
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

          {/* Network Config (Heartbeat) */}
          <div className="space-y-2">
            <Label className="font-semibold">Network Config (Heartbeat)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="tmpl-hb-mode" className="text-xs">
                  Heartbeat Mode
                </Label>
                <Select
                  value={heartbeatMode}
                  onValueChange={(v) => setHeartbeatMode(v as "mesh" | "multicast")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mesh">Mesh (CE only)</SelectItem>
                    <SelectItem value="multicast">Multicast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="tmpl-hb-interval" className="text-xs">
                  Heartbeat Interval (ms)
                </Label>
                <Input
                  id="tmpl-hb-interval"
                  type="number"
                  min={50}
                  value={heartbeatInterval ?? ""}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setHeartbeatInterval(isNaN(v) ? undefined : Math.max(50, v));
                  }}
                  placeholder="Default (150)"
                />
              </div>
              <div>
                <Label htmlFor="tmpl-hb-timeout" className="text-xs">
                  Heartbeat Timeout (intervals)
                </Label>
                <Input
                  id="tmpl-hb-timeout"
                  type="number"
                  min={1}
                  value={heartbeatTimeout ?? ""}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setHeartbeatTimeout(isNaN(v) ? undefined : Math.max(1, v));
                  }}
                  placeholder="Default (10)"
                />
              </div>
            </div>
          </div>

          {/* Rack Config */}
          <div className="space-y-1">
            <Label htmlFor="tmpl-max-racks" className="font-semibold">
              Max Racks Per Node
            </Label>
            <Input
              id="tmpl-max-racks"
              type="number"
              min={1}
              value={maxRacksPerNode ?? ""}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setMaxRacksPerNode(isNaN(v) ? undefined : Math.max(1, v));
              }}
              placeholder="No limit"
            />
            <p className="text-muted-foreground text-xs">
              Maximum number of racks per Kubernetes node. Leave empty for no limit.
            </p>
          </div>

          {/* Service Config */}
          <div className="space-y-2">
            <Label className="font-semibold">Service Config</Label>
            <p className="text-muted-foreground text-xs">
              Aerospike service-level configuration defaults (maps to aerospikeConfig.service).
            </p>
            <div className="space-y-2">
              <div>
                <Label htmlFor="tmpl-proto-fd-max" className="text-xs">
                  proto-fd-max (Max Client Connections)
                </Label>
                <Input
                  id="tmpl-proto-fd-max"
                  type="number"
                  min={0}
                  value={protoFdMax ?? ""}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setProtoFdMax(isNaN(v) ? undefined : Math.max(0, v));
                  }}
                  placeholder="Default (15000)"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Additional Service Parameters</Label>
                <KeyValueEditor
                  value={
                    serviceExtraParams.length > 0
                      ? Object.fromEntries(
                          serviceExtraParams
                            .filter((p) => p.key.trim())
                            .map((p) => [p.key, p.value]),
                        )
                      : undefined
                  }
                  onChange={(v) => {
                    if (!v) {
                      setServiceExtraParams([]);
                    } else {
                      setServiceExtraParams(
                        Object.entries(v).map(([key, value]) => ({ key, value })),
                      );
                    }
                  }}
                  keyPlaceholder="Key (e.g. migrate-threads)"
                  valuePlaceholder="Value"
                  addLabel="Add"
                />
              </div>
            </div>
          </div>

          {/* Topology Spread Constraints */}
          <div className="space-y-2">
            <Label className="font-semibold">Topology Spread Constraints</Label>
            <p className="text-muted-foreground text-xs">
              Control how pods are spread across topology domains (zones, nodes, etc.).
            </p>
            {topologySpreadConstraints.map((tsc, idx) => (
              <div key={idx} className="space-y-2 rounded border p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Constraint #{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTopologySpreadConstraints(
                        topologySpreadConstraints.filter((_, i) => i !== idx),
                      );
                    }}
                    className="text-muted-foreground hover:text-destructive p-1"
                    title="Remove constraint"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">Max Skew</Label>
                    <Input
                      type="number"
                      min={1}
                      value={tsc.maxSkew}
                      onChange={(e) => {
                        const next = [...topologySpreadConstraints];
                        next[idx] = { ...next[idx], maxSkew: parseInt(e.target.value) || 1 };
                        setTopologySpreadConstraints(next);
                      }}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Topology Key</Label>
                    <Select
                      value={tsc.topologyKey}
                      onChange={(e) => {
                        const next = [...topologySpreadConstraints];
                        next[idx] = { ...next[idx], topologyKey: e.target.value };
                        setTopologySpreadConstraints(next);
                      }}
                    >
                      <option value="topology.kubernetes.io/zone">
                        topology.kubernetes.io/zone
                      </option>
                      <option value="kubernetes.io/hostname">kubernetes.io/hostname</option>
                      <option value="topology.kubernetes.io/region">
                        topology.kubernetes.io/region
                      </option>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">When Unsatisfiable</Label>
                    <Select
                      value={tsc.whenUnsatisfiable}
                      onChange={(e) => {
                        const next = [...topologySpreadConstraints];
                        next[idx] = {
                          ...next[idx],
                          whenUnsatisfiable: e.target.value as "DoNotSchedule" | "ScheduleAnyway",
                        };
                        setTopologySpreadConstraints(next);
                      }}
                    >
                      <option value="DoNotSchedule">DoNotSchedule</option>
                      <option value="ScheduleAnyway">ScheduleAnyway</option>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">
                    Label Selector (optional, key=value comma-separated)
                  </Label>
                  <Input
                    value={
                      tsc.labelSelector
                        ? Object.entries(tsc.labelSelector)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(", ")
                        : ""
                    }
                    onChange={(e) => {
                      const entries = e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                      const labels: Record<string, string> = {};
                      for (const entry of entries) {
                        const [k, v] = entry.split("=").map((s) => s.trim());
                        if (k && v) labels[k] = v;
                      }
                      const next = [...topologySpreadConstraints];
                      next[idx] = {
                        ...next[idx],
                        labelSelector: Object.keys(labels).length > 0 ? labels : undefined,
                      };
                      setTopologySpreadConstraints(next);
                    }}
                    placeholder="e.g. app=aerospike, env=prod"
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                setTopologySpreadConstraints([
                  ...topologySpreadConstraints,
                  {
                    maxSkew: 1,
                    topologyKey: "topology.kubernetes.io/zone",
                    whenUnsatisfiable: "DoNotSchedule",
                  },
                ]);
              }}
              className="text-primary hover:text-primary/80 flex items-center gap-1 text-xs font-medium"
            >
              <Plus className="h-3.5 w-3.5" /> Add Topology Spread Constraint
            </button>
          </div>
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
