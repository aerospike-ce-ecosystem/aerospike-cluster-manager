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

interface PrivilegeRow {
  code: string
  ns: string
  set: string
}

interface FormState {
  name: string
  privileges: PrivilegeRow[]
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
 * and with ``api/src/aerospike_cluster_manager_api/routers/_admin_utils.py``
 * (PRIVILEGE_NAME_TO_CODE) when new privileges are added.
 */
const PRIVILEGE_CATALOG: ReadonlyArray<{ code: string; description: string }> =
  [
    { code: "read", description: "Read records" },
    { code: "read-write", description: "Read and write records" },
    { code: "read-write-udf", description: "Read/write + execute UDFs" },
    { code: "write", description: "Write records" },
    { code: "data-admin", description: "Manage data (UDF, sindex)" },
    { code: "udf-admin", description: "Manage UDF modules" },
    { code: "sindex-admin", description: "Manage secondary indexes" },
    { code: "sys-admin", description: "Server configuration" },
    { code: "user-admin", description: "Manage users and roles" },
    { code: "truncate", description: "Truncate sets" },
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
      const has = prev.privileges.some((p) => p.code === code)
      return {
        ...prev,
        privileges: has
          ? prev.privileges.filter((p) => p.code !== code)
          : [...prev.privileges, { code, ns: "", set: "" }],
      }
    })
  }

  const updatePrivilegeScope = (
    code: string,
    field: "ns" | "set",
    value: string,
  ) => {
    setForm((prev) => ({
      ...prev,
      privileges: prev.privileges.map((p) =>
        p.code === code ? { ...p, [field]: value } : p,
      ),
    }))
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

    // Reject set scoping without a namespace — Aerospike requires the
    // namespace to be set whenever a set is specified.
    for (const p of form.privileges) {
      if (p.set.trim() && !p.ns.trim()) {
        setError(
          `Privilege "${p.code}" specifies a set but no namespace; provide both.`,
        )
        return
      }
    }

    const whitelist = form.whitelist
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    // Aerospike quotas are integer TPS values; reject decimals/whitespace
    // outright rather than silently truncating via Number(). parseInt with
    // radix 10 stops at the first non-digit, so we additionally guard against
    // inputs like "10.5" or "10abc" by requiring an exact digits-only match.
    const readQuotaValue = form.readQuota.trim()
    const writeQuotaValue = form.writeQuota.trim()
    const INT_RE = /^\d+$/

    let readQuota: number | null = null
    if (readQuotaValue) {
      if (!INT_RE.test(readQuotaValue)) {
        setError("Read quota must be a non-negative integer (no decimals).")
        return
      }
      const parsed = parseInt(readQuotaValue, 10)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Read quota must be a non-negative integer.")
        return
      }
      readQuota = parsed
    }

    let writeQuota: number | null = null
    if (writeQuotaValue) {
      if (!INT_RE.test(writeQuotaValue)) {
        setError("Write quota must be a non-negative integer (no decimals).")
        return
      }
      const parsed = parseInt(writeQuotaValue, 10)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Write quota must be a non-negative integer.")
        return
      }
      writeQuota = parsed
    }

    const privileges: Privilege[] = form.privileges.map((p) => {
      const ns = p.ns.trim()
      const set = p.set.trim()
      return {
        code: p.code,
        namespace: ns ? ns : null,
        set: set ? set : null,
      }
    })

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
            <div
              role="alert"
              aria-live="polite"
              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
            >
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
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "role-name-error" : undefined}
            />
            {nameError && (
              <span
                id="role-name-error"
                className="text-xs text-red-600 dark:text-red-400"
              >
                {nameError}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-y-1.5">
            <Label>Privileges</Label>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded border border-gray-200 p-2 dark:border-gray-800">
              {PRIVILEGE_CATALOG.map((p) => {
                const selected = form.privileges.find(
                  (row) => row.code === p.code,
                )
                const checked = !!selected
                return (
                  <div
                    key={p.code}
                    className="flex flex-col gap-1 rounded px-1 py-0.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <label className="flex cursor-pointer items-start gap-2">
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
                    {checked && selected && (
                      <div className="mt-1 ml-6 grid grid-cols-2 gap-2">
                        <Input
                          aria-label={`${p.code} namespace scope`}
                          value={selected.ns}
                          onChange={(e) =>
                            updatePrivilegeScope(p.code, "ns", e.target.value)
                          }
                          placeholder="namespace (optional)"
                        />
                        <Input
                          aria-label={`${p.code} set scope`}
                          value={selected.set}
                          onChange={(e) =>
                            updatePrivilegeScope(p.code, "set", e.target.value)
                          }
                          placeholder="set (optional)"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {form.privileges.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {form.privileges.map((row) => {
                  const scope = row.ns
                    ? row.set
                      ? ` (${row.ns}:${row.set})`
                      : ` (${row.ns})`
                    : ""
                  return (
                    <Badge key={row.code} variant="neutral">
                      {row.code}
                      {scope}
                    </Badge>
                  )
                })}
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
