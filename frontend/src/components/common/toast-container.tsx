"use client";

import { X } from "lucide-react";
import { useToastStore } from "@/stores/toast-store";

const alertClass: Record<string, string> = {
  success: "alert-success",
  error: "alert-error",
  warning: "alert-warning",
  info: "alert-info",
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast toast-end toast-bottom z-[70]">
      {toasts.map((t) => (
        <div key={t.id} className={`alert ${alertClass[t.type]} animate-fade-in shadow-lg`}>
          <span className="text-sm">{t.message}</span>
          <button
            onClick={() => removeToast(t.id)}
            className="text-muted-foreground hover:bg-base-200 hover:text-base-content inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
