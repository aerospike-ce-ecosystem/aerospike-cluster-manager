"use client"

import { Checkbox } from "@/components/Checkbox"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"

import type { WizardStepProps } from "./types"

export function WizardRollingUpdateStep({ form, updateForm }: WizardStepProps) {
  const ru = form.rollingUpdate ?? {}

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="ru-batch-size">Batch size</Label>
          <Input
            id="ru-batch-size"
            type="number"
            min={1}
            placeholder="Default: 1"
            value={ru.batchSize ?? ""}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              updateForm({
                rollingUpdate: {
                  ...ru,
                  batchSize: Number.isNaN(v) ? null : Math.max(1, v),
                },
              })
            }}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            How many pods to roll simultaneously.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ru-max-unavail">Max unavailable</Label>
          <Input
            id="ru-max-unavail"
            placeholder="e.g. 1 or 25%"
            value={ru.maxUnavailable ?? ""}
            onChange={(e) =>
              updateForm({
                rollingUpdate: {
                  ...ru,
                  maxUnavailable: e.target.value || null,
                },
              })
            }
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Integer or percentage. Maps to PDB max-unavailable.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="ru-disable-pdb"
          checked={ru.disablePDB ?? false}
          onCheckedChange={(c) =>
            updateForm({
              rollingUpdate: { ...ru, disablePDB: c === true },
            })
          }
        />
        <Label htmlFor="ru-disable-pdb">Disable PodDisruptionBudget</Label>
      </div>

      <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        Disabling PDB allows K8s to evict multiple Aerospike pods at once during
        voluntary disruptions. Only disable for single-node clusters or
        development workloads.
      </p>
    </div>
  )
}
