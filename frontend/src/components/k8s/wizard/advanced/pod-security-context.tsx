import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PodSecurityContextConfig } from "@/lib/api/types";
import type { WizardAdvancedStepProps } from "../types";

interface WizardPodSecurityContextStepProps {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
}

export function WizardPodSecurityContextStep({
  form,
  updateForm,
}: WizardPodSecurityContextStepProps) {
  const scheduling = form.podScheduling;
  const ctx = scheduling?.podSecurityContext;

  const updateSecurityContext = (updates: Partial<PodSecurityContextConfig>) => {
    const next = { ...ctx, ...updates };
    const hasValue =
      next.runAsUser != null ||
      next.runAsGroup != null ||
      next.runAsNonRoot != null ||
      next.fsGroup != null ||
      (next.supplementalGroups && next.supplementalGroups.length > 0);
    updateForm({
      podScheduling: {
        ...scheduling,
        podSecurityContext: hasValue ? (next as PodSecurityContextConfig) : undefined,
      },
    });
  };

  const [newSupGroup, setNewSupGroup] = useState("");

  return (
    <div className="space-y-4">
      <p className="text-base-content/60 text-sm">
        Configure the pod-level security context for Aerospike pods.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="run-as-user" className="text-xs">
            Run As User
          </Label>
          <Input
            id="run-as-user"
            type="number"
            min={0}
            value={ctx?.runAsUser ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              updateSecurityContext({ runAsUser: val ? parseInt(val, 10) : undefined });
            }}
            placeholder="e.g. 1000"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="run-as-group" className="text-xs">
            Run As Group
          </Label>
          <Input
            id="run-as-group"
            type="number"
            min={0}
            value={ctx?.runAsGroup ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              updateSecurityContext({ runAsGroup: val ? parseInt(val, 10) : undefined });
            }}
            placeholder="e.g. 1000"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="fs-group" className="text-xs">
            FS Group
          </Label>
          <Input
            id="fs-group"
            type="number"
            min={0}
            value={ctx?.fsGroup ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              updateSecurityContext({ fsGroup: val ? parseInt(val, 10) : undefined });
            }}
            placeholder="e.g. 1000"
          />
          <p className="text-base-content/60 text-[10px]">
            GID applied to all volumes mounted in the pod.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start pt-6">
          <Switch
            id="run-as-non-root"
            checked={ctx?.runAsNonRoot ?? false}
            onCheckedChange={(checked) =>
              updateSecurityContext({ runAsNonRoot: checked || undefined })
            }
          />
          <Label htmlFor="run-as-non-root" className="cursor-pointer text-xs">
            Run As Non-Root
          </Label>
        </div>
      </div>

      {/* Supplemental Groups */}
      <div className="grid gap-2">
        <Label className="text-xs font-semibold">Supplemental Groups</Label>
        <p className="text-base-content/60 text-[10px]">
          Additional GIDs applied to the first process run in each container.
        </p>
        {(ctx?.supplementalGroups ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {ctx!.supplementalGroups!.map((gid) => (
              <span
                key={gid}
                className="bg-accent/10 text-primary inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              >
                {gid}
                <button
                  type="button"
                  onClick={() => {
                    const next = (ctx?.supplementalGroups ?? []).filter((g) => g !== gid);
                    updateSecurityContext({
                      supplementalGroups: next.length > 0 ? next : undefined,
                    });
                  }}
                  className="hover:bg-accent/20 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                  title={`Remove ${gid}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newSupGroup}
            onChange={(e) => setNewSupGroup(e.target.value)}
            type="number"
            min={0}
            placeholder="e.g. 1000"
            className="w-32"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const val = parseInt(newSupGroup, 10);
                if (!isNaN(val)) {
                  const current = ctx?.supplementalGroups ?? [];
                  if (!current.includes(val)) {
                    updateSecurityContext({ supplementalGroups: [...current, val] });
                  }
                  setNewSupGroup("");
                }
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              const val = parseInt(newSupGroup, 10);
              if (!isNaN(val)) {
                const current = ctx?.supplementalGroups ?? [];
                if (!current.includes(val)) {
                  updateSecurityContext({ supplementalGroups: [...current, val] });
                }
                setNewSupGroup("");
              }
            }}
            disabled={!newSupGroup.trim() || isNaN(parseInt(newSupGroup, 10))}
            className="bg-accent text-primary-content hover:bg-accent/80 rounded px-3 text-xs font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
