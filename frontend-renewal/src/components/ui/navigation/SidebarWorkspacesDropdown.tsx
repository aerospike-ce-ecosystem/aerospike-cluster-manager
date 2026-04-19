"use client"

import { AddConnectionDialog } from "@/components/dialogs/AddConnectionDialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/Dropdown"
import { useConnections } from "@/hooks/use-connections"
import { cx, focusInput } from "@/lib/utils"
import { RiAddLine, RiExpandUpDownLine } from "@remixicon/react"
import { useParams, usePathname, useRouter } from "next/navigation"
import { useMemo, useState } from "react"

function initialsOf(name: string): string {
  if (!name) return "??"
  const parts = name.split(/[-_ .:]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function primaryHost(hosts: string[], port: number): string {
  if (!hosts.length) return "—"
  return `${hosts[0]}:${port}`
}

export function WorkspacesDropdownDesktop() {
  return <WorkspaceSwitcher variant="desktop" />
}

export function WorkspacesDropdownMobile() {
  return <WorkspaceSwitcher variant="mobile" />
}

function WorkspaceSwitcher({ variant }: { variant: "desktop" | "mobile" }) {
  const { data, isLoading, refetch } = useConnections()
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams<{ clusterId?: string }>()
  const [addOpen, setAddOpen] = useState(false)

  const active = useMemo(() => {
    const connections = data ?? []
    if (params?.clusterId) {
      const match = connections.find((c) => c.id === params.clusterId)
      if (match) return match
    }
    return connections[0] ?? null
  }, [data, params?.clusterId])

  const triggerClass = cx(
    "flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-left transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 hover:dark:bg-gray-900",
    variant === "desktop" ? "w-full" : "min-w-[220px]",
    focusInput,
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={triggerClass}
          aria-label="Switch workspace"
        >
          <Avatar
            initials={active ? initialsOf(active.name) : "—"}
            color={active?.color ?? "#4F46E5"}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
              {active?.name ?? (isLoading ? "Loading…" : "No workspace")}
            </p>
            <p className="truncate font-mono text-xs text-gray-500 dark:text-gray-400">
              {active
                ? primaryHost(active.hosts, active.port)
                : "Add a connection to start"}
            </p>
          </div>
          <RiExpandUpDownLine
            className="size-4 shrink-0 text-gray-500 dark:text-gray-500"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[260px]"
        >
          <DropdownMenuLabel>
            Workspaces{" "}
            <span className="font-normal text-gray-500 dark:text-gray-400">
              ({data?.length ?? 0})
            </span>
          </DropdownMenuLabel>
          <DropdownMenuGroup>
            {(data ?? []).map((c) => {
              const isActive = active?.id === c.id
              return (
                <DropdownMenuItem
                  key={c.id}
                  onSelect={(e) => {
                    e.preventDefault()
                    // Preserve same sub-section if possible (e.g. /sets, /admin)
                    if (!params?.clusterId) {
                      router.push(`/clusters/${c.id}`)
                      return
                    }
                    const rest = pathname.slice(
                      `/clusters/${params.clusterId}`.length,
                    )
                    router.push(`/clusters/${c.id}${rest}`)
                  }}
                  className={cx(
                    "flex items-start gap-3 py-2",
                    isActive && "bg-gray-50 dark:bg-gray-900",
                  )}
                >
                  <Avatar initials={initialsOf(c.name)} color={c.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-50">
                      {c.name}
                    </p>
                    <p className="truncate font-mono text-xs text-gray-500 dark:text-gray-400">
                      {primaryHost(c.hosts, c.port)}
                    </p>
                  </div>
                </DropdownMenuItem>
              )
            })}
            {(!data || data.length === 0) && !isLoading && (
              <DropdownMenuItem disabled className="text-sm text-gray-500">
                No saved workspaces
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setAddOpen(true)
            }}
            className="flex items-center gap-2 text-sm"
          >
            <RiAddLine className="size-4" aria-hidden="true" />
            Add workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddConnectionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          void refetch()
        }}
      />
    </>
  )
}

function Avatar({ initials, color }: { initials: string; color: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
      style={{ background: color }}
    >
      {initials}
    </span>
  )
}
