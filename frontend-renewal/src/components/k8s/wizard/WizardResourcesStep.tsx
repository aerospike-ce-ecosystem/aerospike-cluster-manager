"use client"

import { Input } from "@/components/Input"
import { Label } from "@/components/Label"

import type { WizardStepProps } from "./types"

// FIXME(stream-c): port full CPU/memory validation and auto-fix helper —
// see frontend/src/lib/validations/k8s.ts + frontend/src/components/k8s/wizard/WizardBasicStep.tsx.

const DEFAULT_RESOURCES = {
  requests: { cpu: "500m", memory: "1Gi" },
  limits: { cpu: "2", memory: "4Gi" },
}

export function WizardResourcesStep({ form, updateForm }: WizardStepProps) {
  const res = form.resources ?? DEFAULT_RESOURCES

  const update = (
    section: "requests" | "limits",
    field: "cpu" | "memory",
    value: string,
  ) => {
    updateForm({
      resources: {
        ...res,
        [section]: { ...res[section], [field]: value },
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="cpu-request">CPU request</Label>
          <Input
            id="cpu-request"
            value={res.requests?.cpu ?? "500m"}
            onChange={(e) => update("requests", "cpu", e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cpu-limit">CPU limit</Label>
          <Input
            id="cpu-limit"
            value={res.limits?.cpu ?? "2"}
            onChange={(e) => update("limits", "cpu", e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="mem-request">Memory request</Label>
          <Input
            id="mem-request"
            value={res.requests?.memory ?? "1Gi"}
            onChange={(e) => update("requests", "memory", e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="mem-limit">Memory limit</Label>
          <Input
            id="mem-limit"
            value={res.limits?.memory ?? "4Gi"}
            onChange={(e) => update("limits", "memory", e.target.value)}
          />
        </div>
      </div>

      <p className="rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Units accept Kubernetes quantities: <code>500m</code>, <code>2</code>{" "}
        for CPU; <code>512Mi</code>, <code>4Gi</code> for memory.
      </p>
    </div>
  )
}
