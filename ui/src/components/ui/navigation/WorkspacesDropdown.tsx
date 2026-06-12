"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/Dropdown"
import { AddWorkspaceDialog } from "@/components/dialogs/AddWorkspaceDialog"
import { EditWorkspaceDialog } from "@/components/dialogs/EditWorkspaceDialog"
import { useConnections } from "@/hooks/use-connections"
import { useWorkspaces } from "@/hooks/use-workspaces"
import { cx, focusRing } from "@/lib/utils"
import {
  DEFAULT_WORKSPACE_ID,
  type WorkspaceResponse,
} from "@/lib/types/workspace"
import { useUiStore } from "@/stores/ui-store"
import {
  RiAddLine,
  RiCheckLine,
  RiExpandUpDownLine,
  RiPencilLine,
} from "@remixicon/react"
import * as React from "react"

function workspaceInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return "WS"
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function WorkspaceAvatar({
  name,
  color,
  size = "md",
}: {
  name: string
  color: string
  size?: "sm" | "md"
}) {
  const dimension = size === "sm" ? "size-7" : "size-9"
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className={cx(
        "flex shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white",
        dimension,
      )}
    >
      {workspaceInitials(name)}
    </span>
  )
}

export function WorkspacesDropdown() {
  const { data, isLoading, refetch } = useWorkspaces()
  const { data: connections } = useConnections()
  const currentWorkspaceId = useUiStore((s) => s.currentWorkspaceId)
  const setCurrentWorkspaceId = useUiStore((s) => s.setCurrentWorkspaceId)

  const [addOpen, setAddOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<WorkspaceResponse | null>(
    null,
  )

  // Hide the built-in default workspace from the list once the user has at
  // least one custom workspace AND the default no longer holds any
  // connections. Keeps the picker meaningful — an empty "Default" entry is
  // just clutter once everything has been moved into named workspaces.
  // Wait until connections finish loading before filtering, otherwise the
  // default would briefly disappear during the initial fetch.
  const visible = React.useMemo<WorkspaceResponse[] | null>(() => {
    if (!data) return null
    if (!connections) return data
    const hasCustom = data.some((w) => !w.isDefault)
    if (!hasCustom) return data
    return data.filter((w) => {
      if (!w.isDefault) return true
      return connections.some((c) => c.workspaceId === w.id)
    })
  }, [data, connections])

  // Reconcile the persisted currentWorkspaceId against the visible list once
  // workspaces load. If the saved id no longer exists (e.g. it was deleted
  // in another session) or the default was hidden because it became empty,
  // pick the first visible workspace so the rest of the UI doesn't filter
  // on an orphan id.
  React.useEffect(() => {
    if (!visible || visible.length === 0) return
    if (visible.some((w) => w.id === currentWorkspaceId)) return
    const fallback =
      visible.find((w) => w.id === DEFAULT_WORKSPACE_ID) ?? visible[0]
    setCurrentWorkspaceId(fallback.id)
  }, [visible, currentWorkspaceId, setCurrentWorkspaceId])

  const current =
    visible?.find((w) => w.id === currentWorkspaceId) ??
    visible?.find((w) => w.id === DEFAULT_WORKSPACE_ID) ??
    visible?.[0] ??
    null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Switch workspace"
            className={cx(
              "flex w-full items-center gap-3 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-left transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900",
              focusRing,
            )}
          >
            {current ? (
              <WorkspaceAvatar name={current.name} color={current.color} />
            ) : (
              <span className="size-9 shrink-0 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
                {current?.name ?? (isLoading ? "Loading…" : "No workspace")}
              </p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                {current?.isDefault ? "Default" : "Workspace"}
              </p>
            </div>
            <RiExpandUpDownLine
              className="size-4 shrink-0 text-gray-400"
              aria-hidden="true"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>
            Workspaces ({visible?.length ?? 0})
          </DropdownMenuLabel>
          {visible?.map((ws) => {
            const selected = ws.id === currentWorkspaceId
            return (
              <DropdownMenuItem
                key={ws.id}
                onSelect={(event) => {
                  // Avoid closing the menu when the inline edit button was clicked.
                  const target = event.target as HTMLElement | null
                  if (target?.closest("[data-ws-edit]")) {
                    event.preventDefault()
                    return
                  }
                  setCurrentWorkspaceId(ws.id)
                }}
                className="flex items-center gap-2"
              >
                <WorkspaceAvatar name={ws.name} color={ws.color} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {ws.name}
                </span>
                {selected && (
                  <RiCheckLine
                    className="text-primary-40 dark:text-primary-65 size-4 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <button
                  type="button"
                  data-ws-edit
                  aria-label={`Edit ${ws.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditTarget(ws)
                  }}
                  className={cx(
                    "ml-1 flex size-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-50",
                    focusRing,
                  )}
                >
                  <RiPencilLine className="size-3.5" aria-hidden="true" />
                </button>
              </DropdownMenuItem>
            )
          })}
          {visible && visible.length === 0 && !isLoading && (
            <div className="px-2 py-1.5 text-sm text-gray-400 italic dark:text-gray-600">
              No workspaces
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setAddOpen(true)
            }}
            className="flex items-center gap-2"
          >
            <RiAddLine
              className="size-4 shrink-0 text-gray-500"
              aria-hidden="true"
            />
            Add workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddWorkspaceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={async (created) => {
          await refetch()
          setCurrentWorkspaceId(created.id)
        }}
      />

      <EditWorkspaceDialog
        workspace={editTarget}
        open={editTarget !== null}
        onOpenChange={(next) => {
          if (!next) setEditTarget(null)
        }}
        onSaved={() => refetch()}
        onDeleted={(deletedId) => {
          if (deletedId === currentWorkspaceId) {
            setCurrentWorkspaceId(DEFAULT_WORKSPACE_ID)
          }
          refetch()
        }}
      />
    </>
  )
}

export default WorkspacesDropdown
