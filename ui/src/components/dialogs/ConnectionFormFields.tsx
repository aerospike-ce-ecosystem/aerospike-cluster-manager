"use client"

import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { LabelsEditor } from "@/components/clusters/LabelsEditor"
import type { ConnectionFormState } from "@/components/dialogs/useConnectionForm"

interface ConnectionFormFieldsProps {
  form: ConnectionFormState
  setForm: React.Dispatch<React.SetStateAction<ConnectionFormState>>
  /** Distinguishes input ids when both Add and Edit dialogs render in the same DOM. */
  idPrefix: string
  /** Hide the credential pair (username / password). The Edit dialog skips them. */
  showCredentials?: boolean
}

const TEXTAREA_CLASSES =
  "block w-full resize-y rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:placeholder-gray-500 dark:focus:ring-indigo-400/20"

export function ConnectionFormFields({
  form,
  setForm,
  idPrefix,
  showCredentials = true,
}: ConnectionFormFieldsProps) {
  const id = (suffix: string) => `${idPrefix}-${suffix}`

  return (
    <>
      <div className="flex flex-col gap-y-1.5">
        <Label htmlFor={id("name")}>Name</Label>
        <Input
          id={id("name")}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="my-cluster"
          autoFocus
          required
        />
      </div>

      <div className="flex flex-col gap-y-1.5">
        <Label htmlFor={id("hosts")}>Hosts (comma-separated)</Label>
        <Input
          id={id("hosts")}
          value={form.hosts}
          onChange={(e) => setForm({ ...form, hosts: e.target.value })}
          placeholder="node1.example.com, node2.example.com"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-y-1.5">
          <Label htmlFor={id("port")}>Port</Label>
          <Input
            id={id("port")}
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => setForm({ ...form, port: e.target.value })}
            required
          />
        </div>
        <div className="flex flex-col gap-y-1.5">
          <Label htmlFor={id("color")}>Color</Label>
          <Input
            id={id("color")}
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
        </div>
      </div>

      {showCredentials && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor={id("username")}>Username (optional)</Label>
            <Input
              id={id("username")}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor={id("password")}>Password (optional)</Label>
            <Input
              id={id("password")}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-y-1.5">
        <Label htmlFor={id("description")}>Description (optional)</Label>
        <textarea
          id={id("description")}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          placeholder="Notes about this cluster — purpose, owner, runbook link, …"
          className={TEXTAREA_CLASSES}
        />
      </div>

      <LabelsEditor
        value={form.labels}
        onChange={(labels) => setForm({ ...form, labels })}
        idPrefix={`${idPrefix}-label`}
      />
    </>
  )
}
