"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { KeyValueEditor } from "@/components/common/key-value-editor";
import type { MonitoringConfig } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Helpers: convert between [{name,value}] and flat Record for KeyValueEditor
// ---------------------------------------------------------------------------

/** Convert [{name: "FOO", value: "bar"}] to {FOO: "bar"} for KeyValueEditor. */
function envArrayToRecord(
  arr: Record<string, string>[] | undefined,
): Record<string, string> | undefined {
  if (!arr || arr.length === 0) return undefined;
  const rec: Record<string, string> = {};
  for (const entry of arr) {
    if (entry.name) rec[entry.name] = entry.value ?? "";
  }
  return Object.keys(rec).length > 0 ? rec : undefined;
}

/** Convert {FOO: "bar"} to [{name: "FOO", value: "bar"}] for backend format. */
function recordToEnvArray(
  rec: Record<string, string> | undefined,
): Record<string, string>[] | undefined {
  if (!rec || Object.keys(rec).length === 0) return undefined;
  return Object.entries(rec).map(([name, value]) => ({ name, value }));
}

// ---------------------------------------------------------------------------
// Monitoring Section for Edit Dialog
// ---------------------------------------------------------------------------

/** Custom Prometheus rule groups JSON editor for edit dialog. */
function EditCustomRulesEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>[] | undefined;
  onChange: (v: Record<string, unknown>[] | undefined) => void;
  disabled?: boolean;
}) {
  const [rawText, setRawText] = useState(() => (value ? JSON.stringify(value, null, 2) : ""));
  const [parseError, setParseError] = useState<string | null>(null);

  const handleChange = (text: string) => {
    setRawText(text);
    if (!text.trim()) {
      setParseError(null);
      onChange(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        setParseError("Must be a JSON array of rule groups");
        return;
      }
      setParseError(null);
      onChange(parsed);
    } catch {
      setParseError("Invalid JSON");
    }
  };

  return (
    <div className="space-y-1">
      <Textarea
        value={rawText}
        onChange={(e) => handleChange(e.target.value)}
        rows={6}
        className="font-mono text-xs"
        disabled={disabled}
        placeholder={`[\n  {\n    "name": "aerospike-alerts",\n    "rules": [...]\n  }\n]`}
      />
      {parseError && <p className="text-error text-xs">{parseError}</p>}
    </div>
  );
}

export function EditMonitoringSection({
  config,
  onChange,
  disabled,
}: {
  config: MonitoringConfig | null;
  onChange: (cfg: MonitoringConfig | null) => void;
  disabled?: boolean;
}) {
  const enabled = config?.enabled ?? false;

  const patch = (updates: Partial<MonitoringConfig>) => {
    onChange({ ...config!, ...updates });
  };

  return (
    <div className="grid gap-3">
      <Label className="text-sm font-semibold">Monitoring</Label>
      <div className="flex items-center gap-2">
        <Checkbox
          id="edit-monitoring-enabled"
          checked={enabled}
          onCheckedChange={(checked) => {
            if (checked === true) {
              onChange({ enabled: true, port: config?.port ?? 9145 });
            } else {
              onChange(null);
            }
          }}
          disabled={disabled}
        />
        <Label htmlFor="edit-monitoring-enabled" className="cursor-pointer text-xs">
          Enable Prometheus monitoring
        </Label>
      </div>

      {enabled && config && (
        <div className="space-y-3">
          {/* Port & Image */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="edit-monitoring-port" className="text-xs">
                Exporter Port
              </Label>
              <Input
                id="edit-monitoring-port"
                type="number"
                min={1024}
                max={65535}
                value={config.port}
                onChange={(e) =>
                  patch({
                    port: Math.min(65535, Math.max(1024, parseInt(e.target.value) || 9145)),
                  })
                }
                disabled={disabled}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="edit-exporter-image" className="text-xs">
                Exporter Image
              </Label>
              <Input
                id="edit-exporter-image"
                value={config.exporterImage ?? ""}
                onChange={(e) => patch({ exporterImage: e.target.value || undefined })}
                placeholder="aerospike/aerospike-prometheus-exporter:latest"
                disabled={disabled}
              />
            </div>
          </div>

          {/* Metric Labels */}
          <div className="grid gap-1.5">
            <Label className="text-xs">Metric Labels</Label>
            <KeyValueEditor
              value={config.metricLabels}
              onChange={(labels) => patch({ metricLabels: labels })}
              keyPlaceholder="label name"
              valuePlaceholder="label value"
              disabled={disabled}
              size="sm"
            />
          </div>

          {/* Exporter Environment Variables */}
          <div className="grid gap-1.5">
            <Label className="text-xs">Exporter Environment Variables</Label>
            <p className="text-muted-foreground text-[10px]">
              Environment variables passed to the Prometheus exporter container.
            </p>
            <KeyValueEditor
              value={envArrayToRecord(config.exporterEnv)}
              onChange={(rec) => patch({ exporterEnv: recordToEnvArray(rec) })}
              keyPlaceholder="VARIABLE_NAME"
              valuePlaceholder="value"
              disabled={disabled}
              size="sm"
            />
          </div>

          {/* Exporter Resources */}
          <CollapsibleSection
            title="Exporter Resources"
            summary={
              config.resources
                ? `${config.resources.requests.cpu} / ${config.resources.requests.memory}`
                : "Defaults"
            }
            size="sm"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-exporter-resources-enabled"
                  checked={config.resources != null}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      patch({
                        resources: {
                          requests: { cpu: "100m", memory: "128Mi" },
                          limits: { cpu: "200m", memory: "256Mi" },
                        },
                      });
                    } else {
                      patch({ resources: undefined });
                    }
                  }}
                  disabled={disabled}
                />
                <Label htmlFor="edit-exporter-resources-enabled" className="cursor-pointer text-xs">
                  Set resource requests/limits
                </Label>
              </div>
              {config.resources && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-[10px]">CPU Request</Label>
                      <Input
                        className="h-7 text-xs"
                        value={config.resources.requests.cpu}
                        onChange={(e) =>
                          patch({
                            resources: {
                              ...config.resources!,
                              requests: { ...config.resources!.requests, cpu: e.target.value },
                            },
                          })
                        }
                        placeholder="100m"
                        disabled={disabled}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Memory Request</Label>
                      <Input
                        className="h-7 text-xs"
                        value={config.resources.requests.memory}
                        onChange={(e) =>
                          patch({
                            resources: {
                              ...config.resources!,
                              requests: { ...config.resources!.requests, memory: e.target.value },
                            },
                          })
                        }
                        placeholder="128Mi"
                        disabled={disabled}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-[10px]">CPU Limit</Label>
                      <Input
                        className="h-7 text-xs"
                        value={config.resources.limits.cpu}
                        onChange={(e) =>
                          patch({
                            resources: {
                              ...config.resources!,
                              limits: { ...config.resources!.limits, cpu: e.target.value },
                            },
                          })
                        }
                        placeholder="200m"
                        disabled={disabled}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Memory Limit</Label>
                      <Input
                        className="h-7 text-xs"
                        value={config.resources.limits.memory}
                        onChange={(e) =>
                          patch({
                            resources: {
                              ...config.resources!,
                              limits: { ...config.resources!.limits, memory: e.target.value },
                            },
                          })
                        }
                        placeholder="256Mi"
                        disabled={disabled}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* ServiceMonitor */}
          <CollapsibleSection
            title="ServiceMonitor"
            summary={config.serviceMonitor?.enabled ? "Enabled" : "Disabled"}
            size="sm"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-sm-enabled"
                  checked={config.serviceMonitor?.enabled ?? false}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      patch({
                        serviceMonitor: {
                          enabled: true,
                          ...(config.serviceMonitor ?? {}),
                        },
                      });
                    } else {
                      patch({ serviceMonitor: undefined });
                    }
                  }}
                  disabled={disabled}
                />
                <Label htmlFor="edit-sm-enabled" className="cursor-pointer text-xs">
                  Enable ServiceMonitor
                </Label>
              </div>
              {config.serviceMonitor?.enabled && (
                <>
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Scrape Interval</Label>
                    <Input
                      className="h-7 max-w-[150px] text-xs"
                      value={config.serviceMonitor.interval ?? ""}
                      onChange={(e) =>
                        patch({
                          serviceMonitor: {
                            ...config.serviceMonitor!,
                            interval: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder="30s"
                      disabled={disabled}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Labels</Label>
                    <KeyValueEditor
                      value={config.serviceMonitor.labels}
                      onChange={(labels) =>
                        patch({
                          serviceMonitor: { ...config.serviceMonitor!, labels },
                        })
                      }
                      disabled={disabled}
                      size="sm"
                    />
                  </div>
                </>
              )}
            </div>
          </CollapsibleSection>

          {/* PrometheusRule */}
          <CollapsibleSection
            title="PrometheusRule"
            summary={config.prometheusRule?.enabled ? "Enabled" : "Disabled"}
            size="sm"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-prom-rule-enabled"
                  checked={config.prometheusRule?.enabled ?? false}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      patch({
                        prometheusRule: {
                          enabled: true,
                          ...(config.prometheusRule ?? {}),
                        },
                      });
                    } else {
                      patch({ prometheusRule: undefined });
                    }
                  }}
                  disabled={disabled}
                />
                <Label htmlFor="edit-prom-rule-enabled" className="cursor-pointer text-xs">
                  Enable PrometheusRule
                </Label>
              </div>
              {config.prometheusRule?.enabled && (
                <>
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Labels</Label>
                    <KeyValueEditor
                      value={config.prometheusRule.labels}
                      onChange={(labels) =>
                        patch({
                          prometheusRule: { ...config.prometheusRule!, labels },
                        })
                      }
                      disabled={disabled}
                      size="sm"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Custom Rule Groups (JSON)</Label>
                    <p className="text-muted-foreground text-[10px]">
                      Define custom Prometheus alerting/recording rule groups as a JSON array.
                    </p>
                    <EditCustomRulesEditor
                      value={config.prometheusRule.customRules}
                      onChange={(customRules) =>
                        patch({
                          prometheusRule: { ...config.prometheusRule!, customRules },
                        })
                      }
                      disabled={disabled}
                    />
                  </div>
                </>
              )}
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}
