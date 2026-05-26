"use client"

/**
 * GuideEditorDialog — register or edit a workspace operational guide.
 *
 * Mutations live here (not in the page) per the ui/ convention. The dialog
 * carries a Write / Preview toggle so the author can sanity-check the Markdown
 * with the very same renderer the read view uses (GuideMarkdown).
 */

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
import { GuideMarkdown } from "@/components/GuideMarkdown"
import { Input } from "@/components/Input"
import { ApiError } from "@/lib/api/client"
import { deleteGuide, upsertGuide } from "@/lib/api/guides"
import {
  GUIDE_TYPE_LABEL,
  MAX_GUIDE_CONTENT_LENGTH,
  MAX_GUIDE_TITLE_LENGTH,
  type Guide,
  type GuideType,
} from "@/lib/types/guide"
import { cx, focusInput } from "@/lib/utils"

/** Starter Markdown shown when registering a guide for the first time. */
const STARTER_TEMPLATE: Record<GuideType, string> = {
  "data-plane": `# Data-plane policy

Policy for dynamic Aerospike data CRUD in this workspace. ackoctl and AI
agents must read this guide before creating, updating or deleting records.

## TTL

- Throwaway / test data **must** set a TTL of **7 days or less**.
- Long-lived data requires an owner and a review note.

## Required note template

Every test record/set must carry a \`note\` in this shape:

\`\`\`
creator: <name>
date: <YYYY-MM-DD>
purpose: <why this data exists>
ttl: <e.g. 7d>
\`\`\`

## Naming

- Test sets: prefix with \`tmp_\`.
`,
  "control-plane": `# Control-plane policy

Policy for Aerospike cluster lifecycle in this workspace. ackoctl and AI
agents must read this guide before creating, scaling or deleting clusters.

## Environments

| Environment | Rule |
| --- | --- |
| test  | In-memory only (no persistent storage). |
| stage | Use the \`soft-rack\` AerospikeClusterTemplate. |
| prod  | Do **not** create directly — get approval from the platform owner first. |

## Approvals

- prod cluster changes require a recorded approval before \`ackoctl\` runs.
`,
}

const TEXTAREA_CLASS = cx(
  "block w-full rounded-md border px-2.5 py-2 font-mono text-xs leading-relaxed shadow-sm outline-none transition",
  "border-gray-300 bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50",
  "placeholder-gray-400 dark:placeholder-gray-500",
  focusInput,
)

interface GuideEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  guideType: GuideType
  /** The existing guide when editing; null when registering a new one. */
  existing: Guide | null
  onSaved?: (guide: Guide) => void
  onDeleted?: (guideType: GuideType) => void
}

export function GuideEditorDialog({
  open,
  onOpenChange,
  workspaceId,
  guideType,
  existing,
  onSaved,
  onDeleted,
}: GuideEditorDialogProps) {
  const [title, setTitle] = React.useState("")
  const [content, setContent] = React.useState("")
  const [tab, setTab] = React.useState<"write" | "preview">("write")
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  // Re-hydrate the form each time the dialog opens. Registering a fresh guide
  // pre-fills the starter template so the author edits rather than stares at
  // a blank box.
  React.useEffect(() => {
    if (!open) return
    setTitle(existing?.title ?? GUIDE_TYPE_LABEL[guideType])
    setContent(existing?.content ?? STARTER_TEMPLATE[guideType])
    setTab("write")
    setError(null)
  }, [open, existing, guideType])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError("Title is required.")
      return
    }
    if (!content.trim()) {
      setError("Guide content is required.")
      return
    }
    if (content.length > MAX_GUIDE_CONTENT_LENGTH) {
      setError(
        `Content exceeds the ${MAX_GUIDE_CONTENT_LENGTH} character limit.`,
      )
      return
    }

    setIsSubmitting(true)
    try {
      const saved = await upsertGuide(workspaceId, guideType, {
        title: trimmedTitle,
        content,
      })
      onSaved?.(saved)
      onOpenChange(false)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail || err.message
          : err instanceof Error
            ? err.message
            : "Failed to save the guide.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!existing) return
    setError(null)
    setIsDeleting(true)
    try {
      await deleteGuide(workspaceId, guideType)
      onDeleted?.(guideType)
      onOpenChange(false)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail || err.message
          : err instanceof Error
            ? err.message
            : "Failed to delete the guide.",
      )
    } finally {
      setIsDeleting(false)
    }
  }

  const verb = existing ? "Edit" : "Register"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
          <DialogHeader>
            <DialogTitle>
              {verb} {GUIDE_TYPE_LABEL[guideType].toLowerCase()}
            </DialogTitle>
            <DialogDescription>
              Markdown is supported. ackoctl exposes this guide to operators and
              AI agents via{" "}
              <code className="font-mono text-xs">
                ackoctl guide get {guideType}
              </code>
              .
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-y-1.5">
            <label
              htmlFor="guide-title"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Title
            </label>
            <Input
              id="guide-title"
              value={title}
              maxLength={MAX_GUIDE_TITLE_LENGTH}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={GUIDE_TYPE_LABEL[guideType]}
            />
          </div>

          <div className="flex flex-col gap-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Content
              </span>
              <div className="flex gap-1">
                {(["write", "preview"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cx(
                      "rounded px-2 py-1 text-xs font-medium capitalize transition",
                      tab === t
                        ? "dark:bg-primary-10/40 bg-primary-95 text-primary-40 dark:text-primary-80"
                        : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {tab === "write" ? (
              <textarea
                id="guide-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={18}
                spellCheck={false}
                className={TEXTAREA_CLASS}
                placeholder="# Policy&#10;&#10;Write the guide in Markdown..."
              />
            ) : (
              <div className="h-[26rem] overflow-y-auto rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
                <GuideMarkdown content={content} />
              </div>
            )}
            <p className="text-right text-xs text-gray-400 dark:text-gray-600">
              {content.length.toLocaleString()} /{" "}
              {MAX_GUIDE_CONTENT_LENGTH.toLocaleString()}
            </p>
          </div>

          <DialogFooter className="sm:justify-between">
            {existing ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting || isDeleting}
                isLoading={isDeleting}
                loadingText="Deleting..."
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-x-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting || isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={isSubmitting}
                loadingText="Saving..."
                disabled={isDeleting}
              >
                {existing ? "Save changes" : "Register guide"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default GuideEditorDialog
