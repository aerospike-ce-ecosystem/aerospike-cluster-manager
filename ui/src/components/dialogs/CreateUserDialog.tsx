"use client"

import React from "react"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Checkbox } from "@/components/Checkbox"
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
import { createUser, listRoles } from "@/lib/api/admin"
import { ApiError } from "@/lib/api/client"
import type { AerospikeRole } from "@/lib/types/admin"

interface CreateUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
  clusterId: string
}

interface FormState {
  username: string
  password: string
  confirmPassword: string
  roles: string[]
}

const INITIAL_STATE: FormState = {
  username: "",
  password: "",
  confirmPassword: "",
  roles: [],
}

const MIN_PASSWORD_LENGTH = 8

export function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
  clusterId,
}: CreateUserDialogProps) {
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [usernameError, setUsernameError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [availableRoles, setAvailableRoles] = React.useState<AerospikeRole[]>(
    [],
  )
  const [rolesLoading, setRolesLoading] = React.useState(false)

  const resetForm = React.useCallback(() => {
    setForm(INITIAL_STATE)
    setError(null)
    setUsernameError(null)
  }, [])

  // Lazily load roles whenever the dialog opens.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setRolesLoading(true)
    listRoles(clusterId)
      .then((roles) => {
        if (!cancelled) setAvailableRoles(roles)
      })
      .catch(() => {
        // Roles list is optional; failure is non-fatal for user creation.
        if (!cancelled) setAvailableRoles([])
      })
      .finally(() => {
        if (!cancelled) setRolesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, clusterId])

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm()
    onOpenChange(next)
  }

  const toggleRole = (roleName: string) => {
    setForm((prev) => {
      const has = prev.roles.includes(roleName)
      return {
        ...prev,
        roles: has
          ? prev.roles.filter((r) => r !== roleName)
          : [...prev.roles, roleName],
      }
    })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setUsernameError(null)

    const username = form.username.trim()
    if (!username) {
      setError("Username is required.")
      return
    }
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setIsSubmitting(true)
    try {
      await createUser(clusterId, {
        username,
        password: form.password,
        roles: form.roles.length > 0 ? form.roles : null,
      })
      resetForm()
      onCreated?.()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setUsernameError("User already exists.")
        } else {
          setError(err.detail || err.message)
        }
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Failed to create user.")
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
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>
              Add a new Aerospike user. Requires security to be enabled in
              aerospike.conf.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="user-username">Username</Label>
            <Input
              id="user-username"
              value={form.username}
              onChange={(e) => {
                setUsernameError(null)
                setForm({ ...form, username: e.target.value })
              }}
              placeholder="alice"
              autoFocus
              required
            />
            {usernameError && (
              <span className="text-xs text-red-600 dark:text-red-400">
                {usernameError}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="user-password">Password</Label>
              <Input
                id="user-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={`min ${MIN_PASSWORD_LENGTH} characters`}
                required
                minLength={MIN_PASSWORD_LENGTH}
              />
            </div>
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="user-confirm">Confirm password</Label>
              <Input
                id="user-confirm"
                type="password"
                value={form.confirmPassword}
                onChange={(e) =>
                  setForm({ ...form, confirmPassword: e.target.value })
                }
                placeholder="repeat password"
                required
                minLength={MIN_PASSWORD_LENGTH}
              />
            </div>
          </div>

          <div className="flex flex-col gap-y-1.5">
            <Label>Roles (optional)</Label>
            {rolesLoading ? (
              <span className="text-xs text-gray-500">Loading roles…</span>
            ) : availableRoles.length === 0 ? (
              <span className="text-xs text-gray-500">
                No roles defined. You can grant roles later.
              </span>
            ) : (
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded border border-gray-200 p-2 dark:border-gray-800">
                {availableRoles.map((r) => {
                  const checked = form.roles.includes(r.name)
                  return (
                    <label
                      key={r.name}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleRole(r.name)}
                      />
                      <span className="font-mono text-xs">{r.name}</span>
                    </label>
                  )
                })}
              </div>
            )}
            {form.roles.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {form.roles.map((r) => (
                  <Badge key={r} variant="neutral">
                    {r}
                  </Badge>
                ))}
              </div>
            )}
          </div>

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
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default CreateUserDialog
