"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { Plus, X } from "lucide-react";
import type { TolerationConfig } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Pod Scheduling Section for Edit Dialog
// ---------------------------------------------------------------------------

export function EditPodSchedulingSection({
  nodeSelector,
  onNodeSelectorChange,
  tolerations,
  onTolerationsChange,
  multiPodPerHost,
  onMultiPodPerHostChange,
  hostNetwork,
  onHostNetworkChange,
  serviceAccountName,
  onServiceAccountNameChange,
  terminationGracePeriod,
  onTerminationGracePeriodChange,
  imagePullSecrets,
  onImagePullSecretsChange,
  priorityClassName,
  onPriorityClassNameChange,
  disabled,
}: {
  nodeSelector: Record<string, string>;
  onNodeSelectorChange: (v: Record<string, string>) => void;
  tolerations: TolerationConfig[];
  onTolerationsChange: (v: TolerationConfig[]) => void;
  multiPodPerHost: boolean;
  onMultiPodPerHostChange: (v: boolean) => void;
  hostNetwork: boolean;
  onHostNetworkChange: (v: boolean) => void;
  serviceAccountName: string;
  onServiceAccountNameChange: (v: string) => void;
  terminationGracePeriod: number | undefined;
  onTerminationGracePeriodChange: (v: number | undefined) => void;
  imagePullSecrets: string[];
  onImagePullSecretsChange: (v: string[]) => void;
  priorityClassName?: string;
  onPriorityClassNameChange?: (v: string) => void;
  disabled?: boolean;
}) {
  const [nsSelectorKey, setNsSelectorKey] = useState("");
  const [nsSelectorValue, setNsSelectorValue] = useState("");
  const [newSecret, setNewSecret] = useState("");

  const addNodeSelector = () => {
    const k = nsSelectorKey.trim();
    const v = nsSelectorValue.trim();
    if (!k || !v) return;
    onNodeSelectorChange({ ...nodeSelector, [k]: v });
    setNsSelectorKey("");
    setNsSelectorValue("");
  };

  const removeNodeSelector = (key: string) => {
    const next = { ...nodeSelector };
    delete next[key];
    onNodeSelectorChange(next);
  };

  const addToleration = () => {
    onTolerationsChange([
      ...tolerations,
      { key: "", operator: "Equal", value: "", effect: "NoSchedule" },
    ]);
  };

  const updateToleration = (index: number, updates: Partial<TolerationConfig>) => {
    const next = [...tolerations];
    next[index] = { ...next[index], ...updates };
    onTolerationsChange(next);
  };

  const removeToleration = (index: number) => {
    onTolerationsChange(tolerations.filter((_, i) => i !== index));
  };

  const addImagePullSecret = () => {
    const name = newSecret.trim();
    if (!name || imagePullSecrets.includes(name)) return;
    onImagePullSecretsChange([...imagePullSecrets, name]);
    setNewSecret("");
  };

  const removeImagePullSecret = (name: string) => {
    onImagePullSecretsChange(imagePullSecrets.filter((s) => s !== name));
  };

  const selectorCount = Object.keys(nodeSelector).length;
  const summary =
    [
      selectorCount > 0 ? `${selectorCount} selector(s)` : null,
      tolerations.length > 0 ? `${tolerations.length} toleration(s)` : null,
      multiPodPerHost ? "Multi-Pod" : null,
      hostNetwork ? "Host Network" : null,
      serviceAccountName ? "SA" : null,
      imagePullSecrets.length > 0 ? `${imagePullSecrets.length} pull secret(s)` : null,
      terminationGracePeriod != null ? `Grace: ${terminationGracePeriod}s` : null,
      priorityClassName ? `Priority: ${priorityClassName}` : null,
    ]
      .filter(Boolean)
      .join(", ") || "Default";

  return (
    <CollapsibleSection title="Pod Scheduling" summary={summary} size="sm">
      <div className="space-y-4">
        {/* Node Selector */}
        <div className="grid gap-2">
          <Label className="text-xs font-semibold">Node Selector</Label>
          <p className="text-base-content/60 text-[10px]">
            Constrain pods to nodes with matching labels.
          </p>
          {selectorCount > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(nodeSelector).map(([k, v]) => (
                <span
                  key={k}
                  className="bg-accent/10 text-accent inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                >
                  {k}={v}
                  <button
                    type="button"
                    onClick={() => removeNodeSelector(k)}
                    disabled={disabled}
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
              className="h-7 flex-1 text-xs"
              disabled={disabled}
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
              className="h-7 flex-1 text-xs"
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNodeSelector();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-[10px]"
              onClick={addNodeSelector}
              disabled={disabled || !nsSelectorKey.trim() || !nsSelectorValue.trim()}
            >
              <Plus className="mr-0.5 h-3 w-3" />
              Add
            </Button>
          </div>
        </div>

        {/* Tolerations */}
        <div className="grid gap-2">
          <Label className="text-xs font-semibold">Tolerations</Label>
          <p className="text-base-content/60 text-[10px]">
            Allow pods to be scheduled on nodes with matching taints.
          </p>
          {tolerations.map((tol, idx) => (
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
                  className="h-7 text-xs"
                  disabled={disabled}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px]">Operator</Label>
                <Select
                  value={tol.operator ?? "Equal"}
                  onChange={(e) =>
                    updateToleration(idx, { operator: e.target.value as "Equal" | "Exists" })
                  }
                  className="h-7 w-20 text-[10px]"
                  disabled={disabled}
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
                  disabled={disabled || tol.operator === "Exists"}
                  className="h-7 text-xs"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px]">Effect</Label>
                <Select
                  value={tol.effect ?? ""}
                  onChange={(e) =>
                    updateToleration(idx, { effect: e.target.value as TolerationConfig["effect"] })
                  }
                  className="h-7 w-28 text-[10px]"
                  disabled={disabled}
                >
                  <option value="NoSchedule">NoSchedule</option>
                  <option value="PreferNoSchedule">PreferNoSchedule</option>
                  <option value="NoExecute">NoExecute</option>
                </Select>
              </div>
              <button
                type="button"
                onClick={() => removeToleration(idx)}
                disabled={disabled}
                className="text-base-content/60 hover:text-error mb-1 self-end p-1"
                title="Remove toleration"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addToleration}
            disabled={disabled}
            className="text-accent hover:text-accent/80 flex items-center gap-1 text-xs font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add Toleration
          </button>
        </div>

        {/* Toggles: Multi Pod Per Host, Host Network */}
        <div className="grid gap-3">
          <Label className="text-xs font-semibold">Pod Placement</Label>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="edit-multi-pod" className="cursor-pointer text-xs">
                Multi Pod Per Host
              </Label>
              <p className="text-base-content/60 text-[10px]">
                Allow multiple Aerospike pods on the same node.
              </p>
            </div>
            <Switch
              id="edit-multi-pod"
              checked={multiPodPerHost}
              onCheckedChange={onMultiPodPerHostChange}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="edit-host-network" className="cursor-pointer text-xs">
                Host Network
              </Label>
              <p className="text-base-content/60 text-[10px]">
                Use the host&apos;s network namespace instead of pod networking.
              </p>
            </div>
            <Switch
              id="edit-host-network"
              checked={hostNetwork}
              onCheckedChange={onHostNetworkChange}
              disabled={disabled}
            />
          </div>
        </div>

        {/* Service Account Name */}
        <div className="grid gap-1">
          <Label htmlFor="edit-service-account" className="text-xs font-semibold">
            Service Account Name
          </Label>
          <Input
            id="edit-service-account"
            value={serviceAccountName}
            onChange={(e) => onServiceAccountNameChange(e.target.value)}
            placeholder="e.g. aerospike-sa"
            className="h-7 text-xs"
            disabled={disabled}
          />
        </div>

        {/* Priority Class Name */}
        {onPriorityClassNameChange && (
          <div className="grid gap-1">
            <Label htmlFor="edit-priority-class" className="text-xs font-semibold">
              Priority Class Name
            </Label>
            <Input
              id="edit-priority-class"
              value={priorityClassName ?? ""}
              onChange={(e) => onPriorityClassNameChange(e.target.value)}
              placeholder="e.g. high-priority"
              className="h-7 text-xs"
              disabled={disabled}
            />
          </div>
        )}

        {/* Termination Grace Period */}
        <div className="grid gap-1">
          <Label htmlFor="edit-termination-grace" className="text-xs font-semibold">
            Termination Grace Period (seconds)
          </Label>
          <Input
            id="edit-termination-grace"
            type="number"
            min={0}
            value={terminationGracePeriod ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onTerminationGracePeriodChange(val ? parseInt(val, 10) : undefined);
            }}
            placeholder="e.g. 600 (default: 30)"
            className="h-7 w-40 text-xs"
            disabled={disabled}
          />
        </div>

        {/* Priority Class Name */}
        {onPriorityClassNameChange && (
          <div className="grid gap-1">
            <Label htmlFor="edit-priority-class" className="text-xs font-semibold">
              Priority Class Name
            </Label>
            <p className="text-base-content/60 text-[10px]">
              PriorityClass for pod scheduling priority and preemption.
            </p>
            <Input
              id="edit-priority-class"
              value={priorityClassName ?? ""}
              onChange={(e) => onPriorityClassNameChange(e.target.value)}
              placeholder="e.g. high-priority"
              className="h-7 text-xs"
              disabled={disabled}
            />
          </div>
        )}

        {/* Image Pull Secrets */}
        <div className="grid gap-2">
          <Label className="text-xs font-semibold">Image Pull Secrets</Label>
          <p className="text-base-content/60 text-[10px]">
            Kubernetes secrets for pulling images from private registries.
          </p>
          {imagePullSecrets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {imagePullSecrets.map((secret) => (
                <span
                  key={secret}
                  className="bg-accent/10 text-accent inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                >
                  {secret}
                  <button
                    type="button"
                    onClick={() => removeImagePullSecret(secret)}
                    disabled={disabled}
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
              className="h-7 flex-1 text-xs"
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addImagePullSecret();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-[10px]"
              onClick={addImagePullSecret}
              disabled={disabled || !newSecret.trim()}
            >
              <Plus className="mr-0.5 h-3 w-3" />
              Add
            </Button>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
