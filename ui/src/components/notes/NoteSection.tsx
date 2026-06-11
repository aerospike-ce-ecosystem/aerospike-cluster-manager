"use client"

import React from "react"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Label } from "@/components/Label"
import { ApiError } from "@/lib/api/client"

const MAX_NOTE_LENGTH = 8192

// Same Tailwind class set as ConnectionFormFields' textarea — keeps the
// indigo focus ring consistent with other multi-line inputs in the app.
const TEXTAREA_CLASSES =
  "block w-full resize-y rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-hidden transition focus:border-primary-45 focus:ring-2 focus:ring-primary-90 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:placeholder-gray-500 dark:focus:ring-primary-65/20 disabled:cursor-not-allowed disabled:opacity-50"

interface NoteSectionProps {
  title: string
  /** Current persisted note. ``null`` / empty string ⇒ no note attached. */
  note: string | null | undefined
  /** Persist a non-empty note. Throws if called with an empty/whitespace value. */
  onSave: (next: string) => Promise<void>
  /** Remove the persisted note. Distinct from ``onSave`` — never inferred from an empty save. */
  onDelete: () => Promise<void>
  /** When set, render a small footnote — typically "Last edited by ksr@…". */
  footnote?: string | null
  /** Disable the form (e.g. while a parent action is in flight). */
  disabled?: boolean
}

/**
 * Inline editor for set / record operator notes.
 *
 * Render policy:
 * - When no note is attached, show an "Add note" affordance.
 * - When a note exists, show it read-only with edit/delete actions.
 * - Editing reveals a textarea with Save/Cancel; an empty save deletes.
 */
export function NoteSection({
  title,
  note,
  onSave,
  onDelete,
  footnote,
  disabled,
}: NoteSectionProps) {
  const initial = note ?? ""
  const [draft, setDraft] = React.useState<string>(initial)
  const [isEditing, setIsEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Re-sync draft when the persisted note changes underneath us (e.g. a
  // sibling tab updates it). Skipping while editing prevents the user's
  // in-flight edit from being clobbered by a background refetch.
  React.useEffect(() => {
    if (!isEditing) setDraft(initial)
  }, [initial, isEditing])

  const startEdit = () => {
    setDraft(initial)
    setError(null)
    setIsEditing(true)
  }

  const cancel = () => {
    setDraft(initial)
    setError(null)
    setIsEditing(false)
  }

  const handleSave = async () => {
    const trimmed = draft.trim()
    // Save no longer falls through to delete — the API rejects empty notes
    // (min_length=1). Surface the validation error inline instead of
    // round-tripping a 422.
    if (!trimmed) {
      setError("Note can't be empty. Use Delete to remove it.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(trimmed)
      setIsEditing(false)
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail || err.message)
      else if (err instanceof Error) setError(err.message)
      else setError("Failed to save note.")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm("Delete this note?")) return
    setSaving(true)
    setError(null)
    try {
      await onDelete()
      setDraft("")
      setIsEditing(false)
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail || err.message)
      else if (err instanceof Error) setError(err.message)
      else setError("Failed to delete note.")
    } finally {
      setSaving(false)
    }
  }

  const showEmptyState = !isEditing && !initial

  return (
    <Card className="flex flex-col gap-y-3">
      <div className="flex items-center justify-between gap-x-2">
        <Label className="text-xs text-gray-500 dark:text-gray-500">
          {title}
        </Label>
        {!isEditing && initial && (
          <div className="flex gap-x-2">
            <Button
              type="button"
              variant="secondary"
              onClick={startEdit}
              disabled={disabled || saving}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              isLoading={saving}
              loadingText="Deleting…"
              disabled={disabled}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {isEditing ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={MAX_NOTE_LENGTH}
            placeholder="Why does this exist? Owner, runbook link, expected churn — anything future-you would thank present-you for."
            disabled={saving}
            className={TEXTAREA_CLASSES}
          />
          <div className="flex items-center justify-between gap-x-2">
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {draft.length}/{MAX_NOTE_LENGTH}
            </span>
            <div className="flex gap-x-2">
              <Button
                type="button"
                variant="secondary"
                onClick={cancel}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                isLoading={saving}
                loadingText="Saving…"
                disabled={disabled}
              >
                Save
              </Button>
            </div>
          </div>
        </>
      ) : showEmptyState ? (
        <Button
          type="button"
          variant="secondary"
          onClick={startEdit}
          disabled={disabled}
          className="self-start"
        >
          Add note
        </Button>
      ) : (
        <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-800 dark:text-gray-200">
          {initial}
        </p>
      )}

      {footnote && !isEditing && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          {footnote}
        </p>
      )}
    </Card>
  )
}
