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
import { WorkspaceFormFields } from "@/components/dialogs/WorkspaceFormFields"
import { useWorkspaceForm } from "@/components/dialogs/useWorkspaceForm"
import { ApiError } from "@/lib/api/client"
import { createWorkspace } from "@/lib/api/workspaces"
import type { WorkspaceResponse } from "@/lib/types/workspace"

interface AddWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (ws: WorkspaceResponse) => void
}

export function AddWorkspaceDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddWorkspaceDialogProps) {
  const { form, setForm, validate, reset } = useWorkspaceForm()
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset()
      setError(null)
    }
    onOpenChange(next)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const result = validate()
    if (!result.ok) {
      setError(result.error)
      return
    }

    setIsSubmitting(true)
    try {
      const created = await createWorkspace(result.payload)
      reset()
      onSuccess?.(created)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Failed to create workspace.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
          <DialogHeader>
            <DialogTitle>Add workspace</DialogTitle>
            <DialogDescription>
              Group Aerospike clusters managed by your team into a workspace.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <WorkspaceFormFields
            form={form}
            setForm={setForm}
            idPrefix="ws-add"
          />

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Go back
            </Button>
            <Button
              type="submit"
              isLoading={isSubmitting}
              loadingText="Creating..."
            >
              Add workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default AddWorkspaceDialog
