import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { K8sNodeInfo } from "@/lib/api/types";
import type { WizardAdvancedStepProps } from "../types";

interface WizardNodeBlockListStepProps {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
  nodes: K8sNodeInfo[];
}

export function WizardNodeBlockListStep({ form, updateForm, nodes }: WizardNodeBlockListStepProps) {
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
