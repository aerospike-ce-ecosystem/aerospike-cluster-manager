import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { WizardMonitoringStep } from "./WizardMonitoringStep";
import { WizardAclStep } from "./WizardAclStep";
import { WizardRollingUpdateStep } from "./WizardRollingUpdateStep";
import { WizardRackConfigStep } from "./WizardRackConfigStep";
import { WizardSidecarsStep } from "./WizardSidecarsStep";
import type { WizardAdvancedStepProps } from "./types";
import { Button } from "@/components/ui/button";
import type {
  PodSchedulingConfig,
  BandwidthConfig,
  ValidationPolicyConfig,
  TolerationConfig,
  K8sNodeInfo,
  ServiceMetadataConfig,
  PodSecurityContextConfig,
} from "@/lib/api/types";

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
          <span className="text-base-content/60 ml-2 text-xs">{summary}</span>
        </div>
        {open ? (
          <ChevronDown className="text-base-content/60 h-4 w-4" />
        ) : (
          <ChevronRight className="text-base-content/60 h-4 w-4" />
        )}
      </button>
      {open && <div className="space-y-4 border-t px-4 pt-4 pb-4">{children}</div>}
    </div>
  );
}

function WizardPodSettingsStep({
  form,
  updateForm,
}: {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
}) {
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

function WizardNodeBlockListStep({
  form,
  updateForm,
  nodes,
}: {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
  nodes: K8sNodeInfo[];
}) {
  const blockedNodes = form.k8sNodeBlockList ?? [];

  const toggleNode = (nodeName: string) => {
    const current = form.k8sNodeBlockList ?? [];
    if (current.includes(nodeName)) {
      const next = current.filter((n) => n !== nodeName);
      updateForm({ k8sNodeBlockList: next.length > 0 ? next : undefined });
    } else {
      updateForm({ k8sNodeBlockList: [...current, nodeName] });
    }
  };

  const removeNode = (nodeName: string) => {
    const next = blockedNodes.filter((n) => n !== nodeName);
    updateForm({ k8sNodeBlockList: next.length > 0 ? next : undefined });
  };

  const [manualNode, setManualNode] = useState("");

  const addManualNode = () => {
    const name = manualNode.trim();
    if (name && !blockedNodes.includes(name)) {
      updateForm({ k8sNodeBlockList: [...blockedNodes, name] });
    }
    setManualNode("");
  };

  return (
    <div className="space-y-4">
      <p className="text-base-content/60 text-sm">
        Select Kubernetes nodes to exclude from scheduling Aerospike pods.
      </p>

      {/* Selected blocked nodes as chips */}
      {blockedNodes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {blockedNodes.map((node) => (
            <span
              key={node}
              className="bg-error/10 text-error inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
            >
              {node}
              <button
                type="button"
                onClick={() => removeNode(node)}
                className="hover:bg-error/20 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                title={`Remove ${node}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Available nodes from cluster */}
      {nodes.length > 0 && (
        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold">Available Nodes</Label>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
            {nodes.map((node) => (
              <div key={node.name} className="flex items-center gap-2">
                <Checkbox
                  id={`block-node-${node.name}`}
                  checked={blockedNodes.includes(node.name)}
                  onCheckedChange={() => toggleNode(node.name)}
                />
                <Label
                  htmlFor={`block-node-${node.name}`}
                  className="flex cursor-pointer items-center gap-2 text-xs"
                >
                  <span className="font-mono">{node.name}</span>
                  {node.zone && <span className="text-base-content/60">({node.zone})</span>}
                  {!node.ready && <span className="text-error text-[10px]">Not Ready</span>}
                </Label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual entry */}
      <div className="grid gap-1.5">
        <Label className="text-xs">Add node manually</Label>
        <div className="flex gap-2">
          <Input
            value={manualNode}
            onChange={(e) => setManualNode(e.target.value)}
            placeholder="e.g. worker-node-3"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addManualNode();
              }
            }}
          />
          <button
            type="button"
            onClick={addManualNode}
            disabled={!manualNode.trim()}
            className="bg-accent text-accent-foreground hover:bg-accent/80 rounded px-3 text-xs font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <p className="text-base-content/60 text-[10px]">
          Enter a K8s node name to block, then press Enter or click Add.
        </p>
      </div>
    </div>
  );
}

function WizardValidationPolicyStep({
  form,
  updateForm,
}: {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
}) {
  const policy = form.validationPolicy;

  const updatePolicy = (updates: Partial<ValidationPolicyConfig>) => {
    const next = { ...policy, ...updates };
    // Clear if all values are falsy
    if (!next.skipWorkDirValidate) {
      updateForm({ validationPolicy: undefined });
    } else {
      updateForm({ validationPolicy: next });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-base-content/60 text-sm">
        Configure validation behavior for the Aerospike cluster.
      </p>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="skip-workdir-validate" className="cursor-pointer text-xs">
            Skip Work Dir Validate
          </Label>
          <p className="text-base-content/60 text-[10px]">
            Skip validation of the working directory on pod startup. Useful when using custom
            storage configurations.
          </p>
        </div>
        <Switch
          id="skip-workdir-validate"
          checked={policy?.skipWorkDirValidate ?? false}
          onCheckedChange={(checked) => updatePolicy({ skipWorkDirValidate: checked || undefined })}
        />
      </div>
    </div>
  );
}

function WizardBandwidthStep({
  form,
  updateForm,
}: {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
}) {
  const bw = form.bandwidthConfig;

  const updateBandwidth = (updates: Partial<BandwidthConfig>) => {
    const next = { ...bw, ...updates };
    // Clear if both are empty
    if (!next.ingress && !next.egress) {
      updateForm({ bandwidthConfig: undefined });
    } else {
      updateForm({ bandwidthConfig: next });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-base-content/60 text-sm">
        Configure CNI bandwidth limits for Aerospike pods. Values use standard Kubernetes bandwidth
        notation (e.g. &quot;1M&quot;, &quot;10M&quot;, &quot;100M&quot;).
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="bw-ingress" className="text-xs">
            Ingress Bandwidth
          </Label>
          <Input
            id="bw-ingress"
            value={bw?.ingress ?? ""}
            onChange={(e) => updateBandwidth({ ingress: e.target.value || undefined })}
            placeholder="e.g. 10M"
          />
          <p className="text-base-content/60 text-[10px]">Max incoming bandwidth per pod</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bw-egress" className="text-xs">
            Egress Bandwidth
          </Label>
          <Input
            id="bw-egress"
            value={bw?.egress ?? ""}
            onChange={(e) => updateBandwidth({ egress: e.target.value || undefined })}
            placeholder="e.g. 10M"
          />
          <p className="text-base-content/60 text-[10px]">Max outgoing bandwidth per pod</p>
        </div>
      </div>
    </div>
  );
}

/** Service Metadata editor for headless and pod services. */
function ServiceMetadataEditor({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: ServiceMetadataConfig | undefined;
  onChange: (v: ServiceMetadataConfig | undefined) => void;
}) {
  const [annotationKey, setAnnotationKey] = useState("");
  const [annotationVal, setAnnotationVal] = useState("");
  const [labelKey, setLabelKey] = useState("");
  const [labelVal, setLabelVal] = useState("");

  const addAnnotation = () => {
    const k = annotationKey.trim();
    const v = annotationVal.trim();
    if (!k) return;
    const next = { ...value, annotations: { ...(value?.annotations ?? {}), [k]: v } };
    onChange(next);
    setAnnotationKey("");
    setAnnotationVal("");
  };

  const removeAnnotation = (key: string) => {
    const annotations = { ...(value?.annotations ?? {}) };
    delete annotations[key];
    const next = {
      ...value,
      annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
    };
    if (!next.annotations && !next.labels) {
      onChange(undefined);
    } else {
      onChange(next);
    }
  };

  const addLabel = () => {
    const k = labelKey.trim();
    const v = labelVal.trim();
    if (!k) return;
    const next = { ...value, labels: { ...(value?.labels ?? {}), [k]: v } };
    onChange(next);
    setLabelKey("");
    setLabelVal("");
  };

  const removeLabel = (key: string) => {
    const labels = { ...(value?.labels ?? {}) };
    delete labels[key];
    const next = {
      ...value,
      labels: Object.keys(labels).length > 0 ? labels : undefined,
    };
    if (!next.annotations && !next.labels) {
      onChange(undefined);
    } else {
      onChange(next);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{description}</p>

      {/* Annotations */}
      <div className="grid gap-2">
        <Label className="text-xs font-semibold">Annotations</Label>
        {Object.entries(value?.annotations ?? {}).length > 0 && (
          <div className="space-y-1">
            {Object.entries(value!.annotations!).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <code className="bg-muted truncate rounded px-1.5 py-0.5 text-[10px]">{k}</code>
                <span className="text-muted-foreground text-[10px]">=</span>
                <code className="bg-muted flex-1 truncate rounded px-1.5 py-0.5 text-[10px]">
                  {v}
                </code>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => removeAnnotation(k)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            className="h-8 text-xs"
            placeholder="annotation key"
            value={annotationKey}
            onChange={(e) => setAnnotationKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAnnotation())}
          />
          <Input
            className="h-8 text-xs"
            placeholder="value"
            value={annotationVal}
            onChange={(e) => setAnnotationVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAnnotation())}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={addAnnotation}
            disabled={!annotationKey.trim()}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      {/* Labels */}
      <div className="grid gap-2">
        <Label className="text-xs font-semibold">Labels</Label>
        {Object.entries(value?.labels ?? {}).length > 0 && (
          <div className="space-y-1">
            {Object.entries(value!.labels!).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <code className="bg-muted truncate rounded px-1.5 py-0.5 text-[10px]">{k}</code>
                <span className="text-muted-foreground text-[10px]">=</span>
                <code className="bg-muted flex-1 truncate rounded px-1.5 py-0.5 text-[10px]">
                  {v}
                </code>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => removeLabel(k)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            className="h-8 text-xs"
            placeholder="label key"
            value={labelKey}
            onChange={(e) => setLabelKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLabel())}
          />
          <Input
            className="h-8 text-xs"
            placeholder="value"
            value={labelVal}
            onChange={(e) => setLabelVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLabel())}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={addLabel}
            disabled={!labelKey.trim()}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

function WizardPodSecurityContextStep({
  form,
  updateForm,
}: {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
}) {
  const scheduling = form.podScheduling;
  const ctx = scheduling?.podSecurityContext;

  const updateSecurityContext = (updates: Partial<PodSecurityContextConfig>) => {
    const next = { ...ctx, ...updates };
    const hasValue =
      next.runAsUser != null ||
      next.runAsGroup != null ||
      next.runAsNonRoot != null ||
      next.fsGroup != null ||
      (next.supplementalGroups && next.supplementalGroups.length > 0);
    updateForm({
      podScheduling: {
        ...scheduling,
        podSecurityContext: hasValue ? (next as PodSecurityContextConfig) : undefined,
      },
    });
  };

  const [newSupGroup, setNewSupGroup] = useState("");

  return (
    <div className="space-y-4">
      <p className="text-base-content/60 text-sm">
        Configure the pod-level security context for Aerospike pods.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="run-as-user" className="text-xs">
            Run As User
          </Label>
          <Input
            id="run-as-user"
            type="number"
            min={0}
            value={ctx?.runAsUser ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              updateSecurityContext({ runAsUser: val ? parseInt(val, 10) : undefined });
            }}
            placeholder="e.g. 1000"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="run-as-group" className="text-xs">
            Run As Group
          </Label>
          <Input
            id="run-as-group"
            type="number"
            min={0}
            value={ctx?.runAsGroup ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              updateSecurityContext({ runAsGroup: val ? parseInt(val, 10) : undefined });
            }}
            placeholder="e.g. 1000"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="fs-group" className="text-xs">
            FS Group
          </Label>
          <Input
            id="fs-group"
            type="number"
            min={0}
            value={ctx?.fsGroup ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              updateSecurityContext({ fsGroup: val ? parseInt(val, 10) : undefined });
            }}
            placeholder="e.g. 1000"
          />
          <p className="text-base-content/60 text-[10px]">
            GID applied to all volumes mounted in the pod.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start pt-6">
          <Switch
            id="run-as-non-root"
            checked={ctx?.runAsNonRoot ?? false}
            onCheckedChange={(checked) =>
              updateSecurityContext({ runAsNonRoot: checked || undefined })
            }
          />
          <Label htmlFor="run-as-non-root" className="cursor-pointer text-xs">
            Run As Non-Root
          </Label>
        </div>
      </div>

      {/* Supplemental Groups */}
      <div className="grid gap-2">
        <Label className="text-xs font-semibold">Supplemental Groups</Label>
        <p className="text-base-content/60 text-[10px]">
          Additional GIDs applied to the first process run in each container.
        </p>
        {(ctx?.supplementalGroups ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {ctx!.supplementalGroups!.map((gid) => (
              <span
                key={gid}
                className="bg-accent/10 text-accent inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              >
                {gid}
                <button
                  type="button"
                  onClick={() => {
                    const next = (ctx?.supplementalGroups ?? []).filter((g) => g !== gid);
                    updateSecurityContext({
                      supplementalGroups: next.length > 0 ? next : undefined,
                    });
                  }}
                  className="hover:bg-accent/20 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                  title={`Remove ${gid}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newSupGroup}
            onChange={(e) => setNewSupGroup(e.target.value)}
            type="number"
            min={0}
            placeholder="e.g. 1000"
            className="w-32"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const val = parseInt(newSupGroup, 10);
                if (!isNaN(val)) {
                  const current = ctx?.supplementalGroups ?? [];
                  if (!current.includes(val)) {
                    updateSecurityContext({ supplementalGroups: [...current, val] });
                  }
                  setNewSupGroup("");
                }
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              const val = parseInt(newSupGroup, 10);
              if (!isNaN(val)) {
                const current = ctx?.supplementalGroups ?? [];
                if (!current.includes(val)) {
                  updateSecurityContext({ supplementalGroups: [...current, val] });
                }
                setNewSupGroup("");
              }
            }}
            disabled={!newSupGroup.trim() || isNaN(parseInt(newSupGroup, 10))}
            className="bg-accent text-accent-foreground hover:bg-accent/80 rounded px-3 text-xs font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function WizardServiceMetadataStep({
  form,
  updateForm,
}: {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Label className="text-sm font-semibold">Pod Service</Label>
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="pod-service-enabled" className="cursor-pointer text-xs">
              Enable per-pod Service
            </Label>
            <p className="text-muted-foreground text-[10px]">
              Create a dedicated Kubernetes Service for each Aerospike pod, enabling direct pod
              addressing.
            </p>
          </div>
          <Switch
            id="pod-service-enabled"
            checked={form.podService != null}
            onCheckedChange={(checked) => {
              if (checked) {
                updateForm({ podService: {} });
              } else {
                updateForm({ podService: undefined });
              }
            }}
          />
        </div>
        {form.podService != null && (
          <ServiceMetadataEditor
            title="Pod Service Metadata"
            description="Annotations and labels applied to per-pod Service resources."
            value={form.podService}
            onChange={(v) => updateForm({ podService: v ?? {} })}
          />
        )}
      </div>

      <div className="border-t pt-4">
        <Label className="text-sm font-semibold">Headless Service</Label>
        <p className="text-muted-foreground mb-3 text-[10px]">
          Custom annotations and labels for the headless Service used for pod discovery.
        </p>
        <ServiceMetadataEditor
          title="Headless Service Metadata"
          description="Annotations and labels applied to the headless Service resource."
          value={form.headlessService}
          onChange={(v) => updateForm({ headlessService: v })}
        />
      </div>
    </div>
  );
}

function WizardRackIDOverrideStep({
  form,
  updateForm,
}: {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="rack-id-override" className="cursor-pointer text-xs">
            Enable Rack ID Override
          </Label>
          <p className="text-muted-foreground text-[10px]">
            Allow rack ID override for existing data migration. When enabled, the operator
            dynamically assigns rack IDs to pods, which is useful when migrating data from an
            existing cluster with different rack configurations.
          </p>
        </div>
        <Switch
          id="rack-id-override"
          checked={form.enableRackIDOverride ?? false}
          onCheckedChange={(checked) => {
            updateForm({ enableRackIDOverride: checked || undefined });
          }}
        />
      </div>
    </div>
  );
}

export function WizardAdvancedStep({
  form,
  updateForm,
  k8sSecrets,
  nodes,
}: WizardAdvancedStepProps) {
  const monitoringSummary = form.monitoring?.enabled
    ? `Enabled (port ${form.monitoring.port})`
    : "Disabled";

  const aclSummary = form.acl?.enabled
    ? `${form.acl.roles.length} roles, ${form.acl.users.length} users`
    : "Disabled";

  const rollingSummary =
    form.rollingUpdate?.batchSize != null || form.rollingUpdate?.maxUnavailable
      ? "Customized"
      : "Default";

  const rackSummary =
    (form.rackConfig?.racks ?? []).length > 0
      ? `${form.rackConfig!.racks.length} rack(s)`
      : "Single rack";

  const podSettingsSummary =
    [
      form.podScheduling?.readinessGateEnabled ? "Readiness Gate" : null,
      form.podScheduling?.podManagementPolicy ? form.podScheduling.podManagementPolicy : null,
      form.podScheduling?.metadata?.labels ? "Labels" : null,
      form.podScheduling?.nodeSelector
        ? `${Object.keys(form.podScheduling.nodeSelector).length} selector(s)`
        : null,
      form.podScheduling?.tolerations?.length
        ? `${form.podScheduling.tolerations.length} toleration(s)`
        : null,
      form.podScheduling?.multiPodPerHost ? "Multi-Pod" : null,
      form.podScheduling?.hostNetwork ? "Host Network" : null,
      form.podScheduling?.serviceAccountName ? "SA" : null,
      form.podScheduling?.imagePullSecrets?.length
        ? `${form.podScheduling.imagePullSecrets.length} pull secret(s)`
        : null,
      form.podScheduling?.topologySpreadConstraints?.length
        ? `${form.podScheduling.topologySpreadConstraints.length} spread constraint(s)`
        : null,
    ]
      .filter(Boolean)
      .join(", ") || "Default";

  const sidecarCount = (form.sidecars ?? []).length;
  const initContainerCount = (form.initContainers ?? []).length;
  const sidecarsSummary =
    sidecarCount > 0 || initContainerCount > 0
      ? [
          sidecarCount > 0 ? `${sidecarCount} sidecar(s)` : null,
          initContainerCount > 0 ? `${initContainerCount} init container(s)` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : "None";

  const validationPolicySummary = form.validationPolicy?.skipWorkDirValidate
    ? "Skip WorkDir Validate"
    : "Default";

  const nodeBlockListSummary =
    (form.k8sNodeBlockList ?? []).length > 0
      ? `${form.k8sNodeBlockList!.length} node(s) blocked`
      : "None";

  const bandwidthSummary =
    form.bandwidthConfig?.ingress || form.bandwidthConfig?.egress
      ? [
          form.bandwidthConfig.ingress ? `in: ${form.bandwidthConfig.ingress}` : null,
          form.bandwidthConfig.egress ? `out: ${form.bandwidthConfig.egress}` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : "No limits";

  const securityContextSummary =
    [
      form.podScheduling?.podSecurityContext?.runAsUser != null
        ? `UID: ${form.podScheduling.podSecurityContext.runAsUser}`
        : null,
      form.podScheduling?.podSecurityContext?.runAsGroup != null
        ? `GID: ${form.podScheduling.podSecurityContext.runAsGroup}`
        : null,
      form.podScheduling?.podSecurityContext?.runAsNonRoot ? "Non-Root" : null,
      form.podScheduling?.podSecurityContext?.fsGroup != null
        ? `fsGroup: ${form.podScheduling.podSecurityContext.fsGroup}`
        : null,
    ]
      .filter(Boolean)
      .join(", ") || "Default";

  const serviceMetadataSummary =
    [
      form.podService != null ? "Pod Service" : null,
      form.headlessService?.annotations || form.headlessService?.labels ? "Headless Service" : null,
    ]
      .filter(Boolean)
      .join(", ") || "Default";

  const rackIDOverrideSummary = form.enableRackIDOverride ? "Enabled" : "Disabled";

  return (
    <div className="space-y-3">
      <p className="text-base-content/60 text-sm">
        Configure optional settings. All sections have sensible defaults — expand only what you
        need.
      </p>

      <CollapsibleSection title="Monitoring & Network" summary={monitoringSummary}>
        <WizardMonitoringStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Security (ACL)" summary={aclSummary}>
        <WizardAclStep form={form} updateForm={updateForm} k8sSecrets={k8sSecrets} />
      </CollapsibleSection>

      <CollapsibleSection title="Rolling Update" summary={rollingSummary}>
        <WizardRollingUpdateStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Rack Config" summary={rackSummary}>
        <WizardRackConfigStep form={form} updateForm={updateForm} nodes={nodes} />
      </CollapsibleSection>

      <CollapsibleSection title="Pod Settings" summary={podSettingsSummary}>
        <WizardPodSettingsStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Sidecars & Init Containers" summary={sidecarsSummary}>
        <WizardSidecarsStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Node Block List" summary={nodeBlockListSummary}>
        <WizardNodeBlockListStep form={form} updateForm={updateForm} nodes={nodes} />
      </CollapsibleSection>

      <CollapsibleSection title="Bandwidth Limits" summary={bandwidthSummary}>
        <WizardBandwidthStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Validation Policy" summary={validationPolicySummary}>
        <WizardValidationPolicyStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Service Metadata" summary={serviceMetadataSummary}>
        <WizardServiceMetadataStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Rack ID Override" summary={rackIDOverrideSummary}>
        <WizardRackIDOverrideStep form={form} updateForm={updateForm} />
      </CollapsibleSection>
    </div>
  );
}
