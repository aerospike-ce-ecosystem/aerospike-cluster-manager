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
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import {
  ENV_LABEL_KEY,
  type LabelEntry,
  LabelsEditor,
  entriesToLabels,
  labelsToEntries,
} from "@/components/clusters/LabelsEditor"
import { ApiError } from "@/lib/api/client"
import { updateConnection } from "@/lib/api/connections"
import type { ConnectionProfileResponse } from "@/lib/types/connection"

interface EditConnectionDialogProps {
  open: boolean
  connection: ConnectionProfileResponse | null
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface FormState {
  name: string
  hosts: string
  port: string
  color: string
  description: string
  labels: LabelEntry[]
}

const EMPTY_FORM: FormState = {
  name: "",
  hosts: "",
  port: "3000",
  color: "#4F46E5",
  description: "",
  labels: [{ key: ENV_LABEL_KEY, value: "default" }],
}

function fromConnection(conn: ConnectionProfileResponse): FormState {
  return {
    name: conn.name,
    hosts: conn.hosts.join(", "),
    port: String(conn.port),
    color: conn.color,
    description: conn.description ?? "",
    labels: labelsToEntries(conn.labels ?? {}),
  }
}

export function EditConnectionDialog({
  open,
  connection,
  onOpenChange,
  onSuccess,
}: EditConnectionDialogProps) {
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open && connection) {
      setForm(fromConnection(connection))
      setError(null)
    }
  }, [open, connection])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setError(null)
    }
    onOpenChange(next)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!connection) return
    setError(null)

    const name = form.name.trim()
    if (!name) {
      setError("Name is required.")
      return
    }

    const hostList = form.hosts
      .split(",")
      .map((h) => h.trim())
      .filter((h) => h.length > 0)
    if (hostList.length === 0) {
      setError("At least one host is required.")
      return
    }

    const portNum = Number.parseInt(form.port, 10)
    if (!Number.isFinite(portNum) || portNum <= 0 || portNum > 65535) {
      setError("Port must be a number between 1 and 65535.")
      return
    }

    setIsSubmitting(true)
    try {
      await updateConnection(connection.id, {
        name,
        hosts: hostList,
        port: portNum,
        color: form.color || "#4F46E5",
        description: form.description.trim() || null,
        labels: entriesToLabels(form.labels),
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

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="edit-conn-name">Name</Label>
            <Input
              id="edit-conn-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="edit-conn-hosts">Hosts (comma-separated)</Label>
            <Input
              id="edit-conn-hosts"
              value={form.hosts}
              onChange={(e) => setForm({ ...form, hosts: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="edit-conn-port">Port</Label>
              <Input
                id="edit-conn-port"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="edit-conn-color">Color</Label>
              <Input
                id="edit-conn-color"
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="edit-conn-description">
              Description (optional)
            </Label>
            <textarea
              id="edit-conn-description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={3}
              placeholder="Notes about this cluster — purpose, owner, runbook link, …"
              className="block w-full resize-y rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:placeholder-gray-500 dark:focus:ring-indigo-400/20"
            />
          </div>

          <LabelsEditor
            value={form.labels}
            onChange={(labels) => setForm({ ...form, labels })}
            idPrefix="edit-conn-label"
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
