"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ResourceConfig } from "@/lib/api/types";

interface EditResourcesSectionProps {
  resources: ResourceConfig | null;
  onChange: (resources: ResourceConfig | null) => void;
  disabled?: boolean;
}

export function EditResourcesSection({ resources, onChange, disabled }: EditResourcesSectionProps) {
  const update = (section: "requests" | "limits", field: "cpu" | "memory", value: string) => {
    const current = resources ?? {
      requests: { cpu: "", memory: "" },
      limits: { cpu: "", memory: "" },
    };
    onChange({
      ...current,
      [section]: { ...current[section], [field]: value },
    });
  };

  const req = resources?.requests ?? { cpu: "", memory: "" };
  const lim = resources?.limits ?? { cpu: "", memory: "" };

  const hasAnyValue = req.cpu || req.memory || lim.cpu || lim.memory;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-xs font-medium">Requests</Label>
          <div className="grid gap-1">
            <Label htmlFor="edit-req-cpu" className="text-base-content/60 text-[10px]">
              CPU
            </Label>
            <Input
              id="edit-req-cpu"
              value={req.cpu}
              onChange={(e) => update("requests", "cpu", e.target.value)}
              placeholder="e.g. 500m, 1, 2"
              disabled={disabled}
              className="text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="edit-req-mem" className="text-base-content/60 text-[10px]">
              Memory
            </Label>
            <Input
              id="edit-req-mem"
              value={req.memory}
              onChange={(e) => update("requests", "memory", e.target.value)}
              placeholder="e.g. 1Gi, 512Mi"
              disabled={disabled}
              className="text-xs"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Limits</Label>
          <div className="grid gap-1">
            <Label htmlFor="edit-lim-cpu" className="text-base-content/60 text-[10px]">
              CPU
            </Label>
            <Input
              id="edit-lim-cpu"
              value={lim.cpu}
              onChange={(e) => update("limits", "cpu", e.target.value)}
              placeholder="e.g. 1, 2, 4"
              disabled={disabled}
              className="text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="edit-lim-mem" className="text-base-content/60 text-[10px]">
              Memory
            </Label>
            <Input
              id="edit-lim-mem"
              value={lim.memory}
              onChange={(e) => update("limits", "memory", e.target.value)}
              placeholder="e.g. 2Gi, 4Gi"
              disabled={disabled}
              className="text-xs"
            />
          </div>
        </div>
      </div>
      {hasAnyValue && (
        <p className="text-base-content/60 text-[10px]">
          Use Kubernetes resource notation: CPU (e.g. &quot;500m&quot;, &quot;1&quot;), Memory (e.g.
          &quot;512Mi&quot;, &quot;1Gi&quot;)
        </p>
      )}
    </div>
  );
}
