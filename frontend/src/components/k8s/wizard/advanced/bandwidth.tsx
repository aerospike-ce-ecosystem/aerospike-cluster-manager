import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BandwidthConfig } from "@/lib/api/types";
import type { WizardAdvancedStepProps } from "../types";

interface WizardBandwidthStepProps {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
}

export function WizardBandwidthStep({ form, updateForm }: WizardBandwidthStepProps) {
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
