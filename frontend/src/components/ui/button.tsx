import * as React from "react";

import { cn } from "@/lib/utils";

const variantClasses: Record<string, string> = {
  default: "btn-primary",
  destructive: "btn-error",
  outline: "btn-outline",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  link: "btn-link",
};

const sizeClasses: Record<string, string> = {
  default: "",
  sm: "btn-sm",
  lg: "btn-lg",
  icon: "btn-square",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

const buttonVariants = ({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: string;
  size?: string;
  className?: string;
} = {}) => cn("btn", variantClasses[variant] || "", sizeClasses[size] || "", className);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "btn",
          variantClasses[variant],
          sizeClasses[size],
          variant === "default" && "btn-glow",
          "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
