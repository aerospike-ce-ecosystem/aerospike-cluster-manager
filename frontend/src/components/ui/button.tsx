import * as React from "react";

import { cn } from "@/lib/utils";

const variantClasses: Record<string, string> = {
  default: "btn-primary",
  destructive: "btn-error",
  outline: "btn-outline",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  link: "btn-link",
  info: "btn-info",
  success: "btn-success",
  warning: "btn-warning",
  neutral: "btn-neutral",
};

const sizeClasses: Record<string, string> = {
  default: "",
  sm: "btn-sm",
  lg: "btn-lg",
  icon: "btn-square",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "info"
    | "success"
    | "warning"
    | "neutral";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === "function") {
        ref(node);
        return;
      }
      (ref as React.MutableRefObject<T | null>).current = node;
    });
  };
}

interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactElement;
}

const Slot = React.forwardRef<HTMLElement, SlotProps>(({ children, className, ...props }, ref) => {
  if (!React.isValidElement(children)) return null;

  const child = children as React.ReactElement<{
    className?: string;
    ref?: React.Ref<HTMLElement>;
  }>;

  return React.cloneElement(child, {
    ...props,
    ...child.props,
    className: cn(className, child.props.className),
    ref: composeRefs(ref, child.props.ref),
  });
});
Slot.displayName = "Slot";

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
  (
    { className, variant = "default", size = "default", asChild = false, children, ...props },
    ref,
  ) => {
    const classes = cn(
      "btn",
      variantClasses[variant],
      sizeClasses[size],
      "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      className,
    );

    if (asChild && React.isValidElement(children)) {
      return (
        <Slot className={classes} ref={ref as React.Ref<HTMLElement>} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button className={classes} ref={ref} type={props.type ?? "button"} {...props}>
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
