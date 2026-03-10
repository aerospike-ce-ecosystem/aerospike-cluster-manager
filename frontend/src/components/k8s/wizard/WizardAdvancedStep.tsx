import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WizardMonitoringStep } from "./WizardMonitoringStep";
import { WizardAclStep } from "./WizardAclStep";
import { WizardRollingUpdateStep } from "./WizardRollingUpdateStep";
import { WizardRackConfigStep } from "./WizardRackConfigStep";
import type { WizardAdvancedStepProps } from "./types";
import { Button } from "@/components/ui/button";
import type {
  PodSchedulingConfig,
  BandwidthConfig,
  ValidationPolicyConfig,
  TolerationConfig,
  K8sNodeInfo,
  ServiceMetadataConfig,
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
      <p className="text-muted-foreground text-sm">
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
      <p className="text-muted-foreground -mt-2 ml-6 text-[10px]">
        Pods are excluded from Service endpoints until Aerospike joins cluster mesh and finishes
        migrations.
      </p>

      {/* Pod Management Policy & DNS Policy */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label className="text-xs">Pod Management Policy</Label>
          <Select
            value={scheduling?.podManagementPolicy || "default"}
            onValueChange={(v) => {
              updateScheduling({
                podManagementPolicy:
                  v === "default" ? undefined : (v as "OrderedReady" | "Parallel"),
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default (OrderedReady)</SelectItem>
              <SelectItem value="OrderedReady">OrderedReady</SelectItem>
              <SelectItem value="Parallel">Parallel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">DNS Policy</Label>
          <Select
            value={scheduling?.dnsPolicy || "default"}
            onValueChange={(v) => {
              updateScheduling({ dnsPolicy: v === "default" ? undefined : v });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default (ClusterFirst)</SelectItem>
              <SelectItem value="ClusterFirst">ClusterFirst</SelectItem>
              <SelectItem value="ClusterFirstWithHostNet">ClusterFirstWithHostNet</SelectItem>
              <SelectItem value="Default">Default</SelectItem>
              <SelectItem value="None">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Node Selector */}
      <div className="grid gap-2">
        <Label className="text-sm font-semibold">Node Selector</Label>
        <p className="text-muted-foreground text-[10px]">
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
        <p className="text-muted-foreground text-[10px]">
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
                onValueChange={(v) => updateToleration(idx, { operator: v as "Equal" | "Exists" })}
              >
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Equal">Equal</SelectItem>
                  <SelectItem value="Exists">Exists</SelectItem>
                </SelectContent>
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
                onValueChange={(v) =>
                  updateToleration(idx, {
                    effect: v as TolerationConfig["effect"],
                  })
                }
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NoSchedule">NoSchedule</SelectItem>
                  <SelectItem value="PreferNoSchedule">PreferNoSchedule</SelectItem>
                  <SelectItem value="NoExecute">NoExecute</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button
              type="button"
              onClick={() => removeToleration(idx)}
              className="text-muted-foreground hover:text-destructive mb-1 self-end p-1"
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
            <p className="text-muted-foreground text-[10px]">
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
            <p className="text-muted-foreground text-[10px]">
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
        <p className="text-muted-foreground text-[10px]">
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
        <p className="text-muted-foreground text-[10px]">
          Time in seconds before a pod is forcefully terminated. Leave empty for Kubernetes default
          (30s).
        </p>
      </div>

      {/* Image Pull Secrets */}
      <div className="grid gap-2">
        <Label className="text-sm font-semibold">Image Pull Secrets</Label>
        <p className="text-muted-foreground text-[10px]">
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
      <p className="text-muted-foreground text-sm">
        Select Kubernetes nodes to exclude from scheduling Aerospike pods.
      </p>

      {/* Selected blocked nodes as chips */}
      {blockedNodes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {blockedNodes.map((node) => (
            <span
              key={node}
              className="bg-destructive/10 text-destructive inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
            >
              {node}
              <button
                type="button"
                onClick={() => removeNode(node)}
                className="hover:bg-destructive/20 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
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
                  {node.zone && <span className="text-muted-foreground">({node.zone})</span>}
                  {!node.ready && <span className="text-destructive text-[10px]">Not Ready</span>}
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
        <p className="text-muted-foreground text-[10px]">
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
      <p className="text-muted-foreground text-sm">
        Configure validation behavior for the Aerospike cluster.
      </p>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="skip-workdir-validate" className="cursor-pointer text-xs">
            Skip Work Dir Validate
          </Label>
          <p className="text-muted-foreground text-[10px]">
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
      <p className="text-muted-foreground text-sm">
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
          <p className="text-muted-foreground text-[10px]">Max incoming bandwidth per pod</p>
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
          <p className="text-muted-foreground text-[10px]">Max outgoing bandwidth per pod</p>
        </div>
      </div>
    </div>
  );
}

/** Inline key-value pair editor for Record<string, string> fields. */
function ServiceKvEditor({
  value,
  onChange,
  keyPlaceholder = "key",
  valuePlaceholder = "value",
  addLabel = "Add",
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
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive p-1"
            onClick={() => removeEntry(k)}
          >
            <X className="h-3 w-3" />
          </button>
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
  const patch = (updates: Partial<ServiceMetadataConfig>) => {
    const next = { ...value, ...updates };
    // Clear if both are empty
    if (!next.annotations && !next.labels) {
      onChange(undefined);
    } else {
      onChange(next);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{description}</p>

      <div className="grid gap-2">
        <Label className="text-xs font-semibold">{title} Annotations</Label>
        <p className="text-muted-foreground text-[10px]">
          Custom annotations applied to the {title.toLowerCase()} resource.
        </p>
        <ServiceKvEditor
          value={value?.annotations}
          onChange={(annotations) => patch({ annotations })}
          keyPlaceholder="e.g. service.beta.kubernetes.io/aws-load-balancer-type"
          valuePlaceholder="e.g. nlb"
        />
      </div>

      <div className="grid gap-2">
        <Label className="text-xs font-semibold">{title} Labels</Label>
        <p className="text-muted-foreground text-[10px]">
          Custom labels applied to the {title.toLowerCase()} resource.
        </p>
        <ServiceKvEditor
          value={value?.labels}
          onChange={(labels) => patch({ labels })}
          keyPlaceholder="e.g. app.kubernetes.io/component"
          valuePlaceholder="e.g. aerospike"
        />
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
      <p className="text-muted-foreground text-sm">
        Configure custom metadata (annotations and labels) for the Kubernetes services created by
        the Aerospike operator.
      </p>

      <ServiceMetadataEditor
        title="Headless Service"
        description="The headless service is used for inter-pod discovery within the StatefulSet."
        value={form.headlessService}
        onChange={(headlessService) => updateForm({ headlessService })}
      />

      <div className="border-t" />

      <ServiceMetadataEditor
        title="Pod Service"
        description="Per-pod services provide stable network endpoints for individual Aerospike nodes."
        value={form.podService}
        onChange={(podService) => updateForm({ podService })}
      />
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
    ]
      .filter(Boolean)
      .join(", ") || "Default";

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

  const serviceMetadataSummary =
    [
      form.headlessService?.annotations ? "Headless annotations" : null,
      form.headlessService?.labels ? "Headless labels" : null,
      form.podService?.annotations ? "Pod annotations" : null,
      form.podService?.labels ? "Pod labels" : null,
    ]
      .filter(Boolean)
      .join(", ") || "None";

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
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
    </div>
  );
}
