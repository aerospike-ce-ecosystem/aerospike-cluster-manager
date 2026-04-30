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
  DEFAULT_ENV_VALUE,
  ENV_LABEL_KEY,
  type LabelEntry,
  LabelsEditor,
  entriesToLabels,
} from "@/components/clusters/LabelsEditor"
import { ApiError } from "@/lib/api/client"
import { createConnection } from "@/lib/api/connections"

interface AddConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface FormState {
  name: string
  hosts: string
  port: string
  username: string
  password: string
  color: string
  description: string
  labels: LabelEntry[]
}

const INITIAL_STATE: FormState = {
  name: "",
  hosts: "",
  port: "3000",
  username: "",
  password: "",
  color: "#4F46E5",
  description: "",
  labels: [{ key: ENV_LABEL_KEY, value: DEFAULT_ENV_VALUE }],
}

export function AddConnectionDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddConnectionDialogProps) {
  const [form, setForm] = React.useState(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const resetForm = () => {
    setForm(INITIAL_STATE)
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm()
    onOpenChange(next)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
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
      await createConnection({
        name,
        hosts: hostList,
        port: portNum,
        username: form.username.trim() || null,
        password: form.password ? form.password : null,
        color: form.color || "#4F46E5",
        description: form.description.trim() || null,
        labels: entriesToLabels(form.labels),
      })
      resetForm()
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Failed to create connection.")
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
            <DialogTitle>Add connection</DialogTitle>
            <DialogDescription>
              Register a new Aerospike cluster connection profile.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="conn-name">Name</Label>
            <Input
              id="conn-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="my-cluster"
              autoFocus
              required
            />
          </div>

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="conn-hosts">Hosts (comma-separated)</Label>
            <Input
              id="conn-hosts"
              value={form.hosts}
              onChange={(e) => setForm({ ...form, hosts: e.target.value })}
              placeholder="node1.example.com, node2.example.com"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="conn-port">Port</Label>
              <Input
                id="conn-port"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="conn-color">Color</Label>
              <Input
                id="conn-color"
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="conn-username">Username (optional)</Label>
              <Input
                id="conn-username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="conn-password">Password (optional)</Label>
              <Input
                id="conn-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="conn-description">Description (optional)</Label>
            <textarea
              id="conn-description"
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
            idPrefix="conn-label"
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
              loadingText="Creating..."
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default AddConnectionDialog
