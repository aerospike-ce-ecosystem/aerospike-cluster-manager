// Tremor Raw Tooltip [v0.0.1]

"use client"

import * as TooltipPrimitives from "@radix-ui/react-tooltip"
import React from "react"

import { cx } from "@/lib/utils"

interface TooltipProps
  extends
    Omit<TooltipPrimitives.TooltipContentProps, "content" | "onClick">,
    Pick<
      TooltipPrimitives.TooltipProps,
      "open" | "defaultOpen" | "onOpenChange" | "delayDuration"
    > {
  content: React.ReactNode
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  side?: "bottom" | "left" | "top" | "right"
  showArrow?: boolean
  triggerAsChild?: boolean
}

const Tooltip = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitives.Content>,
  TooltipProps
>(
  (
    {
      children,
      className,
      content,
      delayDuration,
      defaultOpen,
      open,
      onClick,
      onOpenChange,
      showArrow = true,
      side,
      sideOffset = 10,
      triggerAsChild = false,
      ...props
    }: TooltipProps,
    forwardedRef,
  ) => {
    return (
      <TooltipPrimitives.Provider delayDuration={150}>
        <TooltipPrimitives.Root
          open={open}
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
          delayDuration={delayDuration}
        >
          <TooltipPrimitives.Trigger onClick={onClick} asChild={triggerAsChild}>
            {children}
          </TooltipPrimitives.Trigger>
          <TooltipPrimitives.Portal>
            <TooltipPrimitives.Content
              ref={forwardedRef}
              side={side}
              sideOffset={sideOffset}
              align="center"
              className={cx(
                // base — refined card-like surface (lifted, light background)
                "z-50 max-w-md select-none rounded-lg px-3 py-2 text-xs leading-relaxed",
                // typography
                "font-medium text-gray-700 dark:text-gray-200",
                // surface — white card in light, near-black in dark, with hairline border + ring + soft layered shadow
                "border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900",
                "ring-1 ring-black/[0.04] dark:ring-white/[0.04]",
                "shadow-[0_10px_30px_-10px_rgba(15,23,42,0.18),0_4px_6px_-4px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6),0_4px_6px_-4px_rgba(0,0,0,0.4)]",
                // transition
                "will-change-[transform,opacity]",
                "data-[side=bottom]:animate-slideDownAndFade data-[side=left]:animate-slideLeftAndFade data-[side=right]:animate-slideRightAndFade data-[side=top]:animate-slideUpAndFade data-[state=closed]:animate-hide",
                className,
              )}
              {...props}
            >
              {content}
              {showArrow ? (
                <TooltipPrimitives.Arrow
                  className="fill-white drop-shadow-[0_1px_0_rgb(229_231_235)] dark:fill-gray-900 dark:drop-shadow-[0_1px_0_rgb(31_41_55)]"
                  width={12}
                  height={6}
                  aria-hidden="true"
                />
              ) : null}
            </TooltipPrimitives.Content>
          </TooltipPrimitives.Portal>
        </TooltipPrimitives.Root>
      </TooltipPrimitives.Provider>
    )
  },
)

Tooltip.displayName = "Tooltip"

export { Tooltip, type TooltipProps }
