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
    // Keep false values (important for security fields like allowPrivilegeEscalation),
    // only strip undefined entries (fields the user never touched)
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
    onChange(Object.keys(cleaned).length > 0 ? cleaned : null);
  };

  const toggleBool = (field: string, checked: boolean | "indeterminate") => {
    // If the field was never in the original value and user unchecks, remove it.
    // If the field was present or user checks, keep the explicit boolean value.
    const originalHadField = value != null && field in value;
    if (checked === true) {
      update({ [field]: true });
    } else if (originalHadField) {
      update({ [field]: false });
    } else {
      update({ [field]: undefined });
    }
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
            onCheckedChange={(checked) => toggleBool("privileged", checked)}
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
            onCheckedChange={(checked) => toggleBool("readOnlyRootFilesystem", checked)}
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
            onCheckedChange={(checked) => toggleBool("allowPrivilegeEscalation", checked)}
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
            onCheckedChange={(checked) => toggleBool("runAsNonRoot", checked)}
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
