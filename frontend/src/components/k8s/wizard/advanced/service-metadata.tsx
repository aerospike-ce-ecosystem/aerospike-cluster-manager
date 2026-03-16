import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ServiceMetadataEditor } from "./service-metadata-editor";
import type { WizardAdvancedStepProps } from "../types";

interface WizardServiceMetadataStepProps {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
}

export function WizardServiceMetadataStep({ form, updateForm }: WizardServiceMetadataStepProps) {
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
