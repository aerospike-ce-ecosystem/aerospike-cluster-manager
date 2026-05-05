"use client"

import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import type { WorkspaceFormState } from "@/components/dialogs/useWorkspaceForm"

interface WorkspaceFormFieldsProps {
  form: WorkspaceFormState
  setForm: React.Dispatch<React.SetStateAction<WorkspaceFormState>>
  /** Distinguishes input ids when both Add and Edit dialogs render in the same DOM. */
  idPrefix: string
}

const TEXTAREA_CLASSES =
  "block w-full resize-y rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:placeholder-gray-500 dark:focus:ring-indigo-400/20"

export function WorkspaceFormFields({
  form,
  setForm,
  idPrefix,
}: WorkspaceFormFieldsProps) {
  const id = (suffix: string) => `${idPrefix}-${suffix}`

  return (
    <>
      <div className="flex flex-col gap-y-1.5">
        <Label htmlFor={id("name")}>Name</Label>
        <Input
          id={id("name")}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="team-a"
          autoFocus
          required
        />
      </div>

      <div className="flex flex-col gap-y-1.5">
        <Label htmlFor={id("color")}>Color</Label>
        <div className="flex items-center gap-x-3">
          <Input
            id={id("color")}
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="h-9 w-16 cursor-pointer p-1"
          />
          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
            {form.color}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-y-1.5">
        <Label htmlFor={id("description")}>Description</Label>
        <textarea
          id={id("description")}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          placeholder="What's this workspace for?"
          className={TEXTAREA_CLASSES}
        />
      </div>
    </>
  )
}
