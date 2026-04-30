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
import { ConnectionFormFields } from "@/components/dialogs/ConnectionFormFields"
import {
  fromConnection,
  useConnectionForm,
} from "@/components/dialogs/useConnectionForm"
import { ApiError } from "@/lib/api/client"
import { updateConnection } from "@/lib/api/connections"
import type { ConnectionProfileResponse } from "@/lib/types/connection"

interface EditConnectionDialogProps {
  open: boolean
  connection: ConnectionProfileResponse | null
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function EditConnectionDialog({
  open,
  connection,
  onOpenChange,
  onSuccess,
}: EditConnectionDialogProps) {
  const { form, setForm, validate, hydrate } = useConnectionForm()
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open && connection) {
      hydrate(fromConnection(connection))
      setError(null)
    }
    // Depend on connection.id only — re-fetched profiles produce new object
    // references but represent the same record, and we don't want to clobber
    // the user's in-flight edits when an unrelated refetch happens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connection?.id])

  const handleOpenChange = (next: boolean) => {
    if (!next) setError(null)
    onOpenChange(next)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!connection) return
    setError(null)

    const result = validate()
    if (!result.ok) {
      setError(result.error)
      return
    }

    setIsSubmitting(true)
    try {
      // Edit dialog doesn't expose credential editing; only push the fields it
      // actually edits to avoid clobbering an existing username/password.
      await updateConnection(connection.id, {
        name: result.payload.name,
        hosts: result.payload.hosts,
        port: result.payload.port,
        color: result.payload.color,
        description: result.payload.description,
        labels: result.payload.labels,
      })
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Failed to update connection.")
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
            <DialogTitle>Edit connection</DialogTitle>
            <DialogDescription>
              Update connection details and labels for grouping in the cluster
              list.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <ConnectionFormFields
            form={form}
            setForm={setForm}
            idPrefix="edit-conn"
            showCredentials={false}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isSubmitting}
              loadingText="Saving..."
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default EditConnectionDialog
