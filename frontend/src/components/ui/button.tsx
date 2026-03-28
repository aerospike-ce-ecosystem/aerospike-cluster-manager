import * as React from "react";

import { cn } from "@/lib/utils";

const variantClasses: Record<string, string> = {
  default: "bg-primary text-primary-content hover:bg-primary/90 shadow-sm",
  destructive: "bg-error text-error-content hover:bg-error/90 shadow-sm",
  outline: "border border-base-300 bg-base-100 text-base-content hover:bg-base-200 shadow-sm",
  secondary: "bg-secondary text-secondary-content hover:bg-secondary/90 shadow-sm",
  ghost: "text-base-content hover:bg-base-200",
  link: "text-primary underline-offset-4 hover:underline",
  info: "bg-info text-info-content hover:bg-info/90 shadow-sm",
  success: "bg-success text-success-content hover:bg-success/90 shadow-sm",
  warning: "bg-warning text-warning-content hover:bg-warning/90 shadow-sm",
  neutral: "bg-neutral text-neutral-content hover:bg-neutral/90 shadow-sm",
};

const sizeClasses: Record<string, string> = {
  default: "h-10 px-4 py-2 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10 p-0",
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
} = {}) =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50",
    variantClasses[variant] || "",
    sizeClasses[size] || "",
    className,
  );

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size = "default", asChild = false, children, ...props },
    ref,
  ) => {
    const classes = cn(
      "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50",
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
