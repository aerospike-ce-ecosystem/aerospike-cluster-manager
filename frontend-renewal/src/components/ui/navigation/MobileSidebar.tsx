"use client"

import { clusterSections, siteConfig } from "@/app/siteConfig"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/Accordion"
import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import { useConnectionHealth } from "@/hooks/use-connection-health"
import { useConnections } from "@/hooks/use-connections"
import { useK8sClusters } from "@/hooks/use-k8s-clusters"
import { useSwipe } from "@/hooks/use-swipe"
import { getCluster } from "@/lib/api/clusters"
import type {
  ConnectionProfileResponse,
  ConnectionStatus,
} from "@/lib/types/connection"
import type { K8sClusterSummary } from "@/lib/types/k8s"
import { cx, focusRing } from "@/lib/utils"
import { useConnectionStore } from "@/stores/connection-store"
import {
  RiCodeSSlashLine,
  RiFolder3Fill,
  RiMenuLine,
  RiSettings3Line,
  RiStackLine,
} from "@remixicon/react"
import Image from "next/image"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

type NamespaceSummary = { name: string; sets: string[] }
type ClusterSummary = {
  id: string
  name: string
  managedBy?: "ACKO" | "manual"
  namespaces: NamespaceSummary[]
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
        if (!cancelled) setMap((prev) => ({ ...prev, [activeClusterId]: [] }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeClusterId])
  return map
}

export default function MobileSidebar() {
  const pathname = usePathname()
  const params = useParams<{ clusterId?: string }>()
  const conn = useConnections()
  const k8s = useK8sClusters()
  const nsByConn = useClusterNamespaces(params?.clusterId ?? null)
  const healthStatuses = useConnectionStore((s) => s.healthStatuses)
  const [open, setOpen] = useState(false)

  // Keep sidebar health fresh (SSE + polling fallback).
  useConnectionHealth(conn.data)

  // Swipe-to-close: when the drawer is open, a left-swipe closes it.
  // Edge-swipe-right from the left edge opens the drawer.
  useSwipe({
    onSwipeLeft: () => setOpen(false),
    onSwipeRight: () => setOpen(true),
  })

  const clusterList = useMemo(
    () => buildClusterList(conn.data, k8s.data?.items ?? null, nsByConn),
    [conn.data, k8s.data, nsByConn],
  )

  const isActive = (href: string, exact = false) =>
    exact
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/")

  const expandedCluster = clusterList.find((c) =>
    isActive(`/clusters/${c.id}`),
  )?.id

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          aria-label="open sidebar"
          className="group flex items-center rounded-md p-2 text-sm font-medium hover:bg-gray-100 data-[state=open]:bg-gray-100 hover:dark:bg-gray-400/10"
        >
          <RiMenuLine
            className="size-6 shrink-0 sm:size-5"
            aria-hidden="true"
          />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>
            <span className="flex items-center gap-3">
              <Image
                src="/aerospike-logo.svg"
                alt="Aerospike"
                width={28}
                height={28}
                className="rounded-md"
              />
              Aerospike Cluster Manager
            </span>
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <nav
            aria-label="core mobile navigation"
            className="flex flex-col gap-4"
          >
            <div>
              <SectionLabel>Clusters</SectionLabel>
              <Accordion
                type="single"
                collapsible
                defaultValue={expandedCluster}
                className="flex flex-col gap-0.5"
              >
                {clusterList.map((c) => (
                  <ClusterNodeMobile
                    key={c.id}
                    cluster={c}
                    pathname={pathname ?? ""}
                    health={healthStatuses[c.id]}
                  />
                ))}
              </Accordion>
              {clusterList.length === 0 && !conn.isLoading && (
                <p className="px-2 py-1 text-xs italic text-gray-400 dark:text-gray-600">
                  No clusters yet
                </p>
              )}

              <DrawerClose asChild>
                <Link
                  href={siteConfig.baseLinks.clusters}
                  className={cx(
                    "mt-2 flex items-center gap-x-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition",
                    pathname === siteConfig.baseLinks.clusters
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 hover:dark:bg-gray-900 hover:dark:text-gray-50",
                    focusRing,
                  )}
                >
                  <RiStackLine className="size-4 shrink-0" aria-hidden="true" />
                  All clusters
                </Link>
              </DrawerClose>
            </div>

            <div>
              <SectionLabel>ACKO</SectionLabel>
              <DrawerClose asChild>
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
                  <RiCodeSSlashLine
                    className="size-4 shrink-0"
                    aria-hidden="true"
                  />
                  Cluster templates
                </Link>
              </DrawerClose>
            </div>

            <div className="mt-2">
              <SectionLabel>App</SectionLabel>
              <DrawerClose asChild>
                <Link
                  href={siteConfig.baseLinks.settings}
                  className={cx(
                    "flex items-center gap-x-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition",
                    isActive(siteConfig.baseLinks.settings)
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 hover:dark:bg-gray-900 hover:dark:text-gray-50",
                    focusRing,
                  )}
                >
                  <RiSettings3Line
                    className="size-4 shrink-0"
                    aria-hidden="true"
                  />
                  Settings
                </Link>
              </DrawerClose>
            </div>
          </nav>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500">
      {children}
    </span>
  )
}

function HealthDot({ status }: { status?: ConnectionStatus }) {
  if (!status) {
    return (
      <span
        aria-hidden="true"
        className="size-2 shrink-0 animate-pulse rounded-full bg-gray-300 dark:bg-gray-700"
      />
    )
  }
  const tone = !status.connected
    ? "bg-red-500"
    : status.tendHealthy === false
      ? "bg-yellow-500"
      : "bg-emerald-500"
  return (
    <span
      aria-hidden="true"
      className={cx("size-2 shrink-0 rounded-full", tone)}
    />
  )
}

function ClusterNodeMobile({
  cluster,
  pathname,
  health,
}: {
  cluster: ClusterSummary
  pathname: string
  health?: ConnectionStatus
}) {
  const clusterActive =
    pathname === `/clusters/${cluster.id}` ||
    pathname.startsWith(`/clusters/${cluster.id}/`)
  const expandedNs = cluster.namespaces
    .filter((ns) =>
      pathname.includes(`/clusters/${cluster.id}/sets/${ns.name}`),
    )
    .map((ns) => ns.name)

  return (
    <AccordionItem value={cluster.id} className="border-none">
      <AccordionTrigger
        className={cx(
          "rounded-md px-2 py-1.5 hover:bg-gray-100 hover:dark:bg-gray-900",
          clusterActive
            ? "text-indigo-600 dark:text-indigo-400"
            : "text-gray-700 dark:text-gray-300",
        )}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <RiStackLine className="size-4" aria-hidden="true" />
          <span className="font-mono">{cluster.name}</span>
          <HealthDot status={health} />
          {cluster.managedBy === "ACKO" && (
            <span className="rounded bg-indigo-50 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              ACKO
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pt-1">
        <ul className="flex flex-col gap-0.5">
          <li>
            <DrawerClose asChild>
              <Link
                href={`/clusters/${cluster.id}`}
                className={cx(
                  "flex items-center gap-2 rounded-md py-1 pl-5 pr-2 text-sm transition",
                  pathname === `/clusters/${cluster.id}`
                    ? "font-medium text-indigo-600 dark:text-indigo-400"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 hover:dark:bg-gray-900",
                  focusRing,
                )}
              >
                Overview
              </Link>
            </DrawerClose>
          </li>
          {cluster.namespaces.length === 0 && (
            <li className="py-1 pl-5 text-xs italic text-gray-400 dark:text-gray-600">
              no namespaces
            </li>
          )}
          {cluster.namespaces.map((ns) => (
            <NamespaceNodeMobile
              key={ns.name}
              clusterId={cluster.id}
              namespace={ns}
              pathname={pathname}
              defaultOpen={expandedNs.includes(ns.name)}
            />
          ))}
        </ul>
      </AccordionContent>
    </AccordionItem>
  )
}

function NamespaceNodeMobile({
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
              {namespace.sets.map((s) => {
                const href = clusterSections.set(clusterId, namespace.name, s)
                const active =
                  pathname === href || pathname.startsWith(href + "/")
                return (
                  <li key={s}>
                    <DrawerClose asChild>
                      <Link
                        href={href}
                        className={cx(
                          "flex items-center rounded-md py-1 pl-10 pr-2 font-mono text-sm transition",
                          active
                            ? "font-medium text-indigo-600 dark:text-indigo-400"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 hover:dark:bg-gray-900",
                          focusRing,
                        )}
                      >
                        {s}
                      </Link>
                    </DrawerClose>
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
