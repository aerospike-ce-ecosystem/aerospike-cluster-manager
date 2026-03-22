import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface EditContainerSecuritySectionProps {
  value: Record<string, unknown> | null;
  onChange: (value: Record<string, unknown> | null) => void;
  disabled?: boolean;
}

export function EditContainerSecuritySection({
  value,
  onChange,
  disabled,
}: EditContainerSecuritySectionProps) {
  const ctx = (value ?? {}) as Record<string, unknown>;

  const update = (updates: Record<string, unknown>) => {
    const next = { ...ctx, ...updates };
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
    onChange(Object.keys(cleaned).length > 0 ? cleaned : null);
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Configure security context for the Aerospike container (separate from pod-level security).
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Run As User (UID)</Label>
          <Input
            type="number"
            min={0}
            value={ctx.runAsUser != null ? String(ctx.runAsUser) : ""}
            onChange={(e) => {
              const val = e.target.value.trim();
              update({ runAsUser: val ? Number(val) : undefined });
            }}
            placeholder="e.g. 0"
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Run As Group (GID)</Label>
          <Input
            type="number"
            min={0}
            value={ctx.runAsGroup != null ? String(ctx.runAsGroup) : ""}
            onChange={(e) => {
              const val = e.target.value.trim();
              update({ runAsGroup: val ? Number(val) : undefined });
            }}
            placeholder="e.g. 0"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="edit-sc-privileged"
            checked={(ctx.privileged as boolean) ?? false}
            onCheckedChange={(checked) =>
              update({ privileged: checked === true ? true : undefined })
            }
            disabled={disabled}
          />
          <Label htmlFor="edit-sc-privileged" className="cursor-pointer text-xs">
            Privileged
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="edit-sc-readonly"
            checked={(ctx.readOnlyRootFilesystem as boolean) ?? false}
            onCheckedChange={(checked) =>
              update({ readOnlyRootFilesystem: checked === true ? true : undefined })
            }
            disabled={disabled}
          />
          <Label htmlFor="edit-sc-readonly" className="cursor-pointer text-xs">
            Read-Only Root Filesystem
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="edit-sc-priv-escalation"
            checked={(ctx.allowPrivilegeEscalation as boolean) ?? false}
            onCheckedChange={(checked) =>
              update({ allowPrivilegeEscalation: checked === true ? true : undefined })
            }
            disabled={disabled}
          />
          <Label htmlFor="edit-sc-priv-escalation" className="cursor-pointer text-xs">
            Allow Privilege Escalation
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="edit-sc-run-as-nonroot"
            checked={(ctx.runAsNonRoot as boolean) ?? false}
            onCheckedChange={(checked) =>
              update({ runAsNonRoot: checked === true ? true : undefined })
            }
            disabled={disabled}
          />
          <Label htmlFor="edit-sc-run-as-nonroot" className="cursor-pointer text-xs">
            Run As Non-Root
          </Label>
        </div>
      </div>
    </div>
  );
}
