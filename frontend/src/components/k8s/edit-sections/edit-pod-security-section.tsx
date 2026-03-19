"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Pod Security Context Section for Edit Dialog
// ---------------------------------------------------------------------------

/** Small input for adding supplemental group GIDs. */
function EditSupGroupInput({
  onAdd,
  disabled,
}: {
  onAdd: (gid: number) => void;
  disabled?: boolean;
}) {
  const [val, setVal] = useState("");
  const add = () => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0) {
      onAdd(n);
      setVal("");
    }
  };
  return (
    <div className="flex gap-1.5">
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        type="number"
        min={0}
        placeholder="e.g. 1000"
        className="h-7 w-24 text-[10px]"
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 shrink-0 text-[10px]"
        onClick={add}
        disabled={disabled || !val.trim() || isNaN(parseInt(val, 10))}
      >
        <Plus className="mr-0.5 h-3 w-3" /> Add
      </Button>
    </div>
  );
}

export function EditPodSecuritySection({
  runAsUser,
  runAsGroup,
  runAsNonRoot,
  fsGroup,
  supplementalGroups,
  disabled,
  onRunAsUserChange,
  onRunAsGroupChange,
  onRunAsNonRootChange,
  onFsGroupChange,
  onSupplementalGroupsChange,
}: {
  runAsUser: number | undefined;
  runAsGroup: number | undefined;
  runAsNonRoot: boolean;
  fsGroup: number | undefined;
  supplementalGroups: number[];
  disabled?: boolean;
  onRunAsUserChange: (v: number | undefined) => void;
  onRunAsGroupChange: (v: number | undefined) => void;
  onRunAsNonRootChange: (v: boolean) => void;
  onFsGroupChange: (v: number | undefined) => void;
  onSupplementalGroupsChange: (v: number[]) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-base-content/60 text-[10px]">
        Configure the pod-level security context.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label htmlFor="edit-run-as-user" className="text-[10px]">
            Run As User
          </Label>
          <Input
            id="edit-run-as-user"
            type="number"
            min={0}
            value={runAsUser ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onRunAsUserChange(val ? parseInt(val, 10) : undefined);
            }}
            placeholder="e.g. 1000"
            className="h-7 text-[10px]"
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="edit-run-as-group" className="text-[10px]">
            Run As Group
          </Label>
          <Input
            id="edit-run-as-group"
            type="number"
            min={0}
            value={runAsGroup ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onRunAsGroupChange(val ? parseInt(val, 10) : undefined);
            }}
            placeholder="e.g. 1000"
            className="h-7 text-[10px]"
            disabled={disabled}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label htmlFor="edit-fs-group" className="text-[10px]">
            FS Group
          </Label>
          <Input
            id="edit-fs-group"
            type="number"
            min={0}
            value={fsGroup ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onFsGroupChange(val ? parseInt(val, 10) : undefined);
            }}
            placeholder="e.g. 1000"
            className="h-7 text-[10px]"
            disabled={disabled}
          />
        </div>
        <div className="flex items-center gap-2 self-end pb-1">
          <Switch
            id="edit-run-as-non-root"
            checked={runAsNonRoot}
            onCheckedChange={(checked) => {
              onRunAsNonRootChange(checked);
            }}
            disabled={disabled}
          />
          <Label htmlFor="edit-run-as-non-root" className="cursor-pointer text-[10px]">
            Run As Non-Root
          </Label>
        </div>
      </div>
      <div className="grid gap-1">
        <Label className="text-[10px] font-semibold">Supplemental Groups</Label>
        {supplementalGroups.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {supplementalGroups.map((gid) => (
              <span
                key={gid}
                className="bg-accent/10 text-accent inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              >
                {gid}
                <button
                  type="button"
                  onClick={() => {
                    onSupplementalGroupsChange(supplementalGroups.filter((g) => g !== gid));
                  }}
                  className="hover:bg-accent/20 ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full"
                  disabled={disabled}
                >
                  <X className="h-2 w-2" />
                </button>
              </span>
            ))}
          </div>
        )}
        <EditSupGroupInput
          onAdd={(gid) => {
            if (!supplementalGroups.includes(gid)) {
              onSupplementalGroupsChange([...supplementalGroups, gid]);
            }
          }}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
