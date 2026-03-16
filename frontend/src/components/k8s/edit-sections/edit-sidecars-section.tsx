"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import type { SidecarConfig } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Sidecars & Init Containers Section for Edit Dialog
// ---------------------------------------------------------------------------

function EditContainerEntry({
  container,
  onChange,
  onRemove,
  disabled,
}: {
  container: SidecarConfig;
  onChange: (updated: SidecarConfig) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = container.name || "(unnamed)";

  const updateField = <K extends keyof SidecarConfig>(key: K, value: SidecarConfig[K]) => {
    onChange({ ...container, [key]: value });
  };

  return (
    <div className="rounded border">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-left text-xs font-medium"
        >
          {expanded ? (
            <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
          )}
          <span className="font-mono">{label}</span>
          {container.image && (
            <span className="text-muted-foreground text-[10px]">({container.image})</span>
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="text-muted-foreground hover:text-destructive p-0.5"
          title="Remove"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && (
        <div className="space-y-2 border-t px-3 pt-2 pb-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-0.5">
              <Label className="text-[10px]">Name *</Label>
              <Input
                value={container.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="e.g. log-collector"
                className="h-7 text-[10px]"
                disabled={disabled}
              />
            </div>
            <div className="grid gap-0.5">
              <Label className="text-[10px]">Image *</Label>
              <Input
                value={container.image}
                onChange={(e) => updateField("image", e.target.value)}
                placeholder="e.g. fluent/fluent-bit:latest"
                className="h-7 text-[10px]"
                disabled={disabled}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-0.5">
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
                placeholder='/bin/sh, -c, "echo hi"'
                className="h-7 text-[10px]"
                disabled={disabled}
              />
            </div>
            <div className="grid gap-0.5">
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
                placeholder="--config, /etc/config.yaml"
                className="h-7 text-[10px]"
                disabled={disabled}
              />
            </div>
          </div>
          {/* Env vars - simple comma-separated key=value */}
          <div className="grid gap-0.5">
            <Label className="text-[10px]">Env Vars (NAME=value, ...)</Label>
            <Input
              value={(container.env ?? []).map((e) => `${e.name}=${e.value ?? ""}`).join(", ")}
              onChange={(e) => {
                const entries = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const envList = entries
                  .map((entry) => {
                    const eqIdx = entry.indexOf("=");
                    if (eqIdx > 0) {
                      return {
                        name: entry.slice(0, eqIdx).trim(),
                        value: entry.slice(eqIdx + 1).trim() || undefined,
                      };
                    }
                    return { name: entry.trim() };
                  })
                  .filter((e) => e.name);
                updateField("env", envList.length > 0 ? envList : undefined);
              }}
              placeholder="MY_VAR=value, OTHER=123"
              className="h-7 text-[10px]"
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function EditSidecarsSection({
  sidecars,
  initContainers,
  onSidecarsChange,
  onInitContainersChange,
  loading,
}: {
  sidecars: SidecarConfig[];
  initContainers: SidecarConfig[];
  onSidecarsChange: (sc: SidecarConfig[]) => void;
  onInitContainersChange: (ic: SidecarConfig[]) => void;
  loading: boolean;
}) {
  const totalCount = sidecars.length + initContainers.length;
  const summary =
    totalCount > 0
      ? [
          sidecars.length > 0 ? `${sidecars.length} sidecar(s)` : null,
          initContainers.length > 0 ? `${initContainers.length} init` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : "None";

  return (
    <CollapsibleSection title="Sidecars & Init Containers" summary={summary} size="sm">
      <div className="space-y-3">
        {/* Sidecars */}
        <div className="space-y-2">
          <Label className="text-[10px] font-semibold">Sidecar Containers</Label>
          {sidecars.map((sc, idx) => (
            <EditContainerEntry
              key={idx}
              container={sc}
              onChange={(updated) => {
                const next = [...sidecars];
                next[idx] = updated;
                onSidecarsChange(next);
              }}
              onRemove={() => onSidecarsChange(sidecars.filter((_, i) => i !== idx))}
              disabled={loading}
            />
          ))}
          <button
            type="button"
            onClick={() => onSidecarsChange([...sidecars, { name: "", image: "" }])}
            disabled={loading}
            className="text-accent hover:text-accent/80 flex items-center gap-1 text-[10px] font-medium disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Add Sidecar
          </button>
        </div>

        {/* Init Containers */}
        <div className="space-y-2 border-t pt-2">
          <Label className="text-[10px] font-semibold">Init Containers</Label>
          {initContainers.map((ic, idx) => (
            <EditContainerEntry
              key={idx}
              container={ic}
              onChange={(updated) => {
                const next = [...initContainers];
                next[idx] = updated;
                onInitContainersChange(next);
              }}
              onRemove={() => onInitContainersChange(initContainers.filter((_, i) => i !== idx))}
              disabled={loading}
            />
          ))}
          <button
            type="button"
            onClick={() => onInitContainersChange([...initContainers, { name: "", image: "" }])}
            disabled={loading}
            className="text-accent hover:text-accent/80 flex items-center gap-1 text-[10px] font-medium disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Add Init Container
          </button>
        </div>
      </div>
    </CollapsibleSection>
  );
}
