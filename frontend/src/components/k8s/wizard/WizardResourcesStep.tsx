import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
        <div className="grid gap-2">
          <Label htmlFor="cpu-request">CPU Request</Label>
          <Input
            id="cpu-request"
            value={form.resources?.requests.cpu || "500m"}
            onChange={(e) => updateResource("requests", "cpu", e.target.value)}
          />
          {validateK8sCpu(form.resources?.requests.cpu || "500m") && (
            <p className="text-destructive text-xs">
              {validateK8sCpu(form.resources?.requests.cpu || "500m")}
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cpu-limit">CPU Limit</Label>
          <Input
            id="cpu-limit"
            value={form.resources?.limits.cpu || "2"}
            onChange={(e) => updateResource("limits", "cpu", e.target.value)}
          />
          {validateK8sCpu(form.resources?.limits.cpu || "2") && (
            <p className="text-destructive text-xs">
              {validateK8sCpu(form.resources?.limits.cpu || "2")}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="mem-request">Memory Request</Label>
          <Input
            id="mem-request"
            value={form.resources?.requests.memory || "1Gi"}
            onChange={(e) => updateResource("requests", "memory", e.target.value)}
          />
          {validateK8sMemory(form.resources?.requests.memory || "1Gi") && (
            <p className="text-destructive text-xs">
              {validateK8sMemory(form.resources?.requests.memory || "1Gi")}
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="mem-limit">Memory Limit</Label>
          <Input
            id="mem-limit"
            value={form.resources?.limits.memory || "4Gi"}
            onChange={(e) => updateResource("limits", "memory", e.target.value)}
          />
          {validateK8sMemory(form.resources?.limits.memory || "4Gi") && (
            <p className="text-destructive text-xs">
              {validateK8sMemory(form.resources?.limits.memory || "4Gi")}
            </p>
          )}
        </div>
      </div>

      {(() => {
        const cpuValid =
          !validateK8sCpu(res.requests.cpu) && !validateK8sCpu(res.limits.cpu);
        const memValid =
          !validateK8sMemory(res.requests.memory) && !validateK8sMemory(res.limits.memory);
        return (
          <>
            {cpuValid &&
              parseCpuMillis(res.limits.cpu) < parseCpuMillis(res.requests.cpu) && (
                <p className="text-destructive text-xs">CPU limit must be &gt;= request</p>
              )}
            {memValid &&
              parseMemoryBytes(res.limits.memory) <
                parseMemoryBytes(res.requests.memory) && (
                <p className="text-destructive text-xs">
                  Memory limit must be &gt;= request
                </p>
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
