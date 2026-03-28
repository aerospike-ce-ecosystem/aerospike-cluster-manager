import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { RackStorageVolumeEditor, RackTolerationsEditor } from "./rack-editors";
import type { WizardRackConfigStepProps } from "./types";
import type { RackConfig } from "@/lib/api/types";

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
      const terms = (
        affinity as Record<string, Record<string, Record<string, Record<string, unknown>[]>>>
      )?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms?.[0]
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

  const [expressions, setExpressions] = useState<
    { key: string; operator: string; values: string }[]
  >(() => getExpressions());

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
        <div
          key={idx}
          className="grid grid-cols-[1fr_auto_1fr_auto] items-end gap-2 rounded border p-2"
        >
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
              onChange={(e) => updateExpression(idx, "operator", e.target.value)}
              className="h-8 w-32 text-xs"
            >
              <option value="In">In</option>
              <option value="NotIn">NotIn</option>
              <option value="Exists">Exists</option>
              <option value="DoesNotExist">DoesNotExist</option>
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
        className="text-primary hover:text-primary/80 flex items-center gap-1 text-xs font-medium"
      >
        <Plus className="h-3.5 w-3.5" /> Add Expression
      </button>
    </div>
  );
}

/** Aerospike config override editor with JSON validation feedback. */
function RackConfigJsonEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown> | undefined;
  onChange: (v: Record<string, unknown> | undefined) => void;
}) {
  const [rawText, setRawText] = useState(() => (config ? JSON.stringify(config, null, 2) : ""));
  const [parseError, setParseError] = useState<string | null>(null);

  const handleChange = useCallback(
    (text: string) => {
      setRawText(text);
      if (!text.trim()) {
        setParseError(null);
        onChange(undefined);
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
          setParseError("Must be a JSON object");
          return;
        }
        setParseError(null);
        onChange(parsed);
      } catch {
        setParseError("Invalid JSON");
      }
    },
    [onChange],
  );

  return (
    <div className="grid gap-2">
      <Label className="text-xs">Aerospike Config Override (JSON)</Label>
      <Textarea
        value={rawText}
        onChange={(e) => handleChange(e.target.value)}
        rows={3}
        className={`font-mono text-xs ${parseError ? "border-error" : ""}`}
        placeholder='{"namespaces": [...]}'
      />
      {parseError && <p className="text-error text-xs">{parseError}</p>}
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
      <RackConfigJsonEditor
        config={rack.aerospikeConfig}
        onChange={(parsed) => updateRack({ aerospikeConfig: parsed })}
      />

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

      {/* Storage Volume Overrides */}
      <RackStorageVolumeEditor
        volumes={rack.storage?.volumes}
        onChange={(volumes) => {
          updateRack({
            storage: volumes ? { volumes } : undefined,
          });
        }}
      />

      {/* Tolerations */}
      <RackTolerationsEditor
        tolerations={rack.podSpec?.tolerations}
        onChange={(tolerations) => {
          updatePodSpec({ tolerations });
        }}
      />

      {/* Node Affinity */}
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
      <p className="text-base-content/60 text-sm">
        Configure multi-rack deployment for zone-aware pod distribution. Each rack gets its own
        StatefulSet with optional zone affinity.
      </p>

      {racks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-base-content/60 mb-3 text-sm">
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
              <p className="text-base-content/60 text-[10px]">
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
              <p className="text-base-content/60 text-[10px]">Per-rack rolling update batch size</p>
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
                  className="text-error h-7 px-2"
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
                      onChange={(e) => {
                        const newRacks = [...racks];
                        newRacks[idx] = { ...rack, zone: e.target.value };
                        updateRackConfig({ racks: newRacks });
                      }}
                    >
                      <option value="">Select zone</option>
                      {uniqueZones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
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
              <CollapsibleSection
                title="Rack Overrides (config, storage, scheduling)"
                size="sm"
                className="bg-base-200/30"
              >
                <RackOverridesContent
                  rack={rack}
                  racks={racks}
                  idx={idx}
                  updateRackConfig={updateRackConfig}
                />
              </CollapsibleSection>
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
          <p className="text-base-content/60 text-xs">
            Tip: For {form.size} nodes across {racks.length} racks, approximately{" "}
            {`${Math.floor(form.size / racks.length)}-${Math.ceil(form.size / racks.length)}`} pods
            per rack.
          </p>
        </div>
      )}
    </div>
  );
}
