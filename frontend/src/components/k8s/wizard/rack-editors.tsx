import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { TolerationConfig } from "@/lib/api/types";

interface RackStorageVolumeEditorProps {
  volumes: Record<string, unknown>[] | undefined;
  onChange: (v: Record<string, unknown>[] | undefined) => void;
}

/** Storage volume override for a single rack volume entry. */
export function RackStorageVolumeEditor({ volumes, onChange }: RackStorageVolumeEditorProps) {
  const items = volumes ?? [];

  const addVolume = () => {
    onChange([
      ...items,
      { name: "", storageClass: "", size: "10Gi", mountPath: "/opt/aerospike/data" },
    ]);
  };

  const updateVolume = (idx: number, field: string, value: string) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value || undefined };
    onChange(next);
  };

  const removeVolume = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">Storage Volume Overrides</Label>
      <p className="text-muted-foreground text-[10px]">
        Override storage volumes for this rack (e.g. different storage class or size).
      </p>
      {items.map((vol, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[1fr_1fr_auto_1fr_auto] items-end gap-2 rounded border p-2"
        >
          <div className="grid gap-1">
            <Label className="text-[10px]">Name</Label>
            <Input
              value={String(vol.name ?? "")}
              onChange={(e) => updateVolume(idx, "name", e.target.value)}
              placeholder="e.g. data-vol"
              className="h-8 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Storage Class</Label>
            <Input
              value={String(vol.storageClass ?? "")}
              onChange={(e) => updateVolume(idx, "storageClass", e.target.value)}
              placeholder="e.g. gp3"
              className="h-8 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Size</Label>
            <Input
              value={String(vol.size ?? "")}
              onChange={(e) => updateVolume(idx, "size", e.target.value)}
              placeholder="e.g. 50Gi"
              className="h-8 w-24 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Mount Path</Label>
            <Input
              value={String(vol.mountPath ?? "")}
              onChange={(e) => updateVolume(idx, "mountPath", e.target.value)}
              placeholder="/opt/aerospike/data"
              className="h-8 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={() => removeVolume(idx)}
            className="text-muted-foreground hover:text-destructive mb-1 self-end p-1"
            title="Remove volume"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addVolume}
        className="text-accent hover:text-accent/80 flex items-center gap-1 text-xs font-medium"
      >
        <Plus className="h-3.5 w-3.5" /> Add Volume Override
      </button>
    </div>
  );
}

interface RackTolerationsEditorProps {
  tolerations: TolerationConfig[] | undefined;
  onChange: (v: TolerationConfig[] | undefined) => void;
}

/** Per-rack tolerations editor. */
export function RackTolerationsEditor({ tolerations, onChange }: RackTolerationsEditorProps) {
  const items = tolerations ?? [];

  const addToleration = () => {
    onChange([...items, { key: "", operator: "Equal", value: "", effect: "NoSchedule" }]);
  };

  const updateToleration = (idx: number, updates: Partial<TolerationConfig>) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...updates };
    onChange(next);
  };

  const removeToleration = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">Tolerations</Label>
      <p className="text-muted-foreground text-[10px]">
        Allow this rack&apos;s pods to be scheduled on nodes with matching taints.
      </p>
      {items.map((tol, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[1fr_auto_1fr_auto_auto_auto] items-end gap-2 rounded border p-2"
        >
          <div className="grid gap-1">
            <Label className="text-[10px]">Key</Label>
            <Input
              value={tol.key ?? ""}
              onChange={(e) => updateToleration(idx, { key: e.target.value || undefined })}
              placeholder="e.g. dedicated"
              className="h-8 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Operator</Label>
            <Select
              value={tol.operator ?? "Equal"}
              onChange={(e) =>
                updateToleration(idx, { operator: e.target.value as "Equal" | "Exists" })
              }
              className="h-8 w-24 text-xs"
            >
              <option value="Equal">Equal</option>
              <option value="Exists">Exists</option>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Value</Label>
            <Input
              value={tol.value ?? ""}
              onChange={(e) => updateToleration(idx, { value: e.target.value || undefined })}
              placeholder={tol.operator === "Exists" ? "(ignored)" : "e.g. aerospike"}
              disabled={tol.operator === "Exists"}
              className="h-8 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Effect</Label>
            <Select
              value={tol.effect ?? ""}
              onChange={(e) =>
                updateToleration(idx, {
                  effect: (e.target.value || undefined) as TolerationConfig["effect"],
                })
              }
              className="h-8 w-36 text-xs"
            >
              <option value="">—</option>
              <option value="NoSchedule">NoSchedule</option>
              <option value="PreferNoSchedule">PreferNoSchedule</option>
              <option value="NoExecute">NoExecute</option>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px]">Seconds</Label>
            <Input
              type="number"
              min={0}
              value={tol.tolerationSeconds ?? ""}
              onChange={(e) =>
                updateToleration(idx, {
                  tolerationSeconds: e.target.value ? parseInt(e.target.value, 10) : undefined,
                })
              }
              placeholder="n/a"
              className="h-8 w-20 text-xs"
              disabled={tol.effect !== "NoExecute"}
            />
          </div>
          <button
            type="button"
            onClick={() => removeToleration(idx)}
            className="text-muted-foreground hover:text-destructive mb-1 self-end p-1"
            title="Remove toleration"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addToleration}
        className="text-accent hover:text-accent/80 flex items-center gap-1 text-xs font-medium"
      >
        <Plus className="h-3.5 w-3.5" /> Add Toleration
      </button>
    </div>
  );
}
