import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  NetworkAccessType,
  LoadBalancerSpec,
  MonitoringConfig,
  ResourceConfig,
} from "@/lib/api/types";
import type { WizardMonitoringStepProps } from "./types";

/** Inline key-value pair editor for Record<string, string> fields. */
function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = "key",
  valuePlaceholder = "value",
  addLabel = "Add entry",
}: {
  value: Record<string, string> | undefined;
  onChange: (v: Record<string, string> | undefined) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
}) {
  const entries = value ? Object.entries(value) : [];
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const addEntry = () => {
    const k = newKey.trim();
    const v = newVal.trim();
    if (!k) return;
    onChange({ ...value, [k]: v });
    setNewKey("");
    setNewVal("");
  };

  const removeEntry = (key: string) => {
    if (!value) return;
    const next = { ...value };
    delete next[key];
    onChange(Object.keys(next).length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <code className="bg-muted truncate rounded px-2 py-1 text-xs">{k}</code>
          <span className="text-muted-foreground text-xs">=</span>
          <code className="bg-muted flex-1 truncate rounded px-2 py-1 text-xs">{v}</code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => removeEntry(k)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          className="h-8 text-xs"
          placeholder={keyPlaceholder}
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEntry())}
        />
        <Input
          className="h-8 text-xs"
          placeholder={valuePlaceholder}
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEntry())}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs"
          onClick={addEntry}
          disabled={!newKey.trim()}
        >
          <Plus className="mr-1 h-3 w-3" />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

/** Multi-value input for string arrays (e.g. CIDR ranges). */
function MultiValueInput({
  value,
  onChange,
  placeholder = "Enter value",
  addLabel = "Add",
  validate,
}: {
  value: string[] | undefined;
  onChange: (v: string[] | undefined) => void;
  placeholder?: string;
  addLabel?: string;
  validate?: (v: string) => boolean;
}) {
  const items = value ?? [];
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addItem = () => {
    const v = input.trim();
    if (!v) return;
    if (validate && !validate(v)) {
      setError("Invalid format");
      return;
    }
    setError(null);
    if (!items.includes(v)) {
      onChange([...items, v]);
    }
    setInput("");
  };

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, idx) => (
            <span
              key={item}
              className="bg-muted inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
            >
              {item}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => removeItem(idx)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          className="h-8 text-xs"
          placeholder={placeholder}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs"
          onClick={addItem}
          disabled={!input.trim()}
        >
          <Plus className="mr-1 h-3 w-3" />
          {addLabel}
        </Button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/** Inline collapsible section (same pattern as WizardAdvancedStep). */
function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div>
          <span className="text-sm font-medium">{title}</span>
          <span className="text-muted-foreground ml-2 text-xs">{summary}</span>
        </div>
        {open ? (
          <ChevronDown className="text-muted-foreground h-4 w-4" />
        ) : (
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        )}
      </button>
      {open && <div className="space-y-4 border-t px-4 pt-4 pb-4">{children}</div>}
    </div>
  );
}

/** Exporter sidecar resource requests/limits editor. */
function ExporterResourcesEditor({
  resources,
  onChange,
}: {
  resources: ResourceConfig | undefined;
  onChange: (resources: ResourceConfig | undefined) => void;
}) {
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
          <p className="text-muted-foreground text-xs">
            Resource requests/limits for the Prometheus exporter sidecar container.
          </p>
        </div>
      )}
    </div>
  );
}

/** Simple CIDR validation (e.g. 10.0.0.0/8). */
function isValidCIDR(v: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(v);
}

export function WizardMonitoringStep({ form, updateForm }: WizardMonitoringStepProps) {
  const [showLBAdvanced, setShowLBAdvanced] = useState(false);

  /** Helper to update nested LoadBalancer fields without losing siblings. */
  const updateLoadBalancer = (updates: Partial<LoadBalancerSpec>) => {
    updateForm({
      seedsFinderServices: {
        loadBalancer: {
          ...form.seedsFinderServices!.loadBalancer!,
          ...updates,
        },
      },
    });
  };

  /** Helper to spread-update the monitoring object while preserving existing fields. */
  const patchMonitoring = (patch: Partial<MonitoringConfig>) => {
    updateForm({
      monitoring: {
        ...form.monitoring!,
        ...patch,
      },
    });
  };

  const hasConfiguredIP =
    form.networkPolicy?.accessType === "configuredIP" ||
    form.networkPolicy?.alternateAccessType === "configuredIP" ||
    form.networkPolicy?.fabricType === "configuredIP";

  const monitoring = form.monitoring;

  return (
    <>
      {/* ── Enable Monitoring ── */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="monitoring-enabled"
          checked={monitoring?.enabled ?? false}
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

      {monitoring?.enabled && (
        <div className="space-y-4">
          {/* ── Port & Exporter Image ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="monitoring-port">Exporter Port</Label>
              <Input
                id="monitoring-port"
                type="number"
                min={1024}
                max={65535}
                value={monitoring.port}
                onChange={(e) =>
                  patchMonitoring({
                    port: Math.min(65535, Math.max(1024, parseInt(e.target.value) || 9145)),
                  })
                }
              />
              <p className="text-muted-foreground text-xs">
                Port for the Aerospike Prometheus exporter sidecar (default: 9145).
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="monitoring-exporter-image">Exporter Image</Label>
              <Input
                id="monitoring-exporter-image"
                value={monitoring.exporterImage ?? ""}
                onChange={(e) =>
                  patchMonitoring({
                    exporterImage: e.target.value || undefined,
                  })
                }
                placeholder="aerospike/aerospike-prometheus-exporter:latest"
              />
              <p className="text-muted-foreground text-xs">
                Custom exporter sidecar image. Leave blank for the operator default.
              </p>
            </div>
          </div>

          {/* ── Metric Labels ── */}
          <div className="space-y-2 rounded-lg border p-4">
            <span className="text-sm font-medium">Metric Labels</span>
            <p className="text-muted-foreground text-xs">
              Custom labels added to all exported Prometheus metrics.
            </p>
            <KeyValueEditor
              value={monitoring.metricLabels}
              onChange={(labels) => patchMonitoring({ metricLabels: labels })}
              keyPlaceholder="label name"
              valuePlaceholder="label value"
              addLabel="Add label"
            />
          </div>

          {/* ── Exporter Resources ── */}
          <CollapsibleSection
            title="Exporter Resources"
            summary={
              monitoring.resources
                ? `${monitoring.resources.requests.cpu} / ${monitoring.resources.requests.memory}`
                : "Defaults"
            }
          >
            <ExporterResourcesEditor
              resources={monitoring.resources}
              onChange={(resources) => patchMonitoring({ resources })}
            />
          </CollapsibleSection>

          {/* ── ServiceMonitor ── */}
          <CollapsibleSection
            title="ServiceMonitor"
            summary={monitoring.serviceMonitor?.enabled ? "Enabled" : "Disabled"}
          >
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="service-monitor-enabled"
                  checked={monitoring.serviceMonitor?.enabled ?? false}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      patchMonitoring({
                        serviceMonitor: {
                          enabled: true,
                          ...(monitoring.serviceMonitor ?? {}),
                        },
                      });
                    } else {
                      patchMonitoring({ serviceMonitor: undefined });
                    }
                  }}
                />
                <Label htmlFor="service-monitor-enabled" className="text-sm font-normal">
                  Enable ServiceMonitor (requires Prometheus Operator)
                </Label>
              </div>

              {monitoring.serviceMonitor?.enabled && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="sm-interval" className="text-xs">
                      Scrape Interval
                    </Label>
                    <Input
                      id="sm-interval"
                      value={monitoring.serviceMonitor.interval ?? ""}
                      onChange={(e) =>
                        patchMonitoring({
                          serviceMonitor: {
                            ...monitoring.serviceMonitor!,
                            interval: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder="30s"
                      className="max-w-[200px]"
                    />
                    <p className="text-muted-foreground text-xs">
                      How often Prometheus scrapes metrics (e.g. &quot;30s&quot;, &quot;1m&quot;).
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">ServiceMonitor Labels</Label>
                    <p className="text-muted-foreground text-xs">
                      Labels for ServiceMonitor discovery (must match your Prometheus selector).
                    </p>
                    <KeyValueEditor
                      value={monitoring.serviceMonitor.labels}
                      onChange={(labels) =>
                        patchMonitoring({
                          serviceMonitor: { ...monitoring.serviceMonitor!, labels },
                        })
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </CollapsibleSection>

          {/* ── PrometheusRule ── */}
          <CollapsibleSection
            title="PrometheusRule"
            summary={monitoring.prometheusRule?.enabled ? "Enabled" : "Disabled"}
          >
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="prom-rule-enabled"
                  checked={monitoring.prometheusRule?.enabled ?? false}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      patchMonitoring({
                        prometheusRule: {
                          enabled: true,
                          ...(monitoring.prometheusRule ?? {}),
                        },
                      });
                    } else {
                      patchMonitoring({ prometheusRule: undefined });
                    }
                  }}
                />
                <Label htmlFor="prom-rule-enabled" className="text-sm font-normal">
                  Enable PrometheusRule (requires Prometheus Operator)
                </Label>
              </div>

              {monitoring.prometheusRule?.enabled && (
                <div className="space-y-2">
                  <Label className="text-xs">PrometheusRule Labels</Label>
                  <p className="text-muted-foreground text-xs">
                    Labels for PrometheusRule discovery (must match your Prometheus rule selector).
                  </p>
                  <KeyValueEditor
                    value={monitoring.prometheusRule.labels}
                    onChange={(labels) =>
                      patchMonitoring({
                        prometheusRule: { ...monitoring.prometheusRule!, labels },
                      })
                    }
                  />
                </div>
              )}
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* ── Enable Dynamic Config ── */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="dynamic-config"
          checked={form.enableDynamicConfig ?? false}
          onCheckedChange={(checked) => updateForm({ enableDynamicConfig: checked === true })}
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

        {hasConfiguredIP && (
          <div className="mt-3 space-y-3 rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              Configured IP requires custom network names (comma-separated).
            </p>
            {form.networkPolicy?.accessType === "configuredIP" && (
              <div className="grid gap-1">
                <Label htmlFor="custom-access-names" className="text-xs">
                  Access Network Names
                </Label>
                <Input
                  id="custom-access-names"
                  placeholder="e.g. networkName1,networkName2"
                  value={form.networkPolicy?.customAccessNetworkNames?.join(",") ?? ""}
                  onChange={(e) => {
                    const names = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    updateForm({
                      networkPolicy: {
                        ...form.networkPolicy!,
                        customAccessNetworkNames: names.length > 0 ? names : undefined,
                      },
                    });
                  }}
                />
              </div>
            )}
            {form.networkPolicy?.alternateAccessType === "configuredIP" && (
              <div className="grid gap-1">
                <Label htmlFor="custom-alt-access-names" className="text-xs">
                  Alternate Access Network Names
                </Label>
                <Input
                  id="custom-alt-access-names"
                  placeholder="e.g. networkName1,networkName2"
                  value={form.networkPolicy?.customAlternateAccessNetworkNames?.join(",") ?? ""}
                  onChange={(e) => {
                    const names = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    updateForm({
                      networkPolicy: {
                        ...form.networkPolicy!,
                        customAlternateAccessNetworkNames: names.length > 0 ? names : undefined,
                      },
                    });
                  }}
                />
              </div>
            )}
            {form.networkPolicy?.fabricType === "configuredIP" && (
              <div className="grid gap-1">
                <Label htmlFor="custom-fabric-names" className="text-xs">
                  Fabric Network Names
                </Label>
                <Input
                  id="custom-fabric-names"
                  placeholder="e.g. networkName1,networkName2"
                  value={form.networkPolicy?.customFabricNetworkNames?.join(",") ?? ""}
                  onChange={(e) => {
                    const names = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    updateForm({
                      networkPolicy: {
                        ...form.networkPolicy!,
                        customFabricNetworkNames: names.length > 0 ? names : undefined,
                      },
                    });
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Network Policy (auto-generate K8s NetworkPolicy) */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="network-policy-config"
            checked={form.networkPolicyConfig?.enabled ?? false}
            onCheckedChange={(checked) => {
              if (checked === true) {
                updateForm({ networkPolicyConfig: { enabled: true, type: "kubernetes" } });
              } else {
                updateForm({ networkPolicyConfig: undefined });
              }
            }}
          />
          <Label htmlFor="network-policy-config" className="text-sm font-normal">
            Auto-generate Kubernetes NetworkPolicy
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          Automatically create K8s NetworkPolicy resources to restrict traffic to Aerospike pods.
        </p>
        {form.networkPolicyConfig?.enabled && (
          <div className="grid gap-2">
            <Label htmlFor="netpol-type" className="text-xs">
              NetworkPolicy Type
            </Label>
            <Select
              value={form.networkPolicyConfig.type}
              onValueChange={(v) =>
                updateForm({
                  networkPolicyConfig: {
                    enabled: true,
                    type: v as "kubernetes" | "cilium",
                  },
                })
              }
            >
              <SelectTrigger id="netpol-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kubernetes">Kubernetes (standard)</SelectItem>
                <SelectItem value="cilium">Cilium</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Seeds Finder Services */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="seeds-finder"
            checked={form.seedsFinderServices?.loadBalancer != null}
            onCheckedChange={(checked) => {
              if (checked === true) {
                updateForm({
                  seedsFinderServices: {
                    loadBalancer: { port: 3000, targetPort: 3000 },
                  },
                });
              } else {
                updateForm({ seedsFinderServices: undefined });
              }
            }}
          />
          <Label htmlFor="seeds-finder" className="text-sm font-normal">
            Enable Seeds Finder LoadBalancer
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          Creates a LoadBalancer service for external seed discovery. Required for multi-cluster
          topologies or external client access.
        </p>
        {form.seedsFinderServices?.loadBalancer && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="sfs-port" className="text-xs">
                  Service Port
                </Label>
                <Input
                  id="sfs-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={form.seedsFinderServices.loadBalancer.port}
                  onChange={(e) => updateLoadBalancer({ port: parseInt(e.target.value) || 3000 })}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="sfs-target-port" className="text-xs">
                  Target Port
                </Label>
                <Input
                  id="sfs-target-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={form.seedsFinderServices.loadBalancer.targetPort}
                  onChange={(e) =>
                    updateLoadBalancer({ targetPort: parseInt(e.target.value) || 3000 })
                  }
                />
              </div>
              <div className="col-span-2 grid gap-1">
                <Label htmlFor="sfs-traffic-policy" className="text-xs">
                  External Traffic Policy
                </Label>
                <Select
                  value={form.seedsFinderServices.loadBalancer.externalTrafficPolicy ?? "Cluster"}
                  onValueChange={(v) =>
                    updateLoadBalancer({ externalTrafficPolicy: v as "Cluster" | "Local" })
                  }
                >
                  <SelectTrigger id="sfs-traffic-policy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cluster">Cluster (default)</SelectItem>
                    <SelectItem value="Local">Local</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Advanced LoadBalancer Settings (collapsible) */}
            <div className="rounded border">
              <button
                type="button"
                onClick={() => setShowLBAdvanced(!showLBAdvanced)}
                className="flex w-full items-center justify-between px-3 py-2 text-left"
              >
                <span className="text-xs font-medium">Advanced LoadBalancer Settings</span>
                {showLBAdvanced ? (
                  <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
                )}
              </button>
              {showLBAdvanced && (
                <div className="space-y-4 border-t px-3 pt-3 pb-3">
                  {/* Annotations */}
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Annotations</Label>
                    <p className="text-muted-foreground text-[10px]">
                      Cloud-specific LoadBalancer annotations (e.g.
                      service.beta.kubernetes.io/aws-load-balancer-type).
                    </p>
                    <KeyValueEditor
                      value={form.seedsFinderServices.loadBalancer.annotations}
                      onChange={(v) => updateLoadBalancer({ annotations: v })}
                      keyPlaceholder="e.g. service.beta.kubernetes.io/aws-load-balancer-type"
                      valuePlaceholder="e.g. nlb"
                      addLabel="Add"
                    />
                  </div>

                  {/* Labels */}
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Labels</Label>
                    <p className="text-muted-foreground text-[10px]">
                      Custom labels applied to the LoadBalancer Service resource.
                    </p>
                    <KeyValueEditor
                      value={form.seedsFinderServices.loadBalancer.labels}
                      onChange={(v) => updateLoadBalancer({ labels: v })}
                      keyPlaceholder="e.g. app.kubernetes.io/component"
                      valuePlaceholder="e.g. seeds-finder"
                      addLabel="Add"
                    />
                  </div>

                  {/* Load Balancer Source Ranges */}
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Load Balancer Source Ranges</Label>
                    <p className="text-muted-foreground text-[10px]">
                      Restrict access to the LoadBalancer by specifying allowed CIDR ranges. Leave
                      empty to allow all sources.
                    </p>
                    <MultiValueInput
                      value={form.seedsFinderServices.loadBalancer.loadBalancerSourceRanges}
                      onChange={(v) => updateLoadBalancer({ loadBalancerSourceRanges: v })}
                      placeholder="e.g. 10.0.0.0/8"
                      addLabel="Add"
                      validate={isValidCIDR}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
