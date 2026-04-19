"use client"

import { TabNavigation, TabNavigationLink } from "@/components/TabNavigation"
import { clusterSections } from "@/app/siteConfig"
import { useK8sClusters } from "@/hooks/use-k8s-clusters"
import {
  RiCodeSSlashLine,
  RiDatabase2Line,
  RiFolder3Line,
  RiLayoutGridLine,
  RiShieldUserLine,
  RiStackLine,
} from "@remixicon/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

type Props = { clusterId: string }

export function ClusterTabs({ clusterId }: Props) {
  const pathname = usePathname()
  const { data } = useK8sClusters()
  const hasAcko = (data?.items ?? []).some((c) => c.connectionId === clusterId)

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
    // ACKO tab appears only when a matching AerospikeCluster CR exists.
    ...(hasAcko
      ? [
          {
            href: clusterSections.acko(clusterId),
            label: "ACKO",
            icon: RiStackLine,
          },
        ]
      : []),
  ]

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/")

  return (
    <TabNavigation>
      {tabs.map((t) => (
        <TabNavigationLink key={t.href} asChild active={isActive(t.href, t.exact)}>
          <Link href={t.href} className="inline-flex items-center gap-2">
            <t.icon className="size-4 shrink-0" aria-hidden="true" />
            {t.label}
          </Link>
        </TabNavigationLink>
      ))}
    </TabNavigation>
  )
}
