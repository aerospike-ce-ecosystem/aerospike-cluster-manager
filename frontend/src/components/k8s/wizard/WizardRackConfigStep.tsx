import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WizardRackConfigStepProps } from "./types";

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
                <div className="grid gap-2">
                  <Label className="text-xs">Aerospike Config Override (JSON)</Label>
                  <Textarea
                    value={
                      rack.aerospikeConfig ? JSON.stringify(rack.aerospikeConfig, null, 2) : ""
                    }
                    onChange={(e) => {
                      const newRacks = [...racks];
                      let parsed: Record<string, unknown> | undefined;
                      try {
                        parsed = e.target.value ? JSON.parse(e.target.value) : undefined;
                      } catch {
                        // Keep raw text; will be invalid but user is still typing
                        return;
                      }
                      newRacks[idx] = { ...rack, aerospikeConfig: parsed };
                      updateRackConfig({ racks: newRacks });
                    }}
                    rows={3}
                    className="font-mono text-xs"
                    placeholder='{"namespaces": [...]}'
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                        const newRacks = [...racks];
                        const entries = e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const nodeSelector: Record<string, string> = {};
                        for (const entry of entries) {
                          const [k, v] = entry.split("=").map((s) => s.trim());
                          if (k && v) nodeSelector[k] = v;
                        }
                        newRacks[idx] = {
                          ...rack,
                          podSpec: {
                            ...rack.podSpec,
                            nodeSelector:
                              Object.keys(nodeSelector).length > 0 ? nodeSelector : undefined,
                          },
                        };
                        updateRackConfig({ racks: newRacks });
                      }}
                      placeholder="e.g. disktype=ssd, tier=high"
                    />
                  </div>
                </div>
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
