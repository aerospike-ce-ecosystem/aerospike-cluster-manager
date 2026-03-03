import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AEROSPIKE_IMAGES } from "@/lib/constants";
import type { NetworkAccessType } from "@/lib/api/types";
import type { WizardMonitoringStepProps } from "./types";

export function WizardMonitoringStep({
  form,
  updateForm,
  templates,
  overridesOpen,
  setOverridesOpen,
  templateOverrides,
  setTemplateOverrides,
}: WizardMonitoringStepProps) {
  return (
    <>
      <div className="flex items-center space-x-2">
        <Checkbox
          id="monitoring-enabled"
          checked={form.monitoring?.enabled ?? false}
          onCheckedChange={(checked) => {
            if (checked === true) {
              updateForm({ monitoring: { enabled: true, port: 9145 } });
            } else {
              updateForm({ monitoring: undefined });
            }
          }}
        />
        <Label htmlFor="monitoring-enabled" className="text-sm font-normal">
          Enable Prometheus monitoring
        </Label>
      </div>

      {form.monitoring?.enabled && (
        <div className="grid gap-2">
          <Label htmlFor="monitoring-port">Exporter Port</Label>
          <Input
            id="monitoring-port"
            type="number"
            min={1024}
            max={65535}
            value={form.monitoring.port}
            onChange={(e) =>
              updateForm({
                monitoring: {
                  enabled: true,
                  port: Math.min(65535, Math.max(1024, parseInt(e.target.value) || 9145)),
                },
              })
            }
          />
          <p className="text-muted-foreground text-xs">
            Port for the Aerospike Prometheus exporter sidecar (default: 9145).
          </p>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="template-ref">AerospikeClusterTemplate (optional)</Label>
        <Select
          value={form.templateRef || "__none__"}
          onValueChange={(v) => {
            const selected = v === "__none__" ? undefined : v;
            updateForm({ templateRef: selected, templateOverrides: undefined });
            if (!selected) {
              setTemplateOverrides({});
              setOverridesOpen(false);
            }
          }}
        >
          <SelectTrigger id="template-ref">
            <SelectValue placeholder="No template" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No template</SelectItem>
            {templates
              .filter((t) => t.namespace === form.namespace)
              .map((t) => (
                <SelectItem key={`${t.namespace}/${t.name}`} value={t.name}>
                  {t.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          Apply default settings from an AerospikeClusterTemplate resource.
        </p>
      </div>

      {form.templateRef && (
        <div className="rounded-lg border p-3">
          <button
            type="button"
            className="text-foreground flex w-full items-center gap-2 text-sm font-medium"
            onClick={() => setOverridesOpen(!overridesOpen)}
          >
            {overridesOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Template Overrides
            {(templateOverrides.image ||
              templateOverrides.size != null ||
              templateOverrides.resources) && (
              <span className="bg-accent/20 text-accent rounded-full px-2 py-0.5 text-[10px]">
                Active
              </span>
            )}
          </button>
          {overridesOpen && (
            <div className="mt-3 space-y-3">
              <p className="text-muted-foreground text-xs">
                Override specific fields from the template. These values take precedence
                over the template defaults.
              </p>
              <div className="grid gap-2">
                <Label htmlFor="override-image" className="text-xs">
                  Image Override
                </Label>
                <Select
                  value={templateOverrides.image || "__default__"}
                  onValueChange={(v) => {
                    const updated = {
                      ...templateOverrides,
                      image: v === "__default__" ? undefined : v,
                    };
                    setTemplateOverrides(updated);
                    updateForm({
                      templateOverrides:
                        updated.image || updated.size != null || updated.resources
                          ? updated
                          : undefined,
                    });
                  }}
                >
                  <SelectTrigger id="override-image">
                    <SelectValue placeholder="Use template default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Use template default</SelectItem>
                    {AEROSPIKE_IMAGES.map((img) => (
                      <SelectItem key={img} value={img}>
                        {img}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="override-size" className="text-xs">
                  Size Override (1-8 nodes)
                </Label>
                <Input
                  id="override-size"
                  type="number"
                  min={1}
                  max={8}
                  placeholder="Use template default"
                  value={templateOverrides.size ?? ""}
                  onChange={(e) => {
                    const val = e.target.value
                      ? Math.min(8, Math.max(1, parseInt(e.target.value) || 1))
                      : undefined;
                    const updated = { ...templateOverrides, size: val };
                    setTemplateOverrides(updated);
                    updateForm({
                      templateOverrides:
                        updated.image || updated.size != null || updated.resources
                          ? updated
                          : undefined,
                    });
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs">Resource Overrides</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label
                      htmlFor="override-cpu-req"
                      className="text-muted-foreground text-[10px]"
                    >
                      CPU Request
                    </Label>
                    <Input
                      id="override-cpu-req"
                      placeholder="e.g. 500m"
                      value={templateOverrides.resources?.requests?.cpu ?? ""}
                      onChange={(e) => {
                        const val = e.target.value || undefined;
                        const currentRes = templateOverrides.resources ?? {
                          requests: { cpu: "", memory: "" },
                          limits: { cpu: "", memory: "" },
                        };
                        const newRes = {
                          requests: { ...currentRes.requests, cpu: val ?? "" },
                          limits: { ...currentRes.limits },
                        };
                        const hasValues =
                          newRes.requests.cpu ||
                          newRes.requests.memory ||
                          newRes.limits.cpu ||
                          newRes.limits.memory;
                        const updated = {
                          ...templateOverrides,
                          resources: hasValues ? newRes : undefined,
                        };
                        setTemplateOverrides(updated);
                        updateForm({
                          templateOverrides:
                            updated.image || updated.size != null || updated.resources
                              ? updated
                              : undefined,
                        });
                      }}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label
                      htmlFor="override-cpu-lim"
                      className="text-muted-foreground text-[10px]"
                    >
                      CPU Limit
                    </Label>
                    <Input
                      id="override-cpu-lim"
                      placeholder="e.g. 2"
                      value={templateOverrides.resources?.limits?.cpu ?? ""}
                      onChange={(e) => {
                        const val = e.target.value || undefined;
                        const currentRes = templateOverrides.resources ?? {
                          requests: { cpu: "", memory: "" },
                          limits: { cpu: "", memory: "" },
                        };
                        const newRes = {
                          requests: { ...currentRes.requests },
                          limits: { ...currentRes.limits, cpu: val ?? "" },
                        };
                        const hasValues =
                          newRes.requests.cpu ||
                          newRes.requests.memory ||
                          newRes.limits.cpu ||
                          newRes.limits.memory;
                        const updated = {
                          ...templateOverrides,
                          resources: hasValues ? newRes : undefined,
                        };
                        setTemplateOverrides(updated);
                        updateForm({
                          templateOverrides:
                            updated.image || updated.size != null || updated.resources
                              ? updated
                              : undefined,
                        });
                      }}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label
                      htmlFor="override-mem-req"
                      className="text-muted-foreground text-[10px]"
                    >
                      Memory Request
                    </Label>
                    <Input
                      id="override-mem-req"
                      placeholder="e.g. 1Gi"
                      value={templateOverrides.resources?.requests?.memory ?? ""}
                      onChange={(e) => {
                        const val = e.target.value || undefined;
                        const currentRes = templateOverrides.resources ?? {
                          requests: { cpu: "", memory: "" },
                          limits: { cpu: "", memory: "" },
                        };
                        const newRes = {
                          requests: { ...currentRes.requests, memory: val ?? "" },
                          limits: { ...currentRes.limits },
                        };
                        const hasValues =
                          newRes.requests.cpu ||
                          newRes.requests.memory ||
                          newRes.limits.cpu ||
                          newRes.limits.memory;
                        const updated = {
                          ...templateOverrides,
                          resources: hasValues ? newRes : undefined,
                        };
                        setTemplateOverrides(updated);
                        updateForm({
                          templateOverrides:
                            updated.image || updated.size != null || updated.resources
                              ? updated
                              : undefined,
                        });
                      }}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label
                      htmlFor="override-mem-lim"
                      className="text-muted-foreground text-[10px]"
                    >
                      Memory Limit
                    </Label>
                    <Input
                      id="override-mem-lim"
                      placeholder="e.g. 4Gi"
                      value={templateOverrides.resources?.limits?.memory ?? ""}
                      onChange={(e) => {
                        const val = e.target.value || undefined;
                        const currentRes = templateOverrides.resources ?? {
                          requests: { cpu: "", memory: "" },
                          limits: { cpu: "", memory: "" },
                        };
                        const newRes = {
                          requests: { ...currentRes.requests },
                          limits: { ...currentRes.limits, memory: val ?? "" },
                        };
                        const hasValues =
                          newRes.requests.cpu ||
                          newRes.requests.memory ||
                          newRes.limits.cpu ||
                          newRes.limits.memory;
                        const updated = {
                          ...templateOverrides,
                          resources: hasValues ? newRes : undefined,
                        };
                        setTemplateOverrides(updated);
                        updateForm({
                          templateOverrides:
                            updated.image || updated.size != null || updated.resources
                              ? updated
                              : undefined,
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center space-x-2">
        <Checkbox
          id="dynamic-config"
          checked={form.enableDynamicConfig ?? false}
          onCheckedChange={(checked) =>
            updateForm({ enableDynamicConfig: checked === true })
          }
        />
        <Label htmlFor="dynamic-config" className="text-sm font-normal">
          Enable dynamic config (apply config changes without restart)
        </Label>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <span className="text-sm font-medium">Network Access</span>
        <p className="text-muted-foreground text-xs">
          Configure how clients and nodes communicate with the Aerospike cluster.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="access-type" className="text-xs">
              Client Access Type
            </Label>
            <Select
              value={form.networkPolicy?.accessType || "pod"}
              onValueChange={(v) => {
                const current = form.networkPolicy ?? { accessType: "pod" as const };
                updateForm({
                  networkPolicy:
                    v === "pod" && !current.alternateAccessType && !current.fabricType
                      ? undefined
                      : { ...current, accessType: v as NetworkAccessType },
                });
              }}
            >
              <SelectTrigger id="access-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pod">Pod IP (default)</SelectItem>
                <SelectItem value="hostInternal">Host Internal IP</SelectItem>
                <SelectItem value="hostExternal">Host External IP</SelectItem>
                <SelectItem value="configuredIP">Configured IP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fabric-type" className="text-xs">
              Fabric Type (inter-node)
            </Label>
            <Select
              value={form.networkPolicy?.fabricType || "pod"}
              onValueChange={(v) => {
                const current = form.networkPolicy ?? { accessType: "pod" as const };
                updateForm({
                  networkPolicy: {
                    ...current,
                    fabricType: v === "pod" ? undefined : (v as NetworkAccessType),
                  },
                });
              }}
            >
              <SelectTrigger id="fabric-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pod">Pod IP (default)</SelectItem>
                <SelectItem value="hostInternal">Host Internal IP</SelectItem>
                <SelectItem value="hostExternal">Host External IP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </>
  );
}
