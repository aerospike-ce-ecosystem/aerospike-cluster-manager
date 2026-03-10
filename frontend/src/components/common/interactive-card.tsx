"use client";

import { Card } from "@/components/ui/card";
import { cn, staggerDelay } from "@/lib/utils";

interface InteractiveCardProps {
  /** Index used to calculate staggered animation delay (index * 0.05s) */
  index?: number;
  /** When provided, adds role="button", tabIndex, and keyboard handler */
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * A card that optionally behaves as an accessible interactive button.
 * When `onClick` is provided, adds keyboard navigation (Enter/Space) and ARIA role.
 */
export function InteractiveCard({ index = 0, onClick, className, children }: InteractiveCardProps) {
  const interactive = !!onClick;

  return (
    <Card
      className={cn(
        "group animate-fade-in-up",
        interactive &&
          "hover:border-accent/30 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        className,
      )}
      style={staggerDelay(index)}
      {...(interactive && {
        role: "button",
        tabIndex: 0,
        onClick: (e: React.MouseEvent) => {
          // Ignore clicks originating from dropdown menus or interactive children
          const target = e.target as HTMLElement;
          if (
            target.closest('[role="menu"]') ||
            target.closest('[role="menuitem"]') ||
            target.closest(".dropdown")
          )
            return;
          onClick();
        },
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        },
      })}
    >
      {children}
    </Card>
  );
}
