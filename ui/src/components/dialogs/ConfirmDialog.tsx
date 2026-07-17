"use client"

import React from "react"

import { Button } from "@/components/Button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/Dialog"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** Label for the destructive action button. Defaults to "Delete". */
  confirmLabel?: string
  /**
   * Invoked after the dialog closes. Long-running work should keep its
   * loading state on the triggering control — this mirrors the
   * ``window.confirm`` flow the dialog replaces.
   */
  onConfirm: () => void
}

/**
 * Confirmation dialog for destructive actions, built on the app's Dialog
 * primitives. Replaces ``window.confirm``, which ignores the app theme and
 * silently returns ``false`` inside sandboxed iframes without
 * ``allow-modals``.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex flex-col gap-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                onOpenChange(false)
                onConfirm()
              }}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ConfirmDialog
