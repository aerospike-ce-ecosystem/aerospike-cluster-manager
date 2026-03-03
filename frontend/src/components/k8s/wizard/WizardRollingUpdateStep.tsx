import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { WizardRollingUpdateStepProps } from "./types";

export function WizardRollingUpdateStep({
  form,
  updateForm,
}: WizardRollingUpdateStepProps) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="batch-size">Batch Size (optional)</Label>
        <Input
          id="batch-size"
          type="number"
          min={1}
          placeholder="e.g. 1"
          value={form.rollingUpdate?.batchSize ?? ""}
          onChange={(e) => {
            const val = e.target.value ? parseInt(e.target.value) : undefined;
            updateForm({
              rollingUpdate: {
                batchSize: val,
                maxUnavailable: form.rollingUpdate?.maxUnavailable,
                disablePDB: form.rollingUpdate?.disablePDB ?? false,
              },
            });
          }}
        />
        <p className="text-muted-foreground text-xs">
          Number of pods to update at a time during rolling restarts.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="max-unavailable">Max Unavailable (optional)</Label>
        <Input
          id="max-unavailable"
          placeholder='e.g. "1" or "25%"'
          value={form.rollingUpdate?.maxUnavailable ?? ""}
          onChange={(e) =>
            updateForm({
              rollingUpdate: {
                batchSize: form.rollingUpdate?.batchSize,
                maxUnavailable: e.target.value || undefined,
                disablePDB: form.rollingUpdate?.disablePDB ?? false,
              },
            })
          }
        />
        <p className="text-muted-foreground text-xs">
          Maximum number or percentage of pods that can be unavailable during update.
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="disable-pdb"
          checked={form.rollingUpdate?.disablePDB ?? false}
          onCheckedChange={(checked) =>
            updateForm({
              rollingUpdate: {
                batchSize: form.rollingUpdate?.batchSize,
                maxUnavailable: form.rollingUpdate?.maxUnavailable,
                disablePDB: checked === true,
              },
            })
          }
        />
        <Label htmlFor="disable-pdb" className="text-sm font-normal">
          Disable PodDisruptionBudget
        </Label>
      </div>
    </>
  );
}
