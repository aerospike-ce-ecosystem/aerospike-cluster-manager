"use client"

/**
 * /guides — operational guides for the current workspace.
 *
 * This is the main page for the guides feature: acko administrators register,
 * edit and review the two Markdown policy documents that govern this
 * workspace — the data-plane guide (data CRUD policy) and the control-plane
 * guide (cluster lifecycle policy). ackoctl reads the very same guides via
 * `ackoctl guide get`, so the page wording and the CLI stay in sync.
 */

import { useMemo, useState } from "react"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { ErrorBanner } from "@/components/ErrorBanner"
import { GuideMarkdown } from "@/components/GuideMarkdown"
import { InfoBanner } from "@/components/InfoBanner"
import { GuideEditorDialog } from "@/components/dialogs/GuideEditorDialog"
import { useGuides } from "@/hooks/use-guides"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { mapApiError } from "@/lib/api/error-mapping"
import {
  GUIDE_TYPES,
  GUIDE_TYPE_DESCRIPTION,
  GUIDE_TYPE_LABEL,
  type Guide,
  type GuideType,
} from "@/lib/types/guide"
import { useUiStore } from "@/stores/ui-store"

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

interface EditorTarget {
  guideType: GuideType
  existing: Guide | null
}

export default function GuidesPage() {
  const currentWorkspaceId = useUiStore((s) => s.currentWorkspaceId)
  const workspaces = useWorkspaces()
  const guides = useGuides(currentWorkspaceId)
  const [editor, setEditor] = useState<EditorTarget | null>(null)

  const workspaceName = useMemo(
    () =>
      workspaces.data?.find((w) => w.id === currentWorkspaceId)?.name ??
      currentWorkspaceId,
    [workspaces.data, currentWorkspaceId],
  )

  const byType = useMemo(() => {
    const map = new Map<GuideType, Guide>()
    for (const g of guides.data ?? []) map.set(g.guideType, g)
    return map
  }, [guides.data])

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">
            Operations
          </span>
          <h1 className="mt-1 text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
            Operational guides
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            Org/team policy for workspace{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {workspaceName}
            </span>{" "}
            — authored here, enforced everywhere.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void guides.refetch()}
          isLoading={guides.isLoading}
        >
          Refresh
        </Button>
      </header>

      <InfoBanner title="Read before you operate">
        ackoctl and AI agents fetch these guides with{" "}
        <code className="font-mono text-xs">ackoctl guide get data-plane</code>{" "}
        and{" "}
        <code className="font-mono text-xs">
          ackoctl guide get control-plane
        </code>{" "}
        before running data or cluster operations. Keep them current — they are
        the authoritative policy for this workspace.
      </InfoBanner>

      {guides.error && (
        <ErrorBanner
          message={mapApiError(guides.error).message}
          onRetry={() => void guides.refetch()}
          disabled={guides.isLoading}
          staleData={!!guides.data}
        />
      )}

      <div className="flex flex-col gap-6">
        {GUIDE_TYPES.map((guideType) => {
          const guide = byType.get(guideType) ?? null
          return (
            <Card key={guideType} className="p-0">
              <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-4 dark:border-gray-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
                      {GUIDE_TYPE_LABEL[guideType]}
                    </h2>
                    <Badge variant={guide ? "success" : "neutral"}>
                      {guide ? "Registered" : "Not registered"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
                    {GUIDE_TYPE_DESCRIPTION[guideType]}
                  </p>
                </div>
                <Button
                  variant={guide ? "secondary" : "primary"}
                  onClick={() => setEditor({ guideType, existing: guide })}
                  disabled={guides.isLoading && !guides.data}
                >
                  {guide ? "Edit" : "Register"}
                </Button>
              </div>

              <div className="p-4">
                {guides.isLoading && !guides.data ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-3 animate-pulse rounded bg-gray-100 dark:bg-gray-900"
                        style={{ width: `${90 - i * 15}%` }}
                      />
                    ))}
                  </div>
                ) : guide ? (
                  <>
                    <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                        {guide.title}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-600">
                        updated {formatDate(guide.updatedAt)}
                        {guide.updatedBy ? ` by ${guide.updatedBy}` : ""}
                      </span>
                    </div>
                    <GuideMarkdown content={guide.content} />
                  </>
                ) : (
                  <div className="rounded-md border border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No {GUIDE_TYPE_LABEL[guideType].toLowerCase()} registered
                      for this workspace yet.
                    </p>
                    <Button
                      variant="primary"
                      className="mt-3"
                      onClick={() => setEditor({ guideType, existing: null })}
                    >
                      Register {GUIDE_TYPE_LABEL[guideType].toLowerCase()}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {editor && (
        <GuideEditorDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditor(null)
          }}
          workspaceId={currentWorkspaceId}
          guideType={editor.guideType}
          existing={editor.existing}
          onSaved={() => void guides.refetch()}
          onDeleted={() => void guides.refetch()}
        />
      )}
    </main>
  )
}
