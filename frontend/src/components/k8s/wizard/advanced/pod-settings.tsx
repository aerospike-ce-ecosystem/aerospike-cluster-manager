import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import type { PodSchedulingConfig, TolerationConfig } from "@/lib/api/types";
import type { WizardAdvancedStepProps } from "../types";

interface WizardPodSettingsStepProps {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
}

export function WizardPodSettingsStep({ form, updateForm }: WizardPodSettingsStepProps) {
  const scheduling = form.podScheduling;

  const updateScheduling = (updates: Partial<PodSchedulingConfig>) => {
    updateForm({
      podScheduling: { ...scheduling, ...updates },
    });
  };

  // Local state for node selector key-value input
  const [nsSelectorKey, setNsSelectorKey] = useState("");
  const [nsSelectorValue, setNsSelectorValue] = useState("");

  // Local state for image pull secret input
  const [newSecret, setNewSecret] = useState("");

  const addNodeSelector = () => {
    const k = nsSelectorKey.trim();
    const v = nsSelectorValue.trim();
    if (!k || !v) return;
    const current = scheduling?.nodeSelector ?? {};
    updateScheduling({ nodeSelector: { ...current, [k]: v } });
    setNsSelectorKey("");
    setNsSelectorValue("");
  };

  const removeNodeSelector = (key: string) => {
    const current = { ...(scheduling?.nodeSelector ?? {}) };
    delete current[key];
    updateScheduling({
      nodeSelector: Object.keys(current).length > 0 ? current : undefined,
    });
  };

  const addToleration = () => {
    const current = scheduling?.tolerations ?? [];
    updateScheduling({
      tolerations: [...current, { key: "", operator: "Equal", value: "", effect: "NoSchedule" }],
    });
  };

  const updateToleration = (index: number, updates: Partial<TolerationConfig>) => {
    const current = [...(scheduling?.tolerations ?? [])];
    current[index] = { ...current[index], ...updates };
    updateScheduling({ tolerations: current });
  };

  const removeToleration = (index: number) => {
    const current = (scheduling?.tolerations ?? []).filter((_, i) => i !== index);
    updateScheduling({ tolerations: current.length > 0 ? current : undefined });
  };

  const addImagePullSecret = () => {
    const name = newSecret.trim();
    if (!name) return;
    const current = scheduling?.imagePullSecrets ?? [];
    if (current.includes(name)) return;
    updateScheduling({ imagePullSecrets: [...current, name] });
    setNewSecret("");
  };

  const removeImagePullSecret = (name: string) => {
    const current = (scheduling?.imagePullSecrets ?? []).filter((s) => s !== name);
    updateScheduling({ imagePullSecrets: current.length > 0 ? current : undefined });
  };

  return (
    <div className="space-y-4">
      <p className="text-base-content/60 text-sm">
        Configure pod-level settings: metadata, scheduling, network, and lifecycle.
      </p>

      {/* Pod Metadata */}
      <div className="grid gap-3">
        <Label className="text-sm font-semibold">Pod Metadata</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Extra Labels (key=value, ...)</Label>
            <Input
              value={
                scheduling?.metadata?.labels
                  ? Object.entries(scheduling.metadata.labels)
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
                  const [k, v] = entry.split("=").map((s) => s.trim());
                  if (k && v) labels[k] = v;
                }
                updateScheduling({
                  metadata: {
                    ...scheduling?.metadata,
                    labels: Object.keys(labels).length > 0 ? labels : undefined,
                  },
                });
              }}
              placeholder="e.g. app=aerospike, team=data"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Extra Annotations (key=value, ...)</Label>
            <Input
              value={
                scheduling?.metadata?.annotations
                  ? Object.entries(scheduling.metadata.annotations)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ")
                  : ""
              }
              onChange={(e) => {
                const entries = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const annotations: Record<string, string> = {};
                for (const entry of entries) {
                  const eqIdx = entry.indexOf("=");
                  if (eqIdx > 0) {
                    annotations[entry.slice(0, eqIdx).trim()] = entry.slice(eqIdx + 1).trim();
                  }
                }
                updateScheduling({
                  metadata: {
                    ...scheduling?.metadata,
                    annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
                  },
                });
              }}
              placeholder="e.g. prometheus.io/scrape=true"
            />
          </div>
        </div>
      </div>

      {/* Readiness Gate */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="readiness-gate"
          checked={scheduling?.readinessGateEnabled ?? false}
          onCheckedChange={(checked) => {
            updateScheduling({ readinessGateEnabled: checked === true ? true : undefined });
          }}
        />
        <Label htmlFor="readiness-gate" className="cursor-pointer">
          Enable Readiness Gate (acko.io/aerospike-ready)
        </Label>
      </div>
      <p className="text-base-content/60 -mt-2 ml-6 text-[10px]">
        Pods are excluded from Service endpoints until Aerospike joins cluster mesh and finishes
        migrations.
      </p>

      {/* Pod Management Policy & DNS Policy */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label className="text-xs">Pod Management Policy</Label>
          <Select
            value={scheduling?.podManagementPolicy || "default"}
            onChange={(e) => {
              const v = e.target.value;
              updateScheduling({
                podManagementPolicy:
                  v === "default" ? undefined : (v as "OrderedReady" | "Parallel"),
              });
            }}
          >
            <option value="default">Default (OrderedReady)</option>
            <option value="OrderedReady">OrderedReady</option>
            <option value="Parallel">Parallel</option>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">DNS Policy</Label>
          <Select
            value={scheduling?.dnsPolicy || "default"}
            onChange={(e) => {
              const v = e.target.value;
              updateScheduling({ dnsPolicy: v === "default" ? undefined : v });
            }}
          >
            <option value="default">Default (ClusterFirst)</option>
            <option value="ClusterFirst">ClusterFirst</option>
            <option value="ClusterFirstWithHostNet">ClusterFirstWithHostNet</option>
            <option value="Default">Default</option>
            <option value="None">None</option>
          </Select>
        </div>
      </div>

      {/* Node Selector */}
      <div className="grid gap-2">
        <Label className="text-sm font-semibold">Node Selector</Label>
        <p className="text-base-content/60 text-[10px]">
          Constrain pods to nodes with matching labels.
        </p>
        {Object.entries(scheduling?.nodeSelector ?? {}).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(scheduling!.nodeSelector!).map(([k, v]) => (
              <span
                key={k}
                className="bg-accent/10 text-accent inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              >
                {k}={v}
                <button
                  type="button"
                  onClick={() => removeNodeSelector(k)}
                  className="hover:bg-accent/20 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                  title={`Remove ${k}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={nsSelectorKey}
            onChange={(e) => setNsSelectorKey(e.target.value)}
            placeholder="Key"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addNodeSelector();
              }
            }}
          />
          <Input
            value={nsSelectorValue}
            onChange={(e) => setNsSelectorValue(e.target.value)}
            placeholder="Value"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addNodeSelector();
              }
            }}
          />
          <button
            type="button"
            onClick={addNodeSelector}
            disabled={!nsSelectorKey.trim() || !nsSelectorValue.trim()}
            className="bg-accent text-accent-foreground hover:bg-accent/80 rounded px-3 text-xs font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Tolerations */}
      <div className="grid gap-2">
        <Label className="text-sm font-semibold">Tolerations</Label>
        <p className="text-base-content/60 text-[10px]">
          Allow pods to be scheduled on nodes with matching taints.
        </p>
        {(scheduling?.tolerations ?? []).map((tol, idx) => (
          <div
            key={idx}
            className="grid grid-cols-[1fr_auto_1fr_auto_auto] items-end gap-2 rounded border p-2"
          >
            <div className="grid gap-1">
              <Label className="text-[10px]">Key</Label>
              <Input
                value={tol.key ?? ""}
                onChange={(e) => updateToleration(idx, { key: e.target.value || undefined })}
                placeholder="e.g. dedicated"
                className="h-8 text-xs"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px]">Operator</Label>
              <Select
                value={tol.operator ?? "Equal"}
                onChange={(e) =>
                  updateToleration(idx, { operator: e.target.value as "Equal" | "Exists" })
                }
                className="h-8 w-24 text-xs"
              >
                <option value="Equal">Equal</option>
                <option value="Exists">Exists</option>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px]">Value</Label>
              <Input
                value={tol.value ?? ""}
                onChange={(e) => updateToleration(idx, { value: e.target.value || undefined })}
                placeholder={tol.operator === "Exists" ? "(ignored)" : "e.g. aerospike"}
                disabled={tol.operator === "Exists"}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px]">Effect</Label>
              <Select
                value={tol.effect ?? ""}
                onChange={(e) =>
                  updateToleration(idx, {
                    effect: e.target.value as TolerationConfig["effect"],
                  })
                }
                className="h-8 w-36 text-xs"
              >
                <option value="NoSchedule">NoSchedule</option>
                <option value="PreferNoSchedule">PreferNoSchedule</option>
                <option value="NoExecute">NoExecute</option>
              </Select>
            </div>
            <button
              type="button"
              onClick={() => removeToleration(idx)}
              className="text-base-content/60 hover:text-error mb-1 self-end p-1"
              title="Remove toleration"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addToleration}
          className="text-accent hover:text-accent/80 flex items-center gap-1 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Add Toleration
        </button>
      </div>

      {/* Toggle switches: Multi Pod Per Host, Host Network */}
      <div className="grid gap-3">
        <Label className="text-sm font-semibold">Pod Placement</Label>
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="multi-pod-per-host" className="cursor-pointer text-xs">
              Multi Pod Per Host
            </Label>
            <p className="text-base-content/60 text-[10px]">
              Allow multiple Aerospike pods on the same Kubernetes node.
            </p>
          </div>
          <Switch
            id="multi-pod-per-host"
            checked={scheduling?.multiPodPerHost ?? false}
            onCheckedChange={(checked) =>
              updateScheduling({ multiPodPerHost: checked || undefined })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="host-network" className="cursor-pointer text-xs">
              Host Network
            </Label>
            <p className="text-base-content/60 text-[10px]">
              Use the host&apos;s network namespace instead of pod networking.
            </p>
          </div>
          <Switch
            id="host-network"
            checked={scheduling?.hostNetwork ?? false}
            onCheckedChange={(checked) => updateScheduling({ hostNetwork: checked || undefined })}
          />
        </div>
      </div>

      {/* Service Account Name */}
      <div className="grid gap-1.5">
        <Label htmlFor="service-account-name" className="text-sm font-semibold">
          Service Account Name
        </Label>
        <Input
          id="service-account-name"
          value={scheduling?.serviceAccountName ?? ""}
          onChange={(e) => updateScheduling({ serviceAccountName: e.target.value || undefined })}
          placeholder="e.g. aerospike-sa"
        />
        <p className="text-base-content/60 text-[10px]">
          Kubernetes service account to use for Aerospike pods.
        </p>
      </div>

      {/* Termination Grace Period */}
      <div className="grid gap-1.5">
        <Label htmlFor="termination-grace-period" className="text-sm font-semibold">
          Termination Grace Period (seconds)
        </Label>
        <Input
          id="termination-grace-period"
          type="number"
          min={0}
          value={scheduling?.terminationGracePeriodSeconds ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            updateScheduling({
              terminationGracePeriodSeconds: val ? parseInt(val, 10) : undefined,
            });
          }}
          placeholder="e.g. 600"
          className="w-40"
        />
        <p className="text-base-content/60 text-[10px]">
          Time in seconds before a pod is forcefully terminated. Leave empty for Kubernetes default
          (30s).
        </p>
      </div>

      {/* Image Pull Secrets */}
      <div className="grid gap-2">
        <Label className="text-sm font-semibold">Image Pull Secrets</Label>
        <p className="text-base-content/60 text-[10px]">
          Kubernetes secrets for pulling container images from private registries.
        </p>
        {(scheduling?.imagePullSecrets ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {scheduling!.imagePullSecrets!.map((secret) => (
              <span
                key={secret}
                className="bg-accent/10 text-accent inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              >
                {secret}
                <button
                  type="button"
                  onClick={() => removeImagePullSecret(secret)}
                  className="hover:bg-accent/20 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                  title={`Remove ${secret}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newSecret}
            onChange={(e) => setNewSecret(e.target.value)}
            placeholder="e.g. my-registry-secret"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addImagePullSecret();
              }
            }}
          />
          <button
            type="button"
            onClick={addImagePullSecret}
            disabled={!newSecret.trim()}
            className="bg-accent text-accent-foreground hover:bg-accent/80 rounded px-3 text-xs font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Topology Spread Constraints */}
      <div className="grid gap-2">
        <Label className="text-sm font-semibold">Topology Spread Constraints</Label>
        <p className="text-base-content/60 text-[10px]">
          Control how pods are spread across topology domains (zones, nodes, etc.).
        </p>
        {(scheduling?.topologySpreadConstraints ?? []).map((tsc, idx) => (
          <div key={idx} className="space-y-2 rounded border p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Constraint #{idx + 1}</span>
              <button
                type="button"
                onClick={() => {
                  const current = (scheduling?.topologySpreadConstraints ?? []).filter(
                    (_, i) => i !== idx,
                  );
                  updateScheduling({
                    topologySpreadConstraints: current.length > 0 ? current : undefined,
                  });
                }}
                className="text-base-content/60 hover:text-error p-1"
                title="Remove constraint"
              >
                <X className="h-4 w-4" />
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
                    const current = [...(scheduling?.topologySpreadConstraints ?? [])];
                    current[idx] = { ...current[idx], maxSkew: parseInt(e.target.value) || 1 };
                    updateScheduling({ topologySpreadConstraints: current });
                  }}
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px]">Topology Key</Label>
                <Select
                  value={tsc.topologyKey}
                  onChange={(e) => {
                    const current = [...(scheduling?.topologySpreadConstraints ?? [])];
                    current[idx] = { ...current[idx], topologyKey: e.target.value };
                    updateScheduling({ topologySpreadConstraints: current });
                  }}
                  className="h-8 text-xs"
                >
                  <option value="topology.kubernetes.io/zone">topology.kubernetes.io/zone</option>
                  <option value="kubernetes.io/hostname">kubernetes.io/hostname</option>
                  <option value="topology.kubernetes.io/region">
                    topology.kubernetes.io/region
                  </option>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px]">When Unsatisfiable</Label>
                <Select
                  value={tsc.whenUnsatisfiable}
                  onChange={(e) => {
                    const current = [...(scheduling?.topologySpreadConstraints ?? [])];
                    current[idx] = {
                      ...current[idx],
                      whenUnsatisfiable: e.target.value as "DoNotSchedule" | "ScheduleAnyway",
                    };
                    updateScheduling({ topologySpreadConstraints: current });
                  }}
                  className="h-8 text-xs"
                >
                  <option value="DoNotSchedule">DoNotSchedule</option>
                  <option value="ScheduleAnyway">ScheduleAnyway</option>
                </Select>
              </div>
            </div>
            <div className="grid gap-1">
              <Label className="text-[10px]">
                Label Selector (optional, key=value comma-separated)
              </Label>
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
                    const [k, v] = entry.split("=").map((s) => s.trim());
                    if (k && v) labels[k] = v;
                  }
                  const current = [...(scheduling?.topologySpreadConstraints ?? [])];
                  current[idx] = {
                    ...current[idx],
                    labelSelector: Object.keys(labels).length > 0 ? labels : undefined,
                  };
                  updateScheduling({ topologySpreadConstraints: current });
                }}
                placeholder="e.g. app=aerospike, env=prod"
                className="h-8 text-xs"
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            const current = scheduling?.topologySpreadConstraints ?? [];
            updateScheduling({
              topologySpreadConstraints: [
                ...current,
                {
                  maxSkew: 1,
                  topologyKey: "topology.kubernetes.io/zone",
                  whenUnsatisfiable: "DoNotSchedule",
                },
              ],
            });
          }}
          className="text-accent hover:text-accent/80 flex items-center gap-1 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Add Topology Spread Constraint
        </button>
      </div>
    </div>
  );
}
