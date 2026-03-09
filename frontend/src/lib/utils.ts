import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CSSProperties } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "An unknown error occurred";
}

/**
 * Returns an inline style object for staggered animation delay.
 * @param index - item index (0-based)
 * @param step  - delay per index in seconds (default 0.05s)
 */
export function staggerDelay(index: number, step = 0.05): CSSProperties {
  return { animationDelay: `${index * step}s`, animationFillMode: "backwards" };
}
