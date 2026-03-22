import { useState, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { RackStorageVolumeEditor, RackTolerationsEditor } from "../wizard/rack-editors";
import type { RackAwareConfig, RackConfig, K8sNodeInfo } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Internal sub-components (mirrors wizard patterns)
// ---------------------------------------------------------------------------

function RackConfigJsonEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown> | undefined;
  onChange: (v: Record<string, unknown> | undefined) => void;
}) {
  const [rawText, setRawText] = useState(() => (config ? JSON.stringify(config, null, 2) : ""));
  const [parseError, setParseError] = useState<string | null>(null);

  // Sync rawText when config prop changes externally (e.g. dialog reset).
  // Uses the "adjusting state during render" pattern (no useEffect needed).
  const [prevConfig, setPrevConfig] = useState(config);
  const configJson = config ? JSON.stringify(config) : "";
  const prevConfigJson = prevConfig ? JSON.stringify(prevConfig) : "";
  if (configJson !== prevConfigJson) {
    setPrevConfig(config);
    setRawText(config ? JSON.stringify(config, null, 2) : "");
    setParseError(null);
  }

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

let nextExprId = 0;

interface AffinityExpression {
  _id: number;
  key: string;
  operator: string;
  values: string;
}

function RackAffinityEditor({
  affinity,
  onChange,
}: {
  affinity: Record<string, unknown> | undefined;
  onChange: (v: Record<string, unknown> | undefined) => void;
}) {
  const getExpressions = (): AffinityExpression[] => {
    try {
      const terms = (
        affinity as Record<string, Record<string, Record<string, Record<string, unknown>[]>>>
      )?.nodeAffinity?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms?.[0]
        ?.matchExpressions as { key: string; operator: string; values?: string[] }[] | undefined;
      return (terms ?? []).map((expr) => ({
        _id: ++nextExprId,
        key: expr.key ?? "",
        operator: expr.operator ?? "In",
        values: (expr.values ?? []).join(", "),
      }));
    } catch {
      return [];
    }
  };

  const [expressions, setExpressions] = useState<AffinityExpression[]>(() => getExpressions());

  const buildAffinity = (exprs: AffinityExpression[]) => {
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
    const next = [...expressions, { _id: ++nextExprId, key: "", operator: "In", values: "" }];
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
      {expressions.map((expr, idx) => (
        <div
          key={expr._id}
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

function RackOverridesContent({
  rack,
  racks,
  idx,
  onRacksChange,
}: {
  rack: RackConfig;
  racks: RackConfig[];
  idx: number;
  onRacksChange: (racks: RackConfig[]) => void;
}) {
  const updateRack = (updates: Partial<RackConfig>) => {
    const newRacks = [...racks];
    newRacks[idx] = { ...rack, ...updates };
    onRacksChange(newRacks);
  };

  const updatePodSpec = (updates: Partial<NonNullable<RackConfig["podSpec"]>>) => {
    updateRack({ podSpec: { ...rack.podSpec, ...updates } });
  };

  return (
    <div className="space-y-4">
      <RackConfigJsonEditor
        config={rack.aerospikeConfig}
        onChange={(parsed) => updateRack({ aerospikeConfig: parsed })}
      />
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
      <RackStorageVolumeEditor
        volumes={rack.storage?.volumes}
        onChange={(volumes) => updateRack({ storage: volumes ? { volumes } : undefined })}
      />
      <RackTolerationsEditor
        tolerations={rack.podSpec?.tolerations}
        onChange={(tolerations) => updatePodSpec({ tolerations })}
      />
      <RackAffinityEditor
        affinity={rack.podSpec?.affinity}
        onChange={(affinity) => updatePodSpec({ affinity })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface EditRackConfigSectionProps {
  rackConfig: RackAwareConfig | null;
  clusterSize: number;
  onChange: (config: RackAwareConfig | null) => void;
  disabled?: boolean;
  /** Pre-fetched K8s node list (fetched once by parent dialog) */
  nodes?: K8sNodeInfo[];
}

export function EditRackConfigSection({
  rackConfig,
  clusterSize,
  onChange,
  disabled,
  nodes = [],
}: EditRackConfigSectionProps) {
  const racks = rackConfig?.racks ?? [];
  const uniqueZones = [...new Set(nodes.map((n) => n.zone).filter(Boolean))];
  const uniqueRegions = [...new Set(nodes.map((n) => n.region).filter(Boolean))];

  const updateConfig = (updates: Partial<RackAwareConfig>) => {
    onChange({ ...rackConfig, racks: rackConfig?.racks ?? [], ...updates });
  };

  const updateRacks = (newRacks: RackConfig[]) => {
    updateConfig({ racks: newRacks });
  };

  if (racks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <p className="text-base-content/60 mb-2 text-xs">
          No racks configured. The cluster uses a single default rack.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange({ racks: [{ id: 1, zone: "", region: "" }] })}
        >
          Enable Multi-Rack
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Global rack settings */}
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1">
          <Label className="text-xs">Max Ignorable Pods</Label>
          <Input
            value={rackConfig?.maxIgnorablePods ?? ""}
            onChange={(e) => updateConfig({ maxIgnorablePods: e.target.value || undefined })}
            placeholder="e.g. 1 or 25%"
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Rolling Update Batch</Label>
          <Input
            value={rackConfig?.rollingUpdateBatchSize ?? ""}
            onChange={(e) => updateConfig({ rollingUpdateBatchSize: e.target.value || undefined })}
            placeholder="e.g. 1 or 25%"
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Scale Down Batch</Label>
          <Input
            value={rackConfig?.scaleDownBatchSize ?? ""}
            onChange={(e) => updateConfig({ scaleDownBatchSize: e.target.value || undefined })}
            placeholder="e.g. 1 or 25%"
            disabled={disabled}
          />
        </div>
      </div>

      {/* Per-rack cards */}
      {racks.map((rack, idx) => (
        <div key={rack.id} className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Label className="font-medium">Rack #{rack.id}</Label>
            <Button
              variant="ghost"
              size="sm"
              className="text-error h-7 px-2"
              disabled={disabled}
              onClick={() => updateRacks(racks.filter((_, i) => i !== idx))}
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
                    updateRacks(newRacks);
                  }}
                  disabled={disabled}
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
                    updateRacks(newRacks);
                  }}
                  placeholder="e.g. us-east-1a"
                  disabled={disabled}
                />
              )}
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Region</Label>
              {uniqueRegions.length > 0 ? (
                <Select
                  value={rack.region || ""}
                  onChange={(e) => {
                    const newRacks = [...racks];
                    newRacks[idx] = { ...rack, region: e.target.value || undefined };
                    updateRacks(newRacks);
                  }}
                  disabled={disabled}
                >
                  <option value="">Select region</option>
                  {uniqueRegions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={rack.region || ""}
                  onChange={(e) => {
                    const newRacks = [...racks];
                    newRacks[idx] = { ...rack, region: e.target.value || undefined };
                    updateRacks(newRacks);
                  }}
                  placeholder="e.g. us-east-1"
                  disabled={disabled}
                />
              )}
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Rack Label</Label>
              <Input
                value={rack.rackLabel ?? ""}
                onChange={(e) => {
                  const newRacks = [...racks];
                  newRacks[idx] = { ...rack, rackLabel: e.target.value || undefined };
                  updateRacks(newRacks);
                }}
                placeholder="Optional label"
                disabled={disabled}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Node Name</Label>
              {nodes.length > 0 ? (
                <Select
                  value={rack.nodeName || ""}
                  onChange={(e) => {
                    const newRacks = [...racks];
                    newRacks[idx] = { ...rack, nodeName: e.target.value || undefined };
                    updateRacks(newRacks);
                  }}
                  disabled={disabled}
                >
                  <option value="">Select node</option>
                  {nodes.map((n) => (
                    <option key={n.name} value={n.name}>
                      {n.name} {n.zone ? `(${n.zone})` : ""}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={rack.nodeName ?? ""}
                  onChange={(e) => {
                    const newRacks = [...racks];
                    newRacks[idx] = { ...rack, nodeName: e.target.value || undefined };
                    updateRacks(newRacks);
                  }}
                  placeholder="e.g. node-1"
                  disabled={disabled}
                />
              )}
            </div>
            <div className="col-span-2 grid gap-1">
              <Label className="text-xs">Revision</Label>
              <Input
                value={rack.revision ?? ""}
                onChange={(e) => {
                  const newRacks = [...racks];
                  newRacks[idx] = { ...rack, revision: e.target.value || undefined };
                  updateRacks(newRacks);
                }}
                placeholder="e.g. rev-1"
                disabled={disabled}
              />
              <p className="text-muted-foreground text-[10px]">
                Change to trigger rolling restart for this rack
              </p>
            </div>
          </div>
          <CollapsibleSection
            title="Rack Overrides (config, storage, scheduling)"
            size="sm"
            className="bg-base-200/30"
          >
            <RackOverridesContent rack={rack} racks={racks} idx={idx} onRacksChange={updateRacks} />
          </CollapsibleSection>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            const maxId = Math.max(0, ...racks.map((r) => r.id));
            updateRacks([...racks, { id: maxId + 1, zone: "", region: "" }]);
          }}
        >
          + Add Rack
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-warning"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          Disable Multi-Rack
        </Button>
      </div>
      <p className="text-base-content/60 text-xs">
        {clusterSize} nodes across {racks.length} racks:{" "}
        {clusterSize % racks.length === 0
          ? `${clusterSize / racks.length}`
          : `~${Math.floor(clusterSize / racks.length)}-${Math.ceil(clusterSize / racks.length)}`}{" "}
        pods per rack.
      </p>
    </div>
  );
}
