"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/common/loading-button";
import { InlineAlert } from "@/components/common/inline-alert";
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "sm:max-w-[400px]",
  md: "sm:max-w-[480px]",
  lg: "sm:max-w-[600px]",
  xl: "sm:max-w-[700px]",
} as const;

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  loading: boolean;
  error?: string | null;
  onSubmit: () => void | Promise<void>;
  submitLabel?: string;
  disabled?: boolean;
  size?: keyof typeof sizeClasses;
  /** Extra content in the footer (e.g. a "Test Connection" button) */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Standard form dialog with a consistent structure:
 * DialogHeader → children → InlineAlert(error) → DialogFooter(Cancel + Submit)
 *
 * Handles loading/error display so individual dialogs don't have to duplicate the pattern.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  loading,
  error,
  onSubmit,
  submitLabel = "Save",
  disabled = false,
  size = "md",
  footer,
  children,
  className,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-[95vw]", sizeClasses[size], className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {children}
          <InlineAlert message={error} />
        </div>
        <DialogFooter>
          {footer}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <LoadingButton onClick={onSubmit} loading={loading} disabled={disabled || loading}>
            {submitLabel}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
