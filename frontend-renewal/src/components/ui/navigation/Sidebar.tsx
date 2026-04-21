"use client"

import { siteConfig, clusterSections } from "@/app/siteConfig"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/Accordion"
import { useConnections } from "@/hooks/use-connections"
import { useK8sClusters } from "@/hooks/use-k8s-clusters"
import { getCluster } from "@/lib/api/clusters"
import type { ConnectionProfileResponse } from "@/lib/types/connection"
import type { K8sClusterSummary } from "@/lib/types/k8s"
import { cx, focusRing } from "@/lib/utils"
import { RiCodeSSlashLine, RiFolder3Fill, RiStackLine } from "@remixicon/react"
import Image from "next/image"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import MobileSidebar from "./MobileSidebar"
import { UserProfileDesktop, UserProfileMobile } from "./UserProfile"

type NamespaceSummary = {
  name: string
  sets: string[]
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
          sets: ns.sets.map((s) => s.name),
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
): ClusterSummary[] {
  const list: ClusterSummary[] = []
  for (const c of connections ?? []) {
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

  const clusterList = useMemo(
    () => buildClusterList(conn.data, k8s.data?.items ?? null, nsByConn),
    [conn.data, k8s.data, nsByConn],
  )

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/")

  const expandedCluster = clusterList.find((c) =>
    isActive(`/clusters/${c.id}`),
  )?.id

  const loading = conn.isLoading || k8s.isLoading

  return (
    <>
      {/* sidebar (lg+) */}
      <nav className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <aside className="flex grow flex-col gap-y-4 overflow-y-auto border-r border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <BrandCard />

          <nav aria-label="core navigation" className="flex flex-1 flex-col gap-y-1">
            <SectionLabel>Clusters</SectionLabel>
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
              <span className="px-2 py-1 text-xs italic text-gray-400 dark:text-gray-600">
                Loading…
              </span>
            )}
            {!loading && clusterList.length === 0 && (
              <span className="px-2 py-1 text-xs italic text-gray-400 dark:text-gray-600">
                No clusters yet
              </span>
            )}

            <Link
              href="/clusters"
              className={cx(
                "mt-1 flex items-center gap-x-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition",
                pathname === "/clusters"
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 hover:dark:bg-gray-900 hover:dark:text-gray-50",
                focusRing,
              )}
            >
              <RiStackLine className="size-4 shrink-0" aria-hidden="true" />
              All clusters
            </Link>

            <SectionLabel className="mt-4">ACKO</SectionLabel>
            <Link
              href={siteConfig.baseLinks.ackoTemplates}
              className={cx(
                "flex items-center gap-x-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition",
                isActive(siteConfig.baseLinks.ackoTemplates)
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 hover:dark:bg-gray-900 hover:dark:text-gray-50",
                focusRing,
              )}
            >
              <RiCodeSSlashLine className="size-4 shrink-0" aria-hidden="true" />
              Cluster templates
            </Link>
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

function BrandCard() {
  return (
    <Link
      href="/clusters"
      className={cx(
        "flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5 transition hover:bg-gray-50 dark:border-gray-800 hover:dark:bg-gray-900",
        focusRing,
      )}
    >
      <Image
        src="/aerospike-logo.svg"
        alt="Aerospike"
        width={32}
        height={32}
        className="rounded-md"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
          Aerospike
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">Cluster Manager</p>
      </div>
    </Link>
  )
}

function SectionLabel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cx(
        "px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500",
        className,
      )}
    >
      {children}
    </span>
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
    .filter((ns) => pathname.includes(`/clusters/${cluster.id}/sets/${ns.name}`))
    .map((ns) => ns.name)

  return (
    <AccordionItem value={cluster.id} className="border-none">
      <AccordionTrigger
        className={cx(
          "rounded-md px-2 py-1.5 hover:bg-gray-100 hover:dark:bg-gray-900",
          clusterActive
            ? "text-indigo-600 dark:text-indigo-400"
            : "text-gray-700 dark:text-gray-400",
        )}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <RiStackLine className="size-4" aria-hidden="true" />
          <span className="font-mono">{cluster.name}</span>
          {cluster.managedBy === "ACKO" && (
            <span className="rounded bg-indigo-50 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              ACKO
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pt-1">
        <ul className="flex flex-col gap-0.5">
          {cluster.namespaces.length === 0 && (
            <li className="pl-5 py-1 text-xs italic text-gray-400 dark:text-gray-600">
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
  const nsActive = pathname.includes(`/clusters/${clusterId}/sets/${namespace.name}`)

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
              {namespace.sets.length} {namespace.sets.length === 1 ? "set" : "sets"}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-0.5">
            <ul className="flex flex-col gap-0.5">
              {namespace.sets.length === 0 && (
                <li className="py-1 pl-10 text-xs italic text-gray-400 dark:text-gray-600">
                  no sets
                </li>
              )}
              {namespace.sets.map((s) => {
                const href = clusterSections.set(clusterId, namespace.name, s)
                const active = pathname === href || pathname.startsWith(href + "/")
                return (
                  <li key={s}>
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
                      {s}
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
