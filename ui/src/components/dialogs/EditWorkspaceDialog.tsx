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
import {
  fromWorkspace,
  useWorkspaceForm,
} from "@/components/dialogs/useWorkspaceForm"
import { ApiError } from "@/lib/api/client"
import { deleteWorkspace, updateWorkspace } from "@/lib/api/workspaces"
import type { WorkspaceResponse } from "@/lib/types/workspace"

interface EditWorkspaceDialogProps {
  workspace: WorkspaceResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (ws: WorkspaceResponse) => void
  onDeleted?: (id: string) => void
}

export function EditWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: EditWorkspaceDialogProps) {
  const { form, setForm, validate, hydrate } = useWorkspaceForm()
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  // Re-hydrate the form whenever a different workspace is opened.
  React.useEffect(() => {
    if (workspace) {
      hydrate(fromWorkspace(workspace))
      setError(null)
    }
  }, [workspace, hydrate])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setError(null)
    }
    onOpenChange(next)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!workspace) return
    setError(null)

    const result = validate()
    if (!result.ok) {
      setError(result.error)
      return
    }

    setIsSubmitting(true)
    try {
      const saved = await updateWorkspace(workspace.id, result.payload)
      onSaved?.(saved)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Failed to update workspace.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!workspace) return
    if (workspace.isDefault) return
    setError(null)
    setIsDeleting(true)
    try {
      await deleteWorkspace(workspace.id)
      onDeleted?.(workspace.id)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Failed to delete workspace.")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  if (!workspace) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
          <DialogHeader>
            <DialogTitle>Edit workspace</DialogTitle>
            <DialogDescription>
              {workspace.isDefault
                ? "The built-in default workspace can be renamed but not deleted."
                : "Update name, color, or description."}
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
            idPrefix="ws-edit"
          />

          <DialogFooter className="sm:justify-between">
            {!workspace.isDefault ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting || isDeleting}
                isLoading={isDeleting}
                loadingText="Deleting..."
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-x-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting || isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={isSubmitting}
                loadingText="Saving..."
                disabled={isDeleting}
              >
                Save
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default EditWorkspaceDialog
