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
import { createRole } from "@/lib/api/admin"
import { ApiError } from "@/lib/api/client"
import type { CreateRoleRequest, Privilege } from "@/lib/types/admin"

interface CreateRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
  clusterId: string
}

interface FormState {
  name: string
  privileges: string[] // privilege codes
  whitelist: string
  readQuota: string
  writeQuota: string
}

const INITIAL_STATE: FormState = {
  name: "",
  privileges: [],
  whitelist: "",
  readQuota: "",
  writeQuota: "",
}

/**
 * Static catalogue of Aerospike privilege codes.
 *
 * The aerospike-py admin protocol does not currently expose a privileges
 * catalogue endpoint, so we mirror the canonical set documented at
 * https://aerospike.com/docs/server/operations/configure/security/access-control
 *
 * Keep this in sync with the backend (server/aerospike-core ResultCode etc.)
 * when new privileges are added.
 */
const PRIVILEGE_CATALOG: ReadonlyArray<{ code: string; description: string }> =
  [
    { code: "user-admin", description: "Manage users and roles" },
    { code: "sys-admin", description: "Server configuration" },
    { code: "data-admin", description: "Manage data (UDF, sindex)" },
    { code: "udf-admin", description: "Manage UDFs" },
    { code: "sindex-admin", description: "Manage secondary indexes" },
    { code: "truncate", description: "Truncate sets" },
    { code: "read", description: "Read records" },
    { code: "read-write", description: "Read and write records" },
    { code: "read-write-udf", description: "Read/write + execute UDFs" },
    { code: "write", description: "Write records" },
  ]

export function CreateRoleDialog({
  open,
  onOpenChange,
  onCreated,
  clusterId,
}: CreateRoleDialogProps) {
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE)
  const [error, setError] = React.useState<string | null>(null)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const resetForm = React.useCallback(() => {
    setForm(INITIAL_STATE)
    setError(null)
    setNameError(null)
  }, [])

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm()
    onOpenChange(next)
  }

  const togglePrivilege = (code: string) => {
    setForm((prev) => {
      const has = prev.privileges.includes(code)
      return {
        ...prev,
        privileges: has
          ? prev.privileges.filter((p) => p !== code)
          : [...prev.privileges, code],
      }
    })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNameError(null)

    const name = form.name.trim()
    if (!name) {
      setError("Role name is required.")
      return
    }
    if (form.privileges.length === 0) {
      setError("Select at least one privilege.")
      return
    }

    const whitelist = form.whitelist
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    const readQuotaValue = form.readQuota.trim()
    const writeQuotaValue = form.writeQuota.trim()
    const readQuota = readQuotaValue ? Number(readQuotaValue) : null
    const writeQuota = writeQuotaValue ? Number(writeQuotaValue) : null

    if (readQuota !== null && (!Number.isFinite(readQuota) || readQuota < 0)) {
      setError("Read quota must be a non-negative number.")
      return
    }
    if (
      writeQuota !== null &&
      (!Number.isFinite(writeQuota) || writeQuota < 0)
    ) {
      setError("Write quota must be a non-negative number.")
      return
    }

    const privileges: Privilege[] = form.privileges.map((code) => ({ code }))

    const body: CreateRoleRequest = {
      name,
      privileges,
      whitelist: whitelist.length > 0 ? whitelist : null,
      readQuota,
      writeQuota,
    }

    setIsSubmitting(true)
    try {
      await createRole(clusterId, body)
      resetForm()
      onCreated?.()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setNameError("Role already exists.")
        } else {
          setError(err.detail || err.message)
        }
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Failed to create role.")
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
            <DialogTitle>Create role</DialogTitle>
            <DialogDescription>
              Define a new Aerospike role with one or more privileges.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="role-name">Role name</Label>
            <Input
              id="role-name"
              value={form.name}
              onChange={(e) => {
                setNameError(null)
                setForm({ ...form, name: e.target.value })
              }}
              placeholder="analytics_reader"
              autoFocus
              required
            />
            {nameError && (
              <span className="text-xs text-red-600 dark:text-red-400">
                {nameError}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-y-1.5">
            <Label>Privileges</Label>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded border border-gray-200 p-2 dark:border-gray-800">
              {PRIVILEGE_CATALOG.map((p) => {
                const checked = form.privileges.includes(p.code)
                return (
                  <label
                    key={p.code}
                    className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => togglePrivilege(p.code)}
                      className="mt-0.5"
                    />
                    <span className="flex flex-col">
                      <span className="font-mono text-xs font-medium text-gray-900 dark:text-gray-50">
                        {p.code}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {p.description}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
            {form.privileges.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {form.privileges.map((code) => (
                  <Badge key={code} variant="neutral">
                    {code}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="role-whitelist">
              Whitelisted IPs <span className="text-gray-500">(optional)</span>
            </Label>
            <Input
              id="role-whitelist"
              value={form.whitelist}
              onChange={(e) => setForm({ ...form, whitelist: e.target.value })}
              placeholder="10.0.0.1, 10.0.0.2"
            />
            <span className="text-xs text-gray-500">
              Comma-separated. Leave blank to allow all IPs.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="role-read-quota">
                Read quota{" "}
                <span className="text-gray-500">(TPS, optional)</span>
              </Label>
              <Input
                id="role-read-quota"
                type="number"
                min={0}
                value={form.readQuota}
                onChange={(e) =>
                  setForm({ ...form, readQuota: e.target.value })
                }
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="role-write-quota">
                Write quota{" "}
                <span className="text-gray-500">(TPS, optional)</span>
              </Label>
              <Input
                id="role-write-quota"
                type="number"
                min={0}
                value={form.writeQuota}
                onChange={(e) =>
                  setForm({ ...form, writeQuota: e.target.value })
                }
                placeholder="0"
              />
            </div>
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
              Create role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default CreateRoleDialog
