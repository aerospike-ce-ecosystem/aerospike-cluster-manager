import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ValidationPolicyConfig } from "@/lib/api/types";
import type { WizardAdvancedStepProps } from "../types";

interface WizardValidationPolicyStepProps {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
}

export function WizardValidationPolicyStep({ form, updateForm }: WizardValidationPolicyStepProps) {
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
