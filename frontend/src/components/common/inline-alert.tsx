import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertVariant = "error" | "warning" | "info";

interface InlineAlertProps {
  message: string | null | undefined;
  variant?: AlertVariant;
  className?: string;
}

const variantStyles: Record<AlertVariant, string> = {
  error: "border-destructive/30 bg-destructive/5 text-destructive",
  warning: "border-warning/30 bg-warning/5 text-warning",
  info: "border-accent/30 bg-accent/5 text-accent",
};

const variantIcons: Record<AlertVariant, React.ElementType> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export function InlineAlert({ message, variant = "error", className }: InlineAlertProps) {
  if (!message) return null;

  const Icon = variantIcons[variant];

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "animate-fade-in flex items-start gap-2 rounded-lg border p-3 text-sm",
        variantStyles[variant],
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
