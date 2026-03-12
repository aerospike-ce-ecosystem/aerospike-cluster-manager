import { useState } from "react";
import { Plus, X, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WizardStepProps } from "./types";
import type {
  SidecarConfig,
  ContainerPortConfig,
  ContainerEnvConfig,
  ContainerVolumeMountConfig,
} from "@/lib/api/types";

function emptySidecar(): SidecarConfig {
  return { name: "", image: "" };
}

function ContainerEditor({
  container,
  onChange,
  onRemove,
}: {
  container: SidecarConfig;
  onChange: (updated: SidecarConfig) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const updateField = <K extends keyof SidecarConfig>(key: K, value: SidecarConfig[K]) => {
    onChange({ ...container, [key]: value });
  };

  // --- Port helpers ---
  const addPort = () => {
    const current = container.ports ?? [];
    updateField("ports", [...current, { containerPort: 8080 }]);
  };

  const updatePort = (idx: number, updates: Partial<ContainerPortConfig>) => {
    const current = [...(container.ports ?? [])];
    current[idx] = { ...current[idx], ...updates };
    updateField("ports", current);
  };

  const removePort = (idx: number) => {
    const next = (container.ports ?? []).filter((_, i) => i !== idx);
    updateField("ports", next.length > 0 ? next : undefined);
  };

  // --- Env helpers ---
  const addEnv = () => {
    const current = container.env ?? [];
    updateField("env", [...current, { name: "", value: "" }]);
  };

  const updateEnv = (idx: number, updates: Partial<ContainerEnvConfig>) => {
    const current = [...(container.env ?? [])];
    current[idx] = { ...current[idx], ...updates };
    updateField("env", current);
  };

  const removeEnv = (idx: number) => {
    const next = (container.env ?? []).filter((_, i) => i !== idx);
    updateField("env", next.length > 0 ? next : undefined);
  };

  // --- Volume mount helpers ---
  const addVolumeMount = () => {
    const current = container.volumeMounts ?? [];
    updateField("volumeMounts", [...current, { name: "", mountPath: "" }]);
  };

  const updateVolumeMount = (idx: number, updates: Partial<ContainerVolumeMountConfig>) => {
    const current = [...(container.volumeMounts ?? [])];
    current[idx] = { ...current[idx], ...updates };
    updateField("volumeMounts", current);
  };

  const removeVolumeMount = (idx: number) => {
    const next = (container.volumeMounts ?? []).filter((_, i) => i !== idx);
    updateField("volumeMounts", next.length > 0 ? next : undefined);
  };

  const label = container.name || "(unnamed)";

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between p-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-left text-sm font-medium"
        >
          {expanded ? (
            <ChevronDown className="text-muted-foreground h-4 w-4" />
          ) : (
            <ChevronRight className="text-muted-foreground h-4 w-4" />
          )}
          <span className="font-mono text-xs">{label}</span>
          {container.image && (
            <span className="text-muted-foreground text-[10px]">({container.image})</span>
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive p-1"
          title="Remove container"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t px-3 pt-3 pb-3">
          {/* Name & Image */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-[10px]">Name *</Label>
              <Input
                value={container.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="e.g. log-collector"
                className="h-8 text-xs"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px]">Image *</Label>
              <Input
                value={container.image}
                onChange={(e) => updateField("image", e.target.value)}
                placeholder="e.g. fluent/fluent-bit:latest"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Command & Args */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-[10px]">Command (comma-separated)</Label>
              <Input
                value={(container.command ?? []).join(", ")}
                onChange={(e) => {
                  const parts = e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  updateField("command", parts.length > 0 ? parts : undefined);
                }}
                placeholder='e.g. /bin/sh, -c, "echo hello"'
                className="h-8 text-xs"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px]">Args (comma-separated)</Label>
              <Input
                value={(container.args ?? []).join(", ")}
                onChange={(e) => {
                  const parts = e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  updateField("args", parts.length > 0 ? parts : undefined);
                }}
                placeholder="e.g. --config, /etc/config.yaml"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Resources */}
          <div className="grid gap-1">
            <Label className="text-[10px] font-semibold">Resources</Label>
            <div className="grid grid-cols-4 gap-2">
              <div className="grid gap-0.5">
                <Label className="text-[10px]">CPU Req</Label>
                <Input
                  value={container.resources?.requests?.cpu ?? ""}
                  onChange={(e) => {
                    const res = container.resources ?? {
                      requests: { cpu: "", memory: "" },
                      limits: { cpu: "", memory: "" },
                    };
                    updateField("resources", {
                      ...res,
                      requests: { ...res.requests, cpu: e.target.value },
                    });
                  }}
                  placeholder="100m"
                  className="h-7 text-[10px]"
                />
              </div>
              <div className="grid gap-0.5">
                <Label className="text-[10px]">CPU Lim</Label>
                <Input
                  value={container.resources?.limits?.cpu ?? ""}
                  onChange={(e) => {
                    const res = container.resources ?? {
                      requests: { cpu: "", memory: "" },
                      limits: { cpu: "", memory: "" },
                    };
                    updateField("resources", {
                      ...res,
                      limits: { ...res.limits, cpu: e.target.value },
                    });
                  }}
                  placeholder="500m"
                  className="h-7 text-[10px]"
                />
              </div>
              <div className="grid gap-0.5">
                <Label className="text-[10px]">Mem Req</Label>
                <Input
                  value={container.resources?.requests?.memory ?? ""}
                  onChange={(e) => {
                    const res = container.resources ?? {
                      requests: { cpu: "", memory: "" },
                      limits: { cpu: "", memory: "" },
                    };
                    updateField("resources", {
                      ...res,
                      requests: { ...res.requests, memory: e.target.value },
                    });
                  }}
                  placeholder="64Mi"
                  className="h-7 text-[10px]"
                />
              </div>
              <div className="grid gap-0.5">
                <Label className="text-[10px]">Mem Lim</Label>
                <Input
                  value={container.resources?.limits?.memory ?? ""}
                  onChange={(e) => {
                    const res = container.resources ?? {
                      requests: { cpu: "", memory: "" },
                      limits: { cpu: "", memory: "" },
                    };
                    updateField("resources", {
                      ...res,
                      limits: { ...res.limits, memory: e.target.value },
                    });
                  }}
                  placeholder="256Mi"
                  className="h-7 text-[10px]"
                />
              </div>
            </div>
          </div>

          {/* Ports */}
          <div className="grid gap-1">
            <Label className="text-[10px] font-semibold">Ports</Label>
            {(container.ports ?? []).map((port, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_80px_80px_auto] items-end gap-2">
                <div className="grid gap-0.5">
                  <Label className="text-[10px]">Name</Label>
                  <Input
                    value={port.name ?? ""}
                    onChange={(e) => updatePort(idx, { name: e.target.value || undefined })}
                    placeholder="http"
                    className="h-7 text-[10px]"
                  />
                </div>
                <div className="grid gap-0.5">
                  <Label className="text-[10px]">Port</Label>
                  <Input
                    type="number"
                    value={port.containerPort}
                    onChange={(e) =>
                      updatePort(idx, { containerPort: parseInt(e.target.value, 10) || 0 })
                    }
                    className="h-7 text-[10px]"
                  />
                </div>
                <div className="grid gap-0.5">
                  <Label className="text-[10px]">Protocol</Label>
                  <Input
                    value={port.protocol ?? ""}
                    onChange={(e) => updatePort(idx, { protocol: e.target.value || undefined })}
                    placeholder="TCP"
                    className="h-7 text-[10px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removePort(idx)}
                  className="text-muted-foreground hover:text-destructive mb-1 self-end p-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addPort}
              className="text-accent hover:text-accent/80 flex items-center gap-1 text-[10px] font-medium"
            >
              <Plus className="h-3 w-3" /> Add Port
            </button>
          </div>

          {/* Environment Variables */}
          <div className="grid gap-1">
            <Label className="text-[10px] font-semibold">Environment Variables</Label>
            {(container.env ?? []).map((envVar, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <div className="grid gap-0.5">
                  <Label className="text-[10px]">Name</Label>
                  <Input
                    value={envVar.name}
                    onChange={(e) => updateEnv(idx, { name: e.target.value })}
                    placeholder="MY_VAR"
                    className="h-7 text-[10px]"
                  />
                </div>
                <div className="grid gap-0.5">
                  <Label className="text-[10px]">Value</Label>
                  <Input
                    value={envVar.value ?? ""}
                    onChange={(e) => updateEnv(idx, { value: e.target.value || undefined })}
                    placeholder="my-value"
                    className="h-7 text-[10px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeEnv(idx)}
                  className="text-muted-foreground hover:text-destructive mb-1 self-end p-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addEnv}
              className="text-accent hover:text-accent/80 flex items-center gap-1 text-[10px] font-medium"
            >
              <Plus className="h-3 w-3" /> Add Env Var
            </button>
          </div>

          {/* Volume Mounts */}
          <div className="grid gap-1">
            <Label className="text-[10px] font-semibold">Volume Mounts</Label>
            {(container.volumeMounts ?? []).map((vm, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <div className="grid gap-0.5">
                  <Label className="text-[10px]">Name</Label>
                  <Input
                    value={vm.name}
                    onChange={(e) => updateVolumeMount(idx, { name: e.target.value })}
                    placeholder="data-vol"
                    className="h-7 text-[10px]"
                  />
                </div>
                <div className="grid gap-0.5">
                  <Label className="text-[10px]">Mount Path</Label>
                  <Input
                    value={vm.mountPath}
                    onChange={(e) => updateVolumeMount(idx, { mountPath: e.target.value })}
                    placeholder="/var/log"
                    className="h-7 text-[10px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeVolumeMount(idx)}
                  className="text-muted-foreground hover:text-destructive mb-1 self-end p-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addVolumeMount}
              className="text-accent hover:text-accent/80 flex items-center gap-1 text-[10px] font-medium"
            >
              <Plus className="h-3 w-3" /> Add Volume Mount
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContainerListEditor({
  title,
  description,
  containers,
  onChange,
}: {
  title: string;
  description: string;
  containers: SidecarConfig[];
  onChange: (containers: SidecarConfig[] | undefined) => void;
}) {
  const addContainer = () => {
    onChange([...containers, emptySidecar()]);
  };

  const updateContainer = (idx: number, updated: SidecarConfig) => {
    const next = [...containers];
    next[idx] = updated;
    onChange(next);
  };

  const removeContainer = (idx: number) => {
    const next = containers.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-semibold">{title}</Label>
        <p className="text-muted-foreground text-[10px]">{description}</p>
      </div>

      {containers.map((container, idx) => (
        <ContainerEditor
          key={idx}
          container={container}
          onChange={(updated) => updateContainer(idx, updated)}
          onRemove={() => removeContainer(idx)}
        />
      ))}

      <button
        type="button"
        onClick={addContainer}
        className="text-accent hover:text-accent/80 flex items-center gap-1 text-xs font-medium"
      >
        <Plus className="h-3.5 w-3.5" /> Add {title.replace(/s$/, "")}
      </button>
    </div>
  );
}

export function WizardSidecarsStep({ form, updateForm }: WizardStepProps) {
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Add sidecar containers that run alongside the Aerospike server, and init containers that run
        before the main container starts.
      </p>

      <ContainerListEditor
        title="Sidecar Containers"
        description="Sidecar containers run alongside the main Aerospike container in each pod. Common use cases include log collectors, monitoring agents, and service meshes."
        containers={form.sidecars ?? []}
        onChange={(sidecars) => updateForm({ sidecars })}
      />

      <div className="border-t pt-4">
        <ContainerListEditor
          title="Init Containers"
          description="Init containers run to completion before the main Aerospike container starts. Use them for setup tasks like downloading configs, waiting for dependencies, or initializing storage."
          containers={form.initContainers ?? []}
          onChange={(initContainers) => updateForm({ initContainers })}
        />
      </div>
    </div>
  );
}
