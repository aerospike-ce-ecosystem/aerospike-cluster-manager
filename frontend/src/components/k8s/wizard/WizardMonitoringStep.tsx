import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { KeyValueEditor } from "@/components/common/key-value-editor";
import { MultiValueInput } from "@/components/common/multi-value-input";
import { isValidCIDR } from "@/lib/validations/network";
import { ExporterResourcesEditor } from "./exporter-resources-editor";
import { CustomRulesEditor } from "./custom-rules-editor";
import type { NetworkAccessType, LoadBalancerSpec, MonitoringConfig } from "@/lib/api/types";
import type { WizardMonitoringStepProps } from "./types";

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
              <p className="text-base-content/60 text-xs">
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
              <p className="text-base-content/60 text-xs">
                Custom exporter sidecar image. Leave blank for the operator default.
              </p>
            </div>
          </div>

          {/* ── Metric Labels ── */}
          <div className="space-y-2 rounded-lg border p-4">
            <span className="text-sm font-medium">Metric Labels</span>
            <p className="text-base-content/60 text-xs">
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
                    <p className="text-base-content/60 text-xs">
                      How often Prometheus scrapes metrics (e.g. &quot;30s&quot;, &quot;1m&quot;).
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">ServiceMonitor Labels</Label>
                    <p className="text-base-content/60 text-xs">
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
                <>
                  <div className="space-y-2">
                    <Label className="text-xs">PrometheusRule Labels</Label>
                    <p className="text-base-content/60 text-xs">
                      Labels for PrometheusRule discovery (must match your Prometheus rule
                      selector).
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

                  {/* Custom Rules Editor */}
                  <CustomRulesEditor
                    value={monitoring.prometheusRule.customRules}
                    onChange={(customRules) =>
                      patchMonitoring({
                        prometheusRule: { ...monitoring.prometheusRule!, customRules },
                      })
                    }
                  />
                </>
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
        <p className="text-base-content/60 text-xs">
          Configure how clients and nodes communicate with the Aerospike cluster.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="access-type" className="text-xs">
              Client Access Type
            </Label>
            <Select
              value={form.networkPolicy?.accessType || "pod"}
              onChange={(e) => {
                const v = e.target.value;
                const current = form.networkPolicy ?? { accessType: "pod" as const };
                updateForm({
                  networkPolicy:
                    v === "pod" && !current.alternateAccessType && !current.fabricType
                      ? undefined
                      : { ...current, accessType: v as NetworkAccessType },
                });
              }}
              id="access-type"
            >
              <option value="pod">Pod IP (default)</option>
              <option value="hostInternal">Host Internal IP</option>
              <option value="hostExternal">Host External IP</option>
              <option value="configuredIP">Configured IP</option>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fabric-type" className="text-xs">
              Fabric Type (inter-node)
            </Label>
            <Select
              value={form.networkPolicy?.fabricType || "pod"}
              onChange={(e) => {
                const v = e.target.value;
                const current = form.networkPolicy ?? { accessType: "pod" as const };
                updateForm({
                  networkPolicy: {
                    ...current,
                    fabricType: v === "pod" ? undefined : (v as NetworkAccessType),
                  },
                });
              }}
              id="fabric-type"
            >
              <option value="pod">Pod IP (default)</option>
              <option value="hostInternal">Host Internal IP</option>
              <option value="hostExternal">Host External IP</option>
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
        <p className="text-base-content/60 text-xs">
          Automatically create K8s NetworkPolicy resources to restrict traffic to Aerospike pods.
        </p>
        {form.networkPolicyConfig?.enabled && (
          <div className="grid gap-2">
            <Label htmlFor="netpol-type" className="text-xs">
              NetworkPolicy Type
            </Label>
            <Select
              value={form.networkPolicyConfig.type}
              onChange={(e) =>
                updateForm({
                  networkPolicyConfig: {
                    enabled: true,
                    type: e.target.value as "kubernetes" | "cilium",
                  },
                })
              }
              id="netpol-type"
            >
              <option value="kubernetes">Kubernetes (standard)</option>
              <option value="cilium">Cilium</option>
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
        <p className="text-base-content/60 text-xs">
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
                  onChange={(e) =>
                    updateLoadBalancer({
                      externalTrafficPolicy: e.target.value as "Cluster" | "Local",
                    })
                  }
                  id="sfs-traffic-policy"
                >
                  <option value="Cluster">Cluster (default)</option>
                  <option value="Local">Local</option>
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
                  <ChevronDown className="text-base-content/60 h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="text-base-content/60 h-3.5 w-3.5" />
                )}
              </button>
              {showLBAdvanced && (
                <div className="space-y-4 border-t px-3 pt-3 pb-3">
                  {/* Annotations */}
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Annotations</Label>
                    <p className="text-base-content/60 text-[10px]">
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
                    <p className="text-base-content/60 text-[10px]">
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
                    <p className="text-base-content/60 text-[10px]">
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
