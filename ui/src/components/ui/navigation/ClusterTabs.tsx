"use client"

import { TabNavigation, TabNavigationLink } from "@/components/TabNavigation"
import { clusterSections } from "@/app/siteConfig"
import {
  RiCodeSSlashLine,
  RiDatabase2Line,
  RiFolder3Line,
  RiLayoutGridLine,
  RiShieldUserLine,
} from "@remixicon/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

type Props = { clusterId: string }

export function ClusterTabs({ clusterId }: Props) {
  const pathname = usePathname()

  const tabs = [
    {
      href: clusterSections.overview(clusterId),
      label: "Overview",
      icon: RiLayoutGridLine,
      exact: true,
    },
    {
      href: clusterSections.sets(clusterId),
      label: "Namespaces",
      icon: RiFolder3Line,
    },
    {
      href: clusterSections.secondaryIndexes(clusterId),
      label: "Indexes",
      icon: RiDatabase2Line,
    },
    {
      href: clusterSections.admin(clusterId),
      label: "Admin",
      icon: RiShieldUserLine,
    },
    {
      href: clusterSections.udfs(clusterId),
      label: "UDFs",
      icon: RiCodeSSlashLine,
    },
  ]

  const isActive = (href: string, exact?: boolean) =>
    exact
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/")

  return (
    <TabNavigation>
      {tabs.map((t) => (
        <TabNavigationLink
          key={t.href}
          asChild
          active={isActive(t.href, t.exact)}
          className="gap-2"
        >
          <Link href={t.href}>
            <t.icon className="size-4 shrink-0" aria-hidden="true" />
            {t.label}
          </Link>
        </TabNavigationLink>
      ))}
    </TabNavigation>
  )
}
