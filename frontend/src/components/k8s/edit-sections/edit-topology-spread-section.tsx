"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import type { TopologySpreadConstraintConfig } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Topology Spread Constraints Section for Edit Dialog
// ---------------------------------------------------------------------------

export function EditTopologySpreadSection({
  constraints,
  disabled,
  onChange,
}: {
  constraints: TopologySpreadConstraintConfig[];
  disabled?: boolean;
  onChange: (v: TopologySpreadConstraintConfig[]) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-base-content/60 text-[10px]">
        Control how pods are spread across topology domains.
      </p>
      {constraints.map((tsc, idx) => (
        <div key={idx} className="space-y-2 rounded border p-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium">Constraint #{idx + 1}</span>
            <button
              type="button"
              onClick={() => {
                onChange(constraints.filter((_, i) => i !== idx));
              }}
              className="text-base-content/60 hover:text-error p-0.5"
              disabled={disabled}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-1">
              <Label className="text-[10px]">Max Skew</Label>
              <Input
                type="number"
                min={1}
                value={tsc.maxSkew}
                onChange={(e) => {
                  const next = [...constraints];
                  next[idx] = { ...next[idx], maxSkew: parseInt(e.target.value) || 1 };
                  onChange(next);
                }}
                className="h-7 text-[10px]"
                disabled={disabled}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px]">Topology Key</Label>
              <Select
                value={tsc.topologyKey}
                onChange={(e) => {
                  const next = [...constraints];
                  next[idx] = { ...next[idx], topologyKey: e.target.value };
                  onChange(next);
                }}
                className="h-7 text-[10px]"
                disabled={disabled}
              >
                <option value="topology.kubernetes.io/zone">topology.kubernetes.io/zone</option>
                <option value="kubernetes.io/hostname">kubernetes.io/hostname</option>
                <option value="topology.kubernetes.io/region">topology.kubernetes.io/region</option>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px]">When Unsatisfiable</Label>
              <Select
                value={tsc.whenUnsatisfiable}
                onChange={(e) => {
                  const next = [...constraints];
                  next[idx] = {
                    ...next[idx],
                    whenUnsatisfiable: e.target.value as "DoNotSchedule" | "ScheduleAnyway",
                  };
                  onChange(next);
                }}
                className="h-7 text-[10px]"
                disabled={disabled}
              >
                <option value="DoNotSchedule">DoNotSchedule</option>
                <option value="ScheduleAnyway">ScheduleAnyway</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Label Selector (key=value, comma-separated)</Label>
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
                  const eqIdx = entry.indexOf("=");
                  if (eqIdx > 0) {
                    labels[entry.slice(0, eqIdx).trim()] = entry.slice(eqIdx + 1).trim();
                  }
                }
                const next = [...constraints];
                next[idx] = {
                  ...next[idx],
                  labelSelector: Object.keys(labels).length > 0 ? labels : undefined,
                };
                onChange(next);
              }}
              placeholder="e.g. app=aerospike"
              className="h-7 text-[10px]"
              disabled={disabled}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          onChange([
            ...constraints,
            {
              maxSkew: 1,
              topologyKey: "topology.kubernetes.io/zone",
              whenUnsatisfiable: "DoNotSchedule",
            },
          ]);
        }}
        className="text-primary hover:text-primary/80 flex items-center gap-1 text-[10px] font-medium"
        disabled={disabled}
      >
        <Plus className="h-3 w-3" /> Add Constraint
      </button>
    </div>
  );
}
