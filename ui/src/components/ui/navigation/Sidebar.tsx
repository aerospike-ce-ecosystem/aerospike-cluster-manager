"use client"

import { siteConfig, clusterSections } from "@/app/siteConfig"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/Accordion"
import { Tooltip } from "@/components/Tooltip"
import { useConnections } from "@/hooks/use-connections"
import { useK8sClusters } from "@/hooks/use-k8s-clusters"
import { getCluster } from "@/lib/api/clusters"
import type { ConnectionProfileResponse } from "@/lib/types/connection"
import type { K8sClusterSummary } from "@/lib/types/k8s"
import { cx, focusRing } from "@/lib/utils"
import { useUiStore } from "@/stores/ui-store"
import * as AccordionPrimitives from "@radix-ui/react-accordion"
import {
  RiArrowDownSLine,
  RiBox3Line,
  RiCodeSSlashLine,
  RiDatabase2Line,
  RiFolder3Fill,
  RiStackLine,
} from "@remixicon/react"
import Image from "next/image"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { ClusterSelector } from "./ClusterSelector"
import MobileSidebar from "./MobileSidebar"
import { UserProfileDesktop, UserProfileMobile } from "./UserProfile"
import { WorkspacesDropdown } from "./WorkspacesDropdown"

type SidebarSet = {
  name: string
  objects: number
}

type NamespaceSummary = {
  name: string
  sets: SidebarSet[]
}

type ClusterSummary = {
  id: string
  name: string
  managedBy?: "ACKO" | "manual"
  namespaces: NamespaceSummary[]
}

// Fetch cluster detail only for the currently selected cluster, to avoid
// calling /api/clusters/{id} (which hits live Aerospike) for every saved
// connection on every render. Other clusters show as collapsed stubs.
function useClusterNamespaces(
  activeClusterId: string | null,
): Record<string, NamespaceSummary[]> {
  const [map, setMap] = useState<Record<string, NamespaceSummary[]>>({})

  useEffect(() => {
    if (!activeClusterId) return
    let cancelled = false
    ;(async () => {
      try {
        const info = await getCluster(activeClusterId)
        if (cancelled) return
        const summary = info.namespaces.map((ns) => ({
          name: ns.name,
          sets: ns.sets.map((s) => ({ name: s.name, objects: s.objects })),
        }))
        setMap((prev) => ({ ...prev, [activeClusterId]: summary }))
      } catch {
        // Cluster may be unreachable; leave namespaces empty so sidebar
        // still renders the cluster row.
        if (!cancelled) setMap((prev) => ({ ...prev, [activeClusterId]: [] }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeClusterId])

  return map
}

function buildClusterList(
  connections: ConnectionProfileResponse[] | null,
  k8s: K8sClusterSummary[] | null,
  nsByConn: Record<string, NamespaceSummary[]>,
  workspaceId: string,
): ClusterSummary[] {
  const list: ClusterSummary[] = []
  for (const c of connections ?? []) {
    if (c.workspaceId !== workspaceId) continue
    const linked = k8s?.find((k) => k.connectionId === c.id)
    list.push({
      id: c.id,
      name: c.name,
      managedBy: linked ? "ACKO" : "manual",
      namespaces: nsByConn[c.id] ?? [],
    })
  }
  return list
}

export function Sidebar() {
  const pathname = usePathname()
  const params = useParams<{ clusterId?: string }>()
  const conn = useConnections()
  const k8s = useK8sClusters()
  const nsByConn = useClusterNamespaces(params?.clusterId ?? null)
  const currentWorkspaceId = useUiStore((s) => s.currentWorkspaceId)
  const setCurrentWorkspaceId = useUiStore((s) => s.setCurrentWorkspaceId)

  // When the user navigates directly to a cluster URL whose connection lives
  // in a different workspace than the one currently selected (e.g. opening a
  // shared link), follow the URL: switch the persisted workspace so the
  // cluster is visible in the sidebar drill-down.
  useEffect(() => {
    if (!params?.clusterId || !conn.data) return
    const target = conn.data.find((c) => c.id === params.clusterId)
    if (target && target.workspaceId !== currentWorkspaceId) {
      setCurrentWorkspaceId(target.workspaceId)
    }
  }, [params?.clusterId, conn.data, currentWorkspaceId, setCurrentWorkspaceId])

  const clusterList = useMemo(
    () =>
      buildClusterList(
        conn.data,
        k8s.data?.items ?? null,
        nsByConn,
        currentWorkspaceId,
      ),
    [conn.data, k8s.data, nsByConn, currentWorkspaceId],
  )

  const isActive = (href: string, exact = false) =>
    exact
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/")

  const expandedCluster = clusterList.find((c) =>
    isActive(`/clusters/${c.id}`),
  )?.id

  const loading = conn.isLoading || k8s.isLoading

  return (
    <>
      {/* sidebar (lg+) */}
      <nav className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <aside className="flex grow flex-col gap-y-4 overflow-y-auto border-r border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <BrandCard active={pathname === "/clusters"} />
          <ClusterSelector />
          <WorkspacesDropdown />

          <nav aria-label="core navigation" className="flex flex-1 flex-col">
            <Accordion
              type="multiple"
              defaultValue={["clusters", "acko"]}
              className="flex flex-col gap-0.5"
            >
              <GroupSection
                value="clusters"
                icon={RiDatabase2Line}
                label="Clusters"
              >
                <Accordion
                  type="single"
                  collapsible
                  defaultValue={expandedCluster}
                  className="flex flex-col gap-0.5"
                >
                  {clusterList.map((c) => (
                    <ClusterNode
                      key={c.id}
                      cluster={c}
                      pathname={pathname}
                      isActive={isActive}
                    />
                  ))}
                </Accordion>
                {loading && clusterList.length === 0 && (
                  <span className="block py-1 pl-2 text-xs italic text-gray-400 dark:text-gray-600">
                    Loading…
                  </span>
                )}
                {!loading && clusterList.length === 0 && (
                  <span className="block py-1 pl-2 text-xs italic text-gray-400 dark:text-gray-600">
                    No clusters yet
                  </span>
                )}
              </GroupSection>

              <GroupSection value="acko" icon={RiBox3Line} label="ACKO">
                <Link
                  href={siteConfig.baseLinks.ackoTemplates}
                  className={cx(
                    "flex items-center gap-x-2.5 rounded-md py-1.5 pl-2 pr-2 text-sm font-medium transition",
                    isActive(siteConfig.baseLinks.ackoTemplates)
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 hover:dark:bg-gray-900 hover:dark:text-gray-50",
                    focusRing,
                  )}
                >
                  <RiCodeSSlashLine
                    className="size-4 shrink-0"
                    aria-hidden="true"
                  />
                  Cluster templates
                </Link>
              </GroupSection>
            </Accordion>
          </nav>
          <div className="mt-auto">
            <UserProfileDesktop />
          </div>
        </aside>
      </nav>
      {/* top navbar (xs-lg) */}
      <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 shadow-sm sm:gap-x-6 sm:px-4 lg:hidden dark:border-gray-800 dark:bg-gray-950">
        <span className="font-semibold text-gray-900 dark:text-gray-50">
          Aerospike Cluster Manager
        </span>
        <div className="flex items-center gap-1 sm:gap-2">
          <UserProfileMobile />
          <MobileSidebar />
        </div>
      </div>
    </>
  )
}

function BrandCard({ active }: { active?: boolean }) {
  return (
    <Link
      href="/clusters"
      aria-label="All clusters"
      className={cx(
        "flex items-center gap-3 rounded-md px-2 py-1.5 transition",
        active
          ? "bg-indigo-50 dark:bg-indigo-950/40"
          : "hover:bg-gray-50 dark:hover:bg-gray-900",
        focusRing,
      )}
    >
      <Image
        src="/acm-logo.svg"
        alt="Aerospike Cluster Manager"
        width={36}
        height={36}
        className="size-9 shrink-0 rounded-lg"
      />
      <div className="min-w-0 leading-tight">
        <p
          className={cx(
            "truncate text-sm font-semibold",
            active
              ? "text-indigo-700 dark:text-indigo-300"
              : "text-gray-900 dark:text-gray-50",
          )}
        >
          Aerospike
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          Cluster Manager
        </p>
      </div>
    </Link>
  )
}

function GroupSection({
  value,
  icon: Icon,
  label,
  children,
}: {
  value: string
  icon: React.ElementType
  label: string
  children: React.ReactNode
}) {
  return (
    <AccordionItem value={value} className="border-none">
      <AccordionTrigger
        className={cx(
          "rounded-md px-2 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100 dark:text-gray-50 hover:dark:bg-gray-900",
          focusRing,
        )}
      >
        <span className="flex items-center gap-2.5">
          <Icon className="size-5 shrink-0" aria-hidden="true" />
          {label}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-1 pt-1">
        <div className="ml-[11px] flex flex-col border-l border-gray-200 pl-2 dark:border-gray-800">
          {children}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

function ClusterNode({
  cluster,
  pathname,
  isActive,
}: {
  cluster: ClusterSummary
  pathname: string
  isActive: (href: string, exact?: boolean) => boolean
}) {
  const clusterActive = isActive(`/clusters/${cluster.id}`)
  const expandedNamespaces = cluster.namespaces
    .filter((ns) =>
      pathname.includes(`/clusters/${cluster.id}/sets/${ns.name}`),
    )
    .map((ns) => ns.name)
  // Backend prepends "[K8s] " to connection names auto-created for ACKO
  // clusters. The ACKO badge already signals K8s origin, so drop the prefix
  // for display to avoid visual duplication (and give the name more width).
  const displayName =
    cluster.managedBy === "ACKO"
      ? cluster.name.replace(/^\[K8s\]\s*/, "")
      : cluster.name

  return (
    <AccordionItem value={cluster.id} className="border-none">
      <AccordionPrimitives.Header
        className={cx(
          "flex items-center rounded-md pr-1 hover:bg-gray-100 hover:dark:bg-gray-900",
          clusterActive
            ? "text-indigo-600 dark:text-indigo-400"
            : "text-gray-700 dark:text-gray-400",
        )}
      >
        <Tooltip content={cluster.name} side="right" triggerAsChild>
          <Link
            href={`/clusters/${cluster.id}`}
            className={cx(
              "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium",
              focusRing,
            )}
          >
            <RiStackLine className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-mono">
              {displayName}
            </span>
            {cluster.managedBy === "ACKO" && (
              <span className="shrink-0 rounded bg-indigo-50 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                ACKO
              </span>
            )}
          </Link>
        </Tooltip>
        <AccordionPrimitives.Trigger
          aria-label={`Toggle ${displayName} namespaces`}
          className={cx(
            "group/chev flex size-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-500 hover:dark:bg-gray-800 hover:dark:text-gray-50",
            focusRing,
          )}
        >
          <RiArrowDownSLine
            className="size-4 transition-transform duration-150 group-data-[state=open]/chev:rotate-180"
            aria-hidden="true"
          />
        </AccordionPrimitives.Trigger>
      </AccordionPrimitives.Header>
      <AccordionContent className="pt-1">
        <ul className="flex flex-col gap-0.5">
          {cluster.namespaces.length === 0 && (
            <li className="py-1 pl-5 text-xs italic text-gray-400 dark:text-gray-600">
              no namespaces
            </li>
          )}
          {cluster.namespaces.map((ns) => (
            <NamespaceNode
              key={ns.name}
              clusterId={cluster.id}
              namespace={ns}
              pathname={pathname}
              defaultOpen={expandedNamespaces.includes(ns.name)}
            />
          ))}
        </ul>
      </AccordionContent>
    </AccordionItem>
  )
}

function NamespaceNode({
  clusterId,
  namespace,
  pathname,
  defaultOpen,
}: {
  clusterId: string
  namespace: NamespaceSummary
  pathname: string
  defaultOpen?: boolean
}) {
  const nsActive = pathname.includes(
    `/clusters/${clusterId}/sets/${namespace.name}`,
  )

  return (
    <li>
      <Accordion
        type="single"
        collapsible
        defaultValue={defaultOpen || nsActive ? namespace.name : undefined}
      >
        <AccordionItem value={namespace.name} className="border-none">
          <AccordionTrigger
            className={cx(
              "group flex items-center justify-between rounded-md py-1 pl-3 pr-2 text-sm hover:bg-gray-100 hover:dark:bg-gray-900",
              nsActive
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-gray-700 dark:text-gray-300",
            )}
          >
            <span className="flex items-center gap-2">
              <RiFolder3Fill
                className="size-4 shrink-0 text-amber-400 dark:text-amber-400"
                aria-hidden="true"
              />
              <span className="font-mono">{namespace.name}</span>
            </span>
            <span className="ml-2 shrink-0 text-[10px] text-gray-400 dark:text-gray-600">
              {namespace.sets.length}{" "}
              {namespace.sets.length === 1 ? "set" : "sets"}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-0.5">
            <ul className="flex flex-col gap-0.5">
              {namespace.sets.length === 0 && (
                <li className="py-1 pl-10 text-xs italic text-gray-400 dark:text-gray-600">
                  no sets
                </li>
              )}
              {[...namespace.sets]
                .sort(
                  (a, b) =>
                    Number(b.objects > 0) - Number(a.objects > 0) ||
                    a.name.localeCompare(b.name),
                )
                .map((s) => {
                  const href = clusterSections.set(
                    clusterId,
                    namespace.name,
                    s.name,
                  )
                  const active =
                    pathname === href || pathname.startsWith(href + "/")
                  if (s.objects === 0) {
                    return (
                      <li key={s.name}>
                        <Tooltip
                          content="Empty set"
                          side="right"
                          triggerAsChild
                        >
                          <span
                            aria-disabled="true"
                            className={cx(
                              "relative flex cursor-not-allowed items-center rounded-md py-1 pl-10 pr-2 font-mono text-sm",
                              "text-gray-400 opacity-70 dark:text-gray-600",
                            )}
                          >
                            {s.name}
                          </span>
                        </Tooltip>
                      </li>
                    )
                  }
                  return (
                    <li key={s.name}>
                      <Link
                        href={href}
                        className={cx(
                          "relative flex items-center rounded-md py-1 pl-10 pr-2 font-mono text-sm transition",
                          "before:absolute before:left-[30px] before:top-1.5 before:h-4 before:w-0.5 before:rounded-sm",
                          active
                            ? "font-medium text-indigo-600 before:bg-indigo-500 dark:text-indigo-400"
                            : "text-gray-600 before:bg-transparent hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 hover:dark:bg-gray-900 hover:dark:text-gray-50",
                          focusRing,
                        )}
                      >
                        {s.name}
                      </Link>
                    </li>
                  )
                })}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </li>
  )
}
