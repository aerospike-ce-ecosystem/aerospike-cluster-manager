import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ResourceConfig } from "@/lib/api/types";

interface ExporterResourcesEditorProps {
  resources: ResourceConfig | undefined;
  onChange: (resources: ResourceConfig | undefined) => void;
}

/** Exporter sidecar resource requests/limits editor. */
export function ExporterResourcesEditor({ resources, onChange }: ExporterResourcesEditorProps) {
  const enabled = resources != null;

  const defaults: ResourceConfig = {
    requests: { cpu: "100m", memory: "128Mi" },
    limits: { cpu: "200m", memory: "256Mi" },
  };

  const current = resources ?? defaults;

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="exporter-resources-enabled"
          checked={enabled}
          onCheckedChange={(checked) => {
            if (checked === true) {
              onChange(defaults);
            } else {
              onChange(undefined);
            }
          }}
        />
        <Label htmlFor="exporter-resources-enabled" className="text-sm font-normal">
          Set exporter resource requests/limits
        </Label>
      </div>

      {enabled && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">CPU Request</Label>
              <Input
                value={current.requests.cpu}
                onChange={(e) =>
                  onChange({
                    ...current,
                    requests: { ...current.requests, cpu: e.target.value },
                  })
                }
                placeholder="100m"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Memory Request</Label>
              <Input
                value={current.requests.memory}
                onChange={(e) =>
                  onChange({
                    ...current,
                    requests: { ...current.requests, memory: e.target.value },
                  })
                }
                placeholder="128Mi"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">CPU Limit</Label>
              <Input
                value={current.limits.cpu}
                onChange={(e) =>
                  onChange({
                    ...current,
                    limits: { ...current.limits, cpu: e.target.value },
                  })
                }
                placeholder="200m"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Memory Limit</Label>
              <Input
                value={current.limits.memory}
                onChange={(e) =>
                  onChange({
                    ...current,
                    limits: { ...current.limits, memory: e.target.value },
                  })
                }
                placeholder="256Mi"
              />
            </div>
          </div>
          <p className="text-base-content/60 text-xs">
            Resource requests/limits for the Prometheus exporter sidecar container.
          </p>
        </div>
      )}
    </div>
  );
}
