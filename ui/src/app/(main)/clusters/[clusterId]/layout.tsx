import { ClusterTabs } from "@/components/ui/navigation/ClusterTabs"
import Link from "next/link"

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ clusterId: string }>
}

export default async function ClusterLayout({ children, params }: LayoutProps) {
  const { clusterId } = await params
  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500"
      >
        <Link
          href="/clusters"
          className="hover:text-gray-900 dark:hover:text-gray-50"
        >
          Clusters
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-mono text-gray-900 dark:text-gray-50">
          {clusterId}
        </span>
      </nav>
      <ClusterTabs clusterId={clusterId} />
      {children}
    </div>
  )
}
