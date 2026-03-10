import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WizardRackConfigStepProps } from "./types";
import type { RackConfig, TolerationConfig } from "@/lib/api/types";

function RackOverridesSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-muted/30 mt-2 rounded border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-xs font-medium"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {open && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </div>
  );
}

/** Storage volume override for a single rack volume entry. */
function RackStorageVolumeEditor({
  volumes,
  onChange,
}: {
  volumes: Record<string, unknown>[] | undefined;
  onChange: (v: Record<string, unknown>[] | undefined) => void;
}) {
  const items = volumes ?? [];

  const addVolume = () => {
    onChange([...items, { name: "", storageClass: "", size: "10Gi", mountPath: "/opt/aerospike/data" }]);
  };

  const updateVolume = (idx: number, field: string, value: string) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value || undefined };
    onChange(next);
  };

  const removeVolume = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">Storage Volume Overrides</Label>
      <p className="text-muted-foreground text-[10px]">
        Override storage volumes for this rack (e.g. different storage class or size).
      </p>
      {items.map((vol, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_1fr_auto_1fr_auto] items-end gap-2 rounded border p-2">
          <div className="grid gap-1">
            <Label className="text-[10px]">Name</Label>
            <Input
              value={String(vol.name ?? "")}
              onChange={(e) => updateVolume(idx, "name", e.target.value)}
              placeholder="e.g. data-vol"
              className="h-8 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Storage Class</Label>
            <Input
              value={String(vol.storageClass ?? "")}
              onChange={(e) => updateVolume(idx, "storageClass", e.target.value)}
              placeholder="e.g. gp3"
              className="h-8 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Size</Label>
            <Input
              value={String(vol.size ?? "")}
              onChange={(e) => updateVolume(idx, "size", e.target.value)}
              placeholder="e.g. 50Gi"
              className="h-8 w-24 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Mount Path</Label>
            <Input
              value={String(vol.mountPath ?? "")}
              onChange={(e) => updateVolume(idx, "mountPath", e.target.value)}
              placeholder="/opt/aerospike/data"
              className="h-8 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={() => removeVolume(idx)}
            className="text-muted-foreground hover:text-destructive mb-1 self-end p-1"
            title="Remove volume"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addVolume}
        className="text-accent hover:text-accent/80 flex items-center gap-1 text-xs font-medium"
      >
        <Plus className="h-3.5 w-3.5" /> Add Volume Override
      </button>
    </div>
  );
}

/** Per-rack tolerations editor. */
function RackTolerationsEditor({
  tolerations,
  onChange,
}: {
  tolerations: TolerationConfig[] | undefined;
  onChange: (v: TolerationConfig[] | undefined) => void;
}) {
  const items = tolerations ?? [];

  const addToleration = () => {
    onChange([...items, { key: "", operator: "Equal", value: "", effect: "NoSchedule" }]);
  };

  const updateToleration = (idx: number, updates: Partial<TolerationConfig>) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...updates };
    onChange(next);
  };

  const removeToleration = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">Tolerations</Label>
      <p className="text-muted-foreground text-[10px]">
        Allow this rack&apos;s pods to be scheduled on nodes with matching taints.
      </p>
      {items.map((tol, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[1fr_auto_1fr_auto_auto_auto] items-end gap-2 rounded border p-2"
        >
          <div className="grid gap-1">
            <Label className="text-[10px]">Key</Label>
            <Input
              value={tol.key ?? ""}
              onChange={(e) => updateToleration(idx, { key: e.target.value || undefined })}
              placeholder="e.g. dedicated"
              className="h-8 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Operator</Label>
            <Select
              value={tol.operator ?? "Equal"}
              onValueChange={(v) => updateToleration(idx, { operator: v as "Equal" | "Exists" })}
            >
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Equal">Equal</SelectItem>
                <SelectItem value="Exists">Exists</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Value</Label>
            <Input
              value={tol.value ?? ""}
              onChange={(e) => updateToleration(idx, { value: e.target.value || undefined })}
              placeholder={tol.operator === "Exists" ? "(ignored)" : "e.g. aerospike"}
              disabled={tol.operator === "Exists"}
              className="h-8 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Effect</Label>
            <Select
              value={tol.effect ?? ""}
              onValueChange={(v) =>
                updateToleration(idx, { effect: v as TolerationConfig["effect"] })
              }
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NoSchedule">NoSchedule</SelectItem>
                <SelectItem value="PreferNoSchedule">PreferNoSchedule</SelectItem>
                <SelectItem value="NoExecute">NoExecute</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Seconds</Label>
            <Input
              type="number"
              min={0}
              value={tol.tolerationSeconds ?? ""}
              onChange={(e) =>
                updateToleration(idx, {
                  tolerationSeconds: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })
              }
              placeholder="n/a"
              className="h-8 w-20 text-xs"
              disabled={tol.effect !== "NoExecute"}
            />
          </div>
          <button
            type="button"
            onClick={() => removeToleration(idx)}
            className="text-muted-foreground hover:text-destructive mb-1 self-end p-1"
            title="Remove toleration"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addToleration}
        className="text-accent hover:text-accent/80 flex items-center gap-1 text-xs font-medium"
      >
        <Plus className="h-3.5 w-3.5" /> Add Toleration
      </button>
    </div>
  );
}

/** Per-rack node affinity editor (simplified - required node affinity expressions). */
function RackAffinityEditor({
  affinity,
  onChange,
}: {
  affinity: Record<string, unknown> | undefined;
  onChange: (v: Record<string, unknown> | undefined) => void;
}) {
  // Extract existing node selector terms from the nested affinity structure
  const getExpressions = (): { key: string; operator: string; values: string }[] => {
    try {
      const terms = (affinity as Record<string, Record<string, Record<string, Record<string, unknown>[]>>>)
        ?.nodeAffinity
        ?.requiredDuringSchedulingIgnoredDuringExecution
        ?.nodeSelectorTerms?.[0]
        ?.matchExpressions as { key: string; operator: string; values?: string[] }[] | undefined;
      return (terms ?? []).map((expr) => ({
        key: expr.key ?? "",
        operator: expr.operator ?? "In",
        values: (expr.values ?? []).join(", "),
      }));
    } catch {
      return [];
    }
  };

  const [expressions, setExpressions] = useState<{ key: string; operator: string; values: string }[]>(
    () => getExpressions(),
  );

  const buildAffinity = (exprs: { key: string; operator: string; values: string }[]) => {
    const valid = exprs.filter((e) => e.key.trim());
    if (valid.length === 0) {
      onChange(undefined);
      return;
    }
    onChange({
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [
            {
              matchExpressions: valid.map((e) => ({
                key: e.key,
                operator: e.operator,
                ...(e.operator !== "Exists" && e.operator !== "DoesNotExist"
                  ? {
                      values: e.values
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }
                  : {}),
              })),
            },
          ],
        },
      },
    });
  };

  const addExpression = () => {
    const next = [...expressions, { key: "", operator: "In", values: "" }];
    setExpressions(next);
  };

  const updateExpression = (idx: number, field: string, value: string) => {
    const next = [...expressions];
    next[idx] = { ...next[idx], [field]: value };
    setExpressions(next);
    buildAffinity(next);
  };

  const removeExpression = (idx: number) => {
    const next = expressions.filter((_, i) => i !== idx);
    setExpressions(next);
    buildAffinity(next);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">Node Affinity Expressions</Label>
      <p className="text-muted-foreground text-[10px]">
        Required node affinity match expressions for this rack. Pods will only schedule on nodes
        matching all expressions.
      </p>
      {expressions.map((expr, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_auto_1fr_auto] items-end gap-2 rounded border p-2">
          <div className="grid gap-1">
            <Label className="text-[10px]">Key</Label>
            <Input
              value={expr.key}
              onChange={(e) => updateExpression(idx, "key", e.target.value)}
              placeholder="e.g. topology.kubernetes.io/zone"
              className="h-8 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Operator</Label>
            <Select
              value={expr.operator}
              onValueChange={(v) => updateExpression(idx, "operator", v)}
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="In">In</SelectItem>
                <SelectItem value="NotIn">NotIn</SelectItem>
                <SelectItem value="Exists">Exists</SelectItem>
                <SelectItem value="DoesNotExist">DoesNotExist</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Values (comma-separated)</Label>
            <Input
              value={expr.values}
              onChange={(e) => updateExpression(idx, "values", e.target.value)}
              placeholder="e.g. us-east-1a, us-east-1b"
              className="h-8 text-xs"
              disabled={expr.operator === "Exists" || expr.operator === "DoesNotExist"}
            />
          </div>
          <button
            type="button"
            onClick={() => removeExpression(idx)}
            className="text-muted-foreground hover:text-destructive mb-1 self-end p-1"
            title="Remove expression"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addExpression}
        className="text-accent hover:text-accent/80 flex items-center gap-1 text-xs font-medium"
      >
        <Plus className="h-3.5 w-3.5" /> Add Expression
      </button>
    </div>
  );
}

/** Unified rack overrides content: config, storage, scheduling. */
function RackOverridesContent({
  rack,
  racks,
  idx,
  updateRackConfig,
}: {
  rack: RackConfig;
  racks: RackConfig[];
  idx: number;
  updateRackConfig: (updates: { racks: RackConfig[] }) => void;
}) {
  const updateRack = (updates: Partial<RackConfig>) => {
    const newRacks = [...racks];
    newRacks[idx] = { ...rack, ...updates };
    updateRackConfig({ racks: newRacks });
  };

  const updatePodSpec = (updates: Partial<NonNullable<RackConfig["podSpec"]>>) => {
    updateRack({
      podSpec: {
        ...rack.podSpec,
        ...updates,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Aerospike Config Override */}
      <div className="grid gap-2">
        <Label className="text-xs">Aerospike Config Override (JSON)</Label>
        <Textarea
          value={rack.aerospikeConfig ? JSON.stringify(rack.aerospikeConfig, null, 2) : ""}
          onChange={(e) => {
            let parsed: Record<string, unknown> | undefined;
            try {
              parsed = e.target.value ? JSON.parse(e.target.value) : undefined;
            } catch {
              return;
            }
            updateRack({ aerospikeConfig: parsed });
          }}
          rows={3}
          className="font-mono text-xs"
          placeholder='{"namespaces": [...]}'
        />
      </div>

      {/* Node Selector */}
      <div className="grid gap-1">
        <Label className="text-xs">Node Selector (key=value, ...)</Label>
        <Input
          value={
            rack.podSpec?.nodeSelector
              ? Object.entries(rack.podSpec.nodeSelector)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ")
              : ""
          }
          onChange={(e) => {
            const entries = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const nodeSelector: Record<string, string> = {};
            for (const entry of entries) {
              const [k, v] = entry.split("=").map((s) => s.trim());
              if (k && v) nodeSelector[k] = v;
            }
            updatePodSpec({
              nodeSelector: Object.keys(nodeSelector).length > 0 ? nodeSelector : undefined,
            });
          }}
          placeholder="e.g. disktype=ssd, tier=high"
        />
      </div>

      {/* Storage Volume Overrides (Feature 3) */}
      <RackStorageVolumeEditor
        volumes={rack.storage?.volumes}
        onChange={(volumes) => {
          updateRack({
            storage: volumes ? { volumes } : undefined,
          });
        }}
      />

      {/* Tolerations (Feature 4) */}
      <RackTolerationsEditor
        tolerations={rack.podSpec?.tolerations}
        onChange={(tolerations) => {
          updatePodSpec({ tolerations });
        }}
      />

      {/* Node Affinity (Feature 4) */}
      <RackAffinityEditor
        affinity={rack.podSpec?.affinity}
        onChange={(affinity) => {
          updatePodSpec({ affinity });
        }}
      />
    </div>
  );
}

export function WizardRackConfigStep({ form, updateForm, nodes }: WizardRackConfigStepProps) {
  const racks = form.rackConfig?.racks ?? [];
  const rackConfig = form.rackConfig;
  const uniqueZones = [...new Set(nodes.map((n) => n.zone).filter(Boolean))];

  const updateRackConfig = (updates: Partial<typeof rackConfig>) => {
    updateForm({
      rackConfig: {
        ...rackConfig,
        racks: rackConfig?.racks ?? [],
        ...updates,
      },
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Configure multi-rack deployment for zone-aware pod distribution. Each rack gets its own
        StatefulSet with optional zone affinity.
      </p>

      {racks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-muted-foreground mb-3 text-sm">
            No racks configured. The cluster will use a single default rack.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              updateForm({
                rackConfig: {
                  racks: [{ id: 1, zone: "", region: "" }],
                },
              });
            }}
          >
            Enable Multi-Rack
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Rack-level global settings */}
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Max Ignorable Pods</Label>
              <Input
                value={rackConfig?.maxIgnorablePods ?? ""}
                onChange={(e) =>
                  updateRackConfig({ maxIgnorablePods: e.target.value || undefined })
                }
                placeholder="e.g. 1 or 25%"
              />
              <p className="text-muted-foreground text-[10px]">
                Tolerate stuck pods during reconciliation
              </p>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Rolling Update Batch Size</Label>
              <Input
                value={rackConfig?.rollingUpdateBatchSize ?? ""}
                onChange={(e) =>
                  updateRackConfig({ rollingUpdateBatchSize: e.target.value || undefined })
                }
                placeholder="e.g. 1 or 25%"
              />
              <p className="text-muted-foreground text-[10px]">
                Per-rack rolling update batch size
              </p>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Scale Down Batch Size</Label>
              <Input
                value={rackConfig?.scaleDownBatchSize ?? ""}
                onChange={(e) =>
                  updateRackConfig({ scaleDownBatchSize: e.target.value || undefined })
                }
                placeholder="e.g. 1 or 25%"
              />
            </div>
          </div>

          {racks.map((rack, idx) => (
            <div key={idx} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Rack #{rack.id}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-7 px-2"
                  onClick={() => {
                    const newRacks = racks.filter((_, i) => i !== idx);
                    updateRackConfig({ racks: newRacks });
                  }}
                >
                  Remove
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Zone</Label>
                  {uniqueZones.length > 0 ? (
                    <Select
                      value={rack.zone || ""}
                      onValueChange={(v) => {
                        const newRacks = [...racks];
                        newRacks[idx] = { ...rack, zone: v };
                        updateRackConfig({ racks: newRacks });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select zone" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueZones.map((z) => (
                          <SelectItem key={z} value={z}>
                            {z}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={rack.zone || ""}
                      onChange={(e) => {
                        const newRacks = [...racks];
                        newRacks[idx] = { ...rack, zone: e.target.value };
                        updateRackConfig({ racks: newRacks });
                      }}
                      placeholder="e.g. us-east-1a"
                    />
                  )}
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Rack Label</Label>
                  <Input
                    value={rack.rackLabel ?? ""}
                    onChange={(e) => {
                      const newRacks = [...racks];
                      newRacks[idx] = {
                        ...rack,
                        rackLabel: e.target.value || undefined,
                      };
                      updateRackConfig({ racks: newRacks });
                    }}
                    placeholder="Optional label"
                  />
                </div>
              </div>

              {/* Rack-level overrides */}
              <RackOverridesSection title="Rack Overrides (config, storage, scheduling)">
                <RackOverridesContent
                  rack={rack}
                  racks={racks}
                  idx={idx}
                  updateRackConfig={updateRackConfig}
                />
              </RackOverridesSection>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const maxId = Math.max(0, ...racks.map((r) => r.id));
              updateRackConfig({
                racks: [...racks, { id: maxId + 1, zone: "", region: "" }],
              });
            }}
          >
            + Add Rack
          </Button>
          <p className="text-muted-foreground text-xs">
            Tip: For {form.size} nodes across {racks.length} racks, approximately{" "}
            {`${Math.floor(form.size / racks.length)}-${Math.ceil(form.size / racks.length)}`} pods
            per rack.
          </p>
        </div>
      )}
    </div>
  );
}
