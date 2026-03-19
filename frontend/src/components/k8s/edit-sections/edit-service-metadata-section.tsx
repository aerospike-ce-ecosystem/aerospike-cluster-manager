"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { KeyValueEditor } from "@/components/common/key-value-editor";
import type { ServiceMetadataConfig } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Service Metadata Section for Edit Dialog
// ---------------------------------------------------------------------------

export function EditServiceMetadataSection({
  podServiceConfig,
  headlessServiceConfig,
  disabled,
  onPodServiceConfigChange,
  onHeadlessServiceConfigChange,
}: {
  podServiceConfig: ServiceMetadataConfig | null;
  headlessServiceConfig: ServiceMetadataConfig | null;
  disabled?: boolean;
  onPodServiceConfigChange: (v: ServiceMetadataConfig | null) => void;
  onHeadlessServiceConfigChange: (v: ServiceMetadataConfig | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="edit-pod-service" className="cursor-pointer text-xs">
            Enable per-pod Service
          </Label>
          <p className="text-muted-foreground text-[10px]">
            Create a dedicated K8s Service for each Aerospike pod.
          </p>
        </div>
        <Switch
          id="edit-pod-service"
          checked={podServiceConfig != null}
          onCheckedChange={(checked) => {
            onPodServiceConfigChange(checked ? {} : null);
          }}
          disabled={disabled}
        />
      </div>
      {podServiceConfig != null && (
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-[10px] font-semibold">Pod Service Annotations</Label>
            <KeyValueEditor
              value={podServiceConfig.annotations}
              onChange={(v) =>
                onPodServiceConfigChange({ ...podServiceConfig, annotations: v })
              }
              keyPlaceholder="annotation key"
              valuePlaceholder="value"
              disabled={disabled}
              size="sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[10px] font-semibold">Pod Service Labels</Label>
            <KeyValueEditor
              value={podServiceConfig.labels}
              onChange={(v) =>
                onPodServiceConfigChange({ ...podServiceConfig, labels: v })
              }
              keyPlaceholder="label key"
              valuePlaceholder="value"
              disabled={disabled}
              size="sm"
            />
          </div>
        </div>
      )}

      <div className="border-t pt-3">
        <Label className="text-xs font-semibold">Headless Service Metadata</Label>
        <p className="text-muted-foreground mb-2 text-[10px]">
          Custom annotations and labels for the headless Service.
        </p>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-[10px] font-semibold">Annotations</Label>
            <KeyValueEditor
              value={headlessServiceConfig?.annotations}
              onChange={(v) => {
                const next = { ...headlessServiceConfig, annotations: v };
                if (!next.annotations && !next.labels) {
                  onHeadlessServiceConfigChange(null);
                } else {
                  onHeadlessServiceConfigChange(next);
                }
              }}
              keyPlaceholder="annotation key"
              valuePlaceholder="value"
              disabled={disabled}
              size="sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[10px] font-semibold">Labels</Label>
            <KeyValueEditor
              value={headlessServiceConfig?.labels}
              onChange={(v) => {
                const next = { ...headlessServiceConfig, labels: v };
                if (!next.annotations && !next.labels) {
                  onHeadlessServiceConfigChange(null);
                } else {
                  onHeadlessServiceConfigChange(next);
                }
              }}
              keyPlaceholder="label key"
              valuePlaceholder="value"
              disabled={disabled}
              size="sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
