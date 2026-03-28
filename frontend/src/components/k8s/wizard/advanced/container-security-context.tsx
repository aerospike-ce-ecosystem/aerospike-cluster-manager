import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { CreateK8sClusterRequest } from "@/lib/api/types";

interface ContainerSecurityContextProps {
  form: CreateK8sClusterRequest;
  updateForm: (updates: Partial<CreateK8sClusterRequest>) => void;
}

export function ContainerSecurityContext({ form, updateForm }: ContainerSecurityContextProps) {
  const ctx = (form.aerospikeContainerSecurityContext ?? {}) as Record<string, unknown>;

  const updateCtx = (updates: Record<string, unknown>) => {
    const next = { ...ctx, ...updates };
    // Remove keys with undefined values
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
    updateForm({
      aerospikeContainerSecurityContext: Object.keys(cleaned).length > 0 ? cleaned : undefined,
    });
  };

  const [addCapInput, setAddCapInput] = useState("");
  const [dropCapInput, setDropCapInput] = useState("");

  const capabilities = (ctx.capabilities ?? {}) as {
    add?: string[];
    drop?: string[];
  };

  const updateCapabilities = (updates: { add?: string[]; drop?: string[] }) => {
    const next = { ...capabilities, ...updates };
    if (!next.add?.length && !next.drop?.length) {
      updateCtx({ capabilities: undefined });
    } else {
      const cap: Record<string, string[]> = {};
      if (next.add?.length) cap.add = next.add;
      if (next.drop?.length) cap.drop = next.drop;
      updateCtx({ capabilities: cap });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Configure the security context for the Aerospike container. These settings control Linux
        capabilities, user/group IDs, and privilege escalation.
      </p>

      {/* Run As User / Group */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="sc-run-as-user" className="text-xs">
            Run As User (UID)
          </Label>
          <Input
            id="sc-run-as-user"
            type="number"
            value={ctx.runAsUser != null ? String(ctx.runAsUser) : ""}
            onChange={(e) => {
              const val = e.target.value.trim();
              updateCtx({ runAsUser: val ? Number(val) : undefined });
            }}
            placeholder="e.g. 0"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sc-run-as-group" className="text-xs">
            Run As Group (GID)
          </Label>
          <Input
            id="sc-run-as-group"
            type="number"
            value={ctx.runAsGroup != null ? String(ctx.runAsGroup) : ""}
            onChange={(e) => {
              const val = e.target.value.trim();
              updateCtx({ runAsGroup: val ? Number(val) : undefined });
            }}
            placeholder="e.g. 0"
          />
        </div>
      </div>

      {/* Boolean flags */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="sc-privileged"
            checked={(ctx.privileged as boolean) ?? false}
            onCheckedChange={(checked) => {
              updateCtx({ privileged: checked === true ? true : undefined });
            }}
          />
          <Label htmlFor="sc-privileged" className="cursor-pointer text-xs">
            Privileged
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="sc-read-only-root"
            checked={(ctx.readOnlyRootFilesystem as boolean) ?? false}
            onCheckedChange={(checked) => {
              updateCtx({ readOnlyRootFilesystem: checked === true ? true : undefined });
            }}
          />
          <Label htmlFor="sc-read-only-root" className="cursor-pointer text-xs">
            Read-Only Root Filesystem
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="sc-allow-priv-escalation"
            checked={(ctx.allowPrivilegeEscalation as boolean) ?? false}
            onCheckedChange={(checked) => {
              updateCtx({ allowPrivilegeEscalation: checked === true ? true : undefined });
            }}
          />
          <Label htmlFor="sc-allow-priv-escalation" className="cursor-pointer text-xs">
            Allow Privilege Escalation
          </Label>
        </div>
      </div>

      {/* Capabilities */}
      <div className="grid gap-3">
        <Label className="text-sm font-semibold">Capabilities</Label>

        {/* Add capabilities */}
        <div className="grid gap-1.5">
          <Label className="text-xs">Add</Label>
          {(capabilities.add ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {capabilities.add!.map((cap) => (
                <span
                  key={cap}
                  className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                >
                  {cap}
                  <button
                    type="button"
                    onClick={() =>
                      updateCapabilities({ add: capabilities.add!.filter((c) => c !== cap) })
                    }
                    className="hover:bg-primary/20 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={addCapInput}
              onChange={(e) => setAddCapInput(e.target.value.toUpperCase())}
              placeholder="e.g. NET_ADMIN"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = addCapInput.trim();
                  if (val && !(capabilities.add ?? []).includes(val)) {
                    updateCapabilities({ add: [...(capabilities.add ?? []), val] });
                  }
                  setAddCapInput("");
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                const val = addCapInput.trim();
                if (val && !(capabilities.add ?? []).includes(val)) {
                  updateCapabilities({ add: [...(capabilities.add ?? []), val] });
                }
                setAddCapInput("");
              }}
              disabled={!addCapInput.trim()}
              className="bg-accent text-primary-content hover:bg-accent/80 rounded px-3 text-xs font-medium disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        {/* Drop capabilities */}
        <div className="grid gap-1.5">
          <Label className="text-xs">Drop</Label>
          {(capabilities.drop ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {capabilities.drop!.map((cap) => (
                <span
                  key={cap}
                  className="bg-error/10 text-error inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                >
                  {cap}
                  <button
                    type="button"
                    onClick={() =>
                      updateCapabilities({ drop: capabilities.drop!.filter((c) => c !== cap) })
                    }
                    className="hover:bg-error/20 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={dropCapInput}
              onChange={(e) => setDropCapInput(e.target.value.toUpperCase())}
              placeholder="e.g. ALL"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = dropCapInput.trim();
                  if (val && !(capabilities.drop ?? []).includes(val)) {
                    updateCapabilities({ drop: [...(capabilities.drop ?? []), val] });
                  }
                  setDropCapInput("");
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                const val = dropCapInput.trim();
                if (val && !(capabilities.drop ?? []).includes(val)) {
                  updateCapabilities({ drop: [...(capabilities.drop ?? []), val] });
                }
                setDropCapInput("");
              }}
              disabled={!dropCapInput.trim()}
              className="bg-accent text-primary-content hover:bg-accent/80 rounded px-3 text-xs font-medium disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
