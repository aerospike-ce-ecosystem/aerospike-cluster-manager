import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WizardRackConfigStepProps } from "./types";

export function WizardRackConfigStep({
  form,
  updateForm,
  nodes,
}: WizardRackConfigStepProps) {
  const racks = form.rackConfig?.racks ?? [];
  const uniqueZones = [...new Set(nodes.map((n) => n.zone).filter(Boolean))];

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Configure multi-rack deployment for zone-aware pod distribution. Each rack gets
        its own StatefulSet with optional zone affinity.
      </p>

      {racks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-muted-foreground mb-3 text-sm">
            No racks configured. The cluster will use a single default rack.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              updateForm({
                rackConfig: {
                  racks: [{ id: 1, zone: "", region: "" }],
                },
              });
            }}
          >
            Enable Multi-Rack
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {racks.map((rack, idx) => (
            <div key={idx} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Rack #{rack.id}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive h-7 px-2"
                  onClick={() => {
                    const newRacks = racks.filter((_, i) => i !== idx);
                    updateForm({ rackConfig: { racks: newRacks } });
                  }}
                >
                  Remove
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs">Zone</Label>
                  {uniqueZones.length > 0 ? (
                    <Select
                      value={rack.zone || ""}
                      onValueChange={(v) => {
                        const newRacks = [...racks];
                        newRacks[idx] = { ...rack, zone: v };
                        updateForm({ rackConfig: { racks: newRacks } });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select zone" />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueZones.map((z) => (
                          <SelectItem key={z} value={z}>
                            {z}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={rack.zone || ""}
                      onChange={(e) => {
                        const newRacks = [...racks];
                        newRacks[idx] = { ...rack, zone: e.target.value };
                        updateForm({ rackConfig: { racks: newRacks } });
                      }}
                      placeholder="e.g. us-east-1a"
                    />
                  )}
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Max Pods Per Node</Label>
                  <Input
                    type="number"
                    min={1}
                    value={rack.maxPodsPerNode ?? ""}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      const newRacks = [...racks];
                      newRacks[idx] = {
                        ...rack,
                        maxPodsPerNode: isNaN(val) ? undefined : Math.max(1, val),
                      };
                      updateForm({ rackConfig: { racks: newRacks } });
                    }}
                    placeholder="No limit"
                  />
                </div>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const maxId = Math.max(0, ...racks.map((r) => r.id));
              updateForm({
                rackConfig: {
                  racks: [...racks, { id: maxId + 1, zone: "", region: "" }],
                },
              });
            }}
          >
            + Add Rack
          </Button>
          <p className="text-muted-foreground text-xs">
            Tip: For {form.size} nodes across {racks.length} racks, approximately{" "}
            {`${Math.floor(form.size / racks.length)}-${Math.ceil(form.size / racks.length)}`}{" "}
            pods per rack.
          </p>
        </div>
      )}
    </div>
  );
}
