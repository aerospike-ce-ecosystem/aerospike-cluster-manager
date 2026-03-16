import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/common/form-field";
import {
  validateK8sCpu,
  validateK8sMemory,
  parseCpuMillis,
  parseMemoryBytes,
} from "@/lib/validations/k8s";
import type { WizardResourcesStepProps } from "./types";

export function WizardResourcesStep({
  form,
  updateForm,
  defaultResources,
}: WizardResourcesStepProps) {
  const updateResource = (
    section: "requests" | "limits",
    field: "cpu" | "memory",
    value: string,
  ) => {
    const current = form.resources ?? defaultResources;
    updateForm({
      resources: {
        ...current,
        [section]: { ...current[section], [field]: value },
      },
    });
  };

  const res = form.resources ?? defaultResources;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          id="cpu-request"
          label="CPU Request"
          error={validateK8sCpu(form.resources?.requests.cpu || "500m") || null}
        >
          <Input
            id="cpu-request"
            value={form.resources?.requests.cpu || "500m"}
            onChange={(e) => updateResource("requests", "cpu", e.target.value)}
          />
        </FormField>
        <FormField
          id="cpu-limit"
          label="CPU Limit"
          error={validateK8sCpu(form.resources?.limits.cpu || "2") || null}
        >
          <Input
            id="cpu-limit"
            value={form.resources?.limits.cpu || "2"}
            onChange={(e) => updateResource("limits", "cpu", e.target.value)}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          id="mem-request"
          label="Memory Request"
          error={validateK8sMemory(form.resources?.requests.memory || "1Gi") || null}
        >
          <Input
            id="mem-request"
            value={form.resources?.requests.memory || "1Gi"}
            onChange={(e) => updateResource("requests", "memory", e.target.value)}
          />
        </FormField>
        <FormField
          id="mem-limit"
          label="Memory Limit"
          error={validateK8sMemory(form.resources?.limits.memory || "4Gi") || null}
        >
          <Input
            id="mem-limit"
            value={form.resources?.limits.memory || "4Gi"}
            onChange={(e) => updateResource("limits", "memory", e.target.value)}
          />
        </FormField>
      </div>

      {(() => {
        const cpuValid = !validateK8sCpu(res.requests.cpu) && !validateK8sCpu(res.limits.cpu);
        const memValid =
          !validateK8sMemory(res.requests.memory) && !validateK8sMemory(res.limits.memory);
        return (
          <>
            {cpuValid && parseCpuMillis(res.limits.cpu) < parseCpuMillis(res.requests.cpu) && (
              <p className="text-error text-xs">CPU limit must be &gt;= request</p>
            )}
            {memValid &&
              parseMemoryBytes(res.limits.memory) < parseMemoryBytes(res.requests.memory) && (
                <p className="text-error text-xs">Memory limit must be &gt;= request</p>
              )}
          </>
        );
      })()}

      <div className="flex items-center space-x-2 pt-2">
        <Checkbox
          id="auto-connect"
          checked={form.autoConnect}
          onCheckedChange={(checked) => updateForm({ autoConnect: checked === true })}
        />
        <Label htmlFor="auto-connect" className="text-sm font-normal">
          Auto-connect after creation
        </Label>
      </div>
    </>
  );
}
