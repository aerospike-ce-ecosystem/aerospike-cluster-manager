import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertVariant = "error" | "warning" | "info";

interface InlineAlertProps {
  message: string | null | undefined;
  variant?: AlertVariant;
  className?: string;
}

const variantStyles: Record<AlertVariant, string> = {
  error: "alert-error",
  warning: "alert-warning",
  info: "alert-info",
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
      className={cn("alert animate-fade-in text-sm", variantStyles[variant], className)}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
