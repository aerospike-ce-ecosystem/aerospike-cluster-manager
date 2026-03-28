"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { KeyValueEditor } from "@/components/common/key-value-editor";
import { isValidCIDR } from "@/lib/validations/network";
import { Plus, X } from "lucide-react";
import type { LoadBalancerSpec } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Seeds Finder LoadBalancer Section for Edit Dialog
// ---------------------------------------------------------------------------

export function EditSeedsFinderLBSection({
  lb,
  onChange,
  loading,
  setError,
}: {
  lb: LoadBalancerSpec;
  onChange: (lb: LoadBalancerSpec) => void;
  loading: boolean;
  setError: (e: string | null) => void;
}) {
  const patch = (updates: Partial<LoadBalancerSpec>) => {
    onChange({ ...lb, ...updates });
    setError(null);
  };

  const [newCidr, setNewCidr] = useState("");

  const addCidr = () => {
    const v = newCidr.trim();
    if (!v || !isValidCIDR(v)) return;
    const current = lb.loadBalancerSourceRanges ?? [];
    if (!current.includes(v)) {
      patch({ loadBalancerSourceRanges: [...current, v] });
    }
    setNewCidr("");
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label htmlFor="edit-sfs-port" className="text-[10px]">
            Service Port
          </Label>
          <Input
            id="edit-sfs-port"
            type="number"
            min={1}
            max={65535}
            value={lb.port}
            onChange={(e) => patch({ port: parseInt(e.target.value) || 3000 })}
            className="h-7 text-[10px]"
            disabled={loading}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="edit-sfs-target-port" className="text-[10px]">
            Target Port
          </Label>
          <Input
            id="edit-sfs-target-port"
            type="number"
            min={1}
            max={65535}
            value={lb.targetPort}
            onChange={(e) => patch({ targetPort: parseInt(e.target.value) || 3000 })}
            className="h-7 text-[10px]"
            disabled={loading}
          />
        </div>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="edit-sfs-traffic-policy" className="text-[10px]">
          External Traffic Policy
        </Label>
        <Select
          value={lb.externalTrafficPolicy ?? "Cluster"}
          onChange={(e) => patch({ externalTrafficPolicy: e.target.value as "Cluster" | "Local" })}
          id="edit-sfs-traffic-policy"
          className="h-7 text-[10px]"
          disabled={loading}
        >
          <option value="Cluster">Cluster (default)</option>
          <option value="Local">Local</option>
        </Select>
      </div>

      {/* Annotations */}
      <div className="grid gap-1.5">
        <Label className="text-[10px] font-semibold">Annotations</Label>
        <p className="text-base-content/60 text-[10px]">Cloud-specific LoadBalancer annotations.</p>
        <KeyValueEditor
          value={lb.annotations}
          onChange={(v) => patch({ annotations: v })}
          keyPlaceholder="e.g. service.beta.kubernetes.io/aws-load-balancer-type"
          valuePlaceholder="e.g. nlb"
          disabled={loading}
          size="sm"
        />
      </div>

      {/* Labels */}
      <div className="grid gap-1.5">
        <Label className="text-[10px] font-semibold">Labels</Label>
        <KeyValueEditor
          value={lb.labels}
          onChange={(v) => patch({ labels: v })}
          keyPlaceholder="label key"
          valuePlaceholder="value"
          disabled={loading}
          size="sm"
        />
      </div>

      {/* Source Ranges */}
      <div className="grid gap-1.5">
        <Label className="text-[10px] font-semibold">Load Balancer Source Ranges</Label>
        <p className="text-base-content/60 text-[10px]">
          Restrict access by specifying allowed CIDR ranges.
        </p>
        {(lb.loadBalancerSourceRanges ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {lb.loadBalancerSourceRanges!.map((cidr) => (
              <span
                key={cidr}
                className="bg-accent/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              >
                {cidr}
                <button
                  type="button"
                  onClick={() => {
                    patch({
                      loadBalancerSourceRanges: (lb.loadBalancerSourceRanges ?? []).filter(
                        (c) => c !== cidr,
                      ),
                    });
                  }}
                  className="hover:bg-accent/20 ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full"
                  disabled={loading}
                >
                  <X className="h-2 w-2" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <Input
            value={newCidr}
            onChange={(e) => setNewCidr(e.target.value)}
            placeholder="e.g. 10.0.0.0/8"
            className="h-7 text-[10px]"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCidr();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 text-[10px]"
            onClick={addCidr}
            disabled={loading || !newCidr.trim() || !isValidCIDR(newCidr.trim())}
          >
            <Plus className="mr-0.5 h-3 w-3" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}
