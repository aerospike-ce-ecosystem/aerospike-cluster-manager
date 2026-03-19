"use client";

import * as React from "react";
import { X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LABEL_PRESETS, LABEL_COLORS } from "@/lib/constants";

interface LabelEditorPopoverProps {
  currentLabel?: string;
  currentColor?: string;
  onSave: (label: string | undefined, color: string | undefined) => void;
  children: React.ReactNode;
}

export function LabelEditorPopover({
  currentLabel,
  currentColor,
  onSave,
  children,
}: LabelEditorPopoverProps) {
  const [customLabel, setCustomLabel] = React.useState("");
  const [customColor, setCustomColor] = React.useState<string>(currentColor ?? LABEL_COLORS[0]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Presets
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {LABEL_PRESETS.map((preset) => (
            <button
              key={preset.name}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                "hover:bg-base-200",
                currentLabel === preset.name && "bg-base-200 ring-accent ring-1",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onSave(preset.name, preset.color);
              }}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: preset.color }}
              />
              {preset.name}
            </button>
          ))}
        </div>

        <DropdownMenuSeparator />

        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Custom
        </div>
        <Input
          placeholder="Label name"
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          className="input-sm mb-2 h-8 text-xs"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && customLabel.trim()) {
              onSave(customLabel.trim(), customColor);
              setCustomLabel("");
            }
          }}
        />
        <div className="mb-2 flex items-center gap-1.5">
          {LABEL_COLORS.map((color) => (
            <button
              key={color}
              className={cn(
                "h-5 w-5 rounded-full transition-transform",
                customColor === color && "ring-base-content/50 scale-110 ring-2 ring-offset-1 ring-offset-base-100",
              )}
              style={{ backgroundColor: color }}
              onClick={(e) => {
                e.stopPropagation();
                setCustomColor(color);
              }}
            />
          ))}
        </div>
        <button
          className={cn(
            "btn btn-ghost btn-xs w-full gap-1 text-xs",
            !customLabel.trim() && "btn-disabled opacity-50",
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (customLabel.trim()) {
              onSave(customLabel.trim(), customColor);
              setCustomLabel("");
            }
          }}
        >
          Apply
        </button>

        {currentLabel && (
          <>
            <DropdownMenuSeparator />
            <button
              className="btn btn-ghost btn-xs text-error w-full gap-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onSave(undefined, undefined);
              }}
            >
              <X className="h-3 w-3" />
              Clear label
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
