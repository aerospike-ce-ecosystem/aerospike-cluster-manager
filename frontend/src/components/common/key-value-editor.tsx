"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface KeyValueEditorProps {
  value: Record<string, string> | undefined;
  onChange: (v: Record<string, string> | undefined) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
}

export function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = "key",
  valuePlaceholder = "value",
  addLabel = "Add entry",
  disabled,
  size = "default",
  className,
}: KeyValueEditorProps) {
  const entries = value ? Object.entries(value) : [];
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const isSmall = size === "sm";

  const addEntry = () => {
    const k = newKey.trim();
    const v = newVal.trim();
    if (!k) return;
    onChange({ ...value, [k]: v });
    setNewKey("");
    setNewVal("");
  };

  const removeEntry = (key: string) => {
    if (!value) return;
    const next = { ...value };
    delete next[key];
    onChange(Object.keys(next).length > 0 ? next : undefined);
  };

  return (
    <div className={cn(isSmall ? "space-y-1.5" : "space-y-2", className)}>
      {entries.map(([k, v]) => (
        <div key={k} className={cn("flex items-center", isSmall ? "gap-1.5" : "gap-2")}>
          <code
            className={cn(
              "bg-base-200 truncate rounded",
              isSmall ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
            )}
          >
            {k}
          </code>
          <span className={cn("text-base-content/60", isSmall ? "text-[10px]" : "text-xs")}>=</span>
          <code
            className={cn(
              "bg-base-200 flex-1 truncate rounded",
              isSmall ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
            )}
          >
            {v}
          </code>
          {isSmall ? (
            <button
              type="button"
              className="text-base-content/60 hover:text-base-content shrink-0"
              onClick={() => removeEntry(k)}
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => removeEntry(k)}
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
      <div className={cn("flex items-center", isSmall ? "gap-1.5" : "gap-2")}>
        <Input
          className={cn(isSmall ? "h-7 text-[10px]" : "h-8 text-xs")}
          placeholder={keyPlaceholder}
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEntry())}
          disabled={disabled}
        />
        <Input
          className={cn(isSmall ? "h-7 text-[10px]" : "h-8 text-xs")}
          placeholder={valuePlaceholder}
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEntry())}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("shrink-0", isSmall ? "h-7 text-[10px]" : "h-8 text-xs")}
          onClick={addEntry}
          disabled={disabled || !newKey.trim()}
        >
          <Plus className={cn("mr-1 h-3 w-3", isSmall && "mr-0.5")} />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
