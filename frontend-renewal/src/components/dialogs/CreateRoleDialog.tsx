"use client"

import React from "react"

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
import { ApiError } from "@/lib/api/client"
import type { CreateRoleRequest, Privilege } from "@/lib/types/admin"

const AVAILABLE_PRIVILEGES = [
  "read",
  "write",
  "read-write",
  "read-write-udf",
  "sys-admin",
  "user-admin",
  "data-admin",
]

interface CreateRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (body: CreateRoleRequest) => Promise<void>
}

export function CreateRoleDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateRoleDialogProps) {
  const [name, setName] = React.useState("")
  const [privileges, setPrivileges] = React.useState<string[]>([])
  const [whitelist, setWhitelist] = React.useState("")
  const [readQuota, setReadQuota] = React.useState("0")
  const [writeQuota, setWriteQuota] = React.useState("0")
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const reset = React.useCallback(() => {
    setName("")
    setPrivileges([])
    setWhitelist("")
    setReadQuota("0")
    setWriteQuota("0")
    setError(null)
    setSubmitting(false)
  }, [])

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const togglePriv = (code: string) =>
    setPrivileges((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code],
    )

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const roleName = name.trim()
    if (!roleName) {
      setError("Role name is required.")
      return
    }

    const privs: Privilege[] = privileges.map((code) => ({ code }))
    const whitelistArr = whitelist
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    setSubmitting(true)
    try {
      await onSubmit({
        name: roleName,
        privileges: privs,
        whitelist: whitelistArr.length > 0 ? whitelistArr : null,
        readQuota: Number.parseInt(readQuota, 10) || 0,
        writeQuota: Number.parseInt(writeQuota, 10) || 0,
      })
      reset()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail || err.message)
      else if (err instanceof Error) setError(err.message)
      else setError("Failed to create role.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
          <DialogHeader>
            <DialogTitle>Create role</DialogTitle>
            <DialogDescription>
              Define a role and its privileges. Whitelist and quotas are
              optional.
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="role name"
              autoFocus
              required
            />
          </div>

          <div className="flex flex-col gap-y-1.5">
            <Label>Privileges</Label>
            <div className="max-h-48 space-y-2 overflow-auto rounded-md border border-gray-200 p-3 dark:border-gray-800">
              {AVAILABLE_PRIVILEGES.map((code) => (
                <div key={code} className="flex items-center gap-2">
                  <Checkbox
                    id={`rpriv-${code}`}
                    checked={privileges.includes(code)}
                    onCheckedChange={() => togglePriv(code)}
                  />
                  <Label
                    htmlFor={`rpriv-${code}`}
                    className="cursor-pointer text-sm font-normal"
                  >
                    {code}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="role-whitelist">
              Whitelist (comma-separated IPs)
            </Label>
            <Input
              id="role-whitelist"
              value={whitelist}
              onChange={(e) => setWhitelist(e.target.value)}
              placeholder="10.0.0.0/24, 127.0.0.1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="role-rquota">Read quota (TPS)</Label>
              <Input
                id="role-rquota"
                type="number"
                min={0}
                value={readQuota}
                onChange={(e) => setReadQuota(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="role-wquota">Write quota (TPS)</Label>
              <Input
                id="role-wquota"
                type="number"
                min={0}
                value={writeQuota}
                onChange={(e) => setWriteQuota(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={submitting}
              loadingText="Creating..."
              disabled={submitting || !name.trim()}
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
