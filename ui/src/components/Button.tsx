// Tremor Raw Button [v0.1.1] — adapted to the ACM primary-* design tokens.

import { Slot } from "@radix-ui/react-slot"
import { RiLoader2Fill } from "@remixicon/react"
import React from "react"
import { tv, type VariantProps } from "tailwind-variants"

import { cx, focusRing } from "@/lib/utils"

const buttonVariants = tv({
  base: [
    // base
    "relative inline-flex items-center justify-center whitespace-nowrap rounded-md border px-3 py-2 text-center text-sm font-medium shadow-sm transition-all duration-100 ease-in-out",
    // disabled
    "disabled:pointer-events-none disabled:shadow-none",
    // focus
    focusRing,
  ],
  variants: {
    variant: {
      primary: [
        "border-transparent text-white",
        "bg-primary-50 hover:bg-primary-45",
        "disabled:bg-primary-95 disabled:text-on-surface-disabled",
      ],
      secondary: [
        "border-border bg-surface text-on-surface",
        "hover:bg-surface-container-low",
        "disabled:text-on-surface-disabled",
      ],
      light: [
        "border-transparent shadow-none",
        "bg-surface-container text-on-surface",
        "hover:bg-surface-container-high",
        "disabled:bg-surface-container-low disabled:text-on-surface-disabled",
      ],
      ghost: [
        "border-transparent shadow-none",
        "bg-transparent text-on-surface",
        "hover:bg-surface-container-low",
        "disabled:text-on-surface-disabled",
      ],
      destructive: [
        "border-transparent text-white",
        "bg-error-50 hover:bg-error-45",
        "disabled:bg-error-30 disabled:text-white",
      ],
    },
  },
  defaultVariants: {
    variant: "primary",
  },
})

interface ButtonProps
  extends
    React.ComponentPropsWithoutRef<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  isLoading?: boolean
  loadingText?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild,
      isLoading = false,
      loadingText,
      className,
      disabled,
      variant,
      children,
      ...props
    }: ButtonProps,
    forwardedRef,
  ) => {
    const Component = asChild ? Slot : "button"
    return (
      <Component
        ref={forwardedRef}
        className={cx(buttonVariants({ variant }), className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="pointer-events-none flex shrink-0 items-center justify-center gap-1.5">
            <RiLoader2Fill
              className="size-4 shrink-0 animate-spin"
              aria-hidden="true"
            />
            <span className="sr-only">
              {loadingText ? loadingText : "Loading"}
            </span>
            {loadingText ? loadingText : children}
          </span>
        ) : (
          children
        )}
      </Component>
    )
  },
)

Button.displayName = "Button"

export { Button, buttonVariants, type ButtonProps }
