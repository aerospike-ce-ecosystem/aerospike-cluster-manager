import * as React from "react";

import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}

const variantClasses: Record<string, string> = {
  default: "bg-primary/10 text-primary border-primary/20",
  secondary: "bg-base-200 text-base-content/70 border-base-300",
  destructive: "bg-error/10 text-error border-error/20",
  outline: "border-base-300 text-base-content",
};

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
