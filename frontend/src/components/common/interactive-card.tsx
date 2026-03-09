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
        interactive && "card-interactive hover:border-accent/30 cursor-pointer",
        className,
      )}
      style={staggerDelay(index)}
      {...(interactive && {
        role: "button",
        tabIndex: 0,
        onClick,
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
