"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface MultiValueInputProps {
  value: string[] | undefined;
  onChange: (v: string[] | undefined) => void;
  placeholder?: string;
  addLabel?: string;
  validate?: (v: string) => boolean;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
}

export function MultiValueInput({
  value,
  onChange,
  placeholder = "Enter value",
  addLabel = "Add",
  validate,
  disabled,
  size = "default",
  className,
}: MultiValueInputProps) {
  const items = value ?? [];
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSmall = size === "sm";

  const addItem = () => {
    const v = input.trim();
    if (!v) return;
    if (validate && !validate(v)) {
      setError("Invalid format");
      return;
    }
    setError(null);
    if (!items.includes(v)) {
      onChange([...items, v]);
    }
    setInput("");
  };

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className={cn(isSmall ? "space-y-1.5" : "space-y-2", className)}>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, idx) => (
            <span
              key={item}
              className={cn(
                "bg-base-200 inline-flex items-center gap-1 rounded-md px-2 py-0.5",
                isSmall ? "text-[10px]" : "text-xs",
              )}
            >
              {item}
              <button
                type="button"
                className="text-base-content/60 hover:text-base-content"
                onClick={() => removeItem(idx)}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className={cn("flex items-center", isSmall ? "gap-1.5" : "gap-2")}>
        <Input
          className={cn(isSmall ? "h-7 text-[10px]" : "h-8 text-xs")}
          placeholder={placeholder}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("shrink-0", isSmall ? "h-7 text-[10px]" : "h-8 text-xs")}
          onClick={addItem}
          disabled={disabled || !input.trim()}
        >
          <Plus className={cn("mr-1 h-3 w-3", isSmall && "mr-0.5")} />
          {addLabel}
        </Button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
