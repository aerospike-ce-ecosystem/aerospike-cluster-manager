import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { clusterSections } from "@/app/siteConfig"
import Link from "next/link"

type PageProps = {
  params: { clusterId: string; namespace: string; set: string; key: string }
}

// Mirrors GET /api/connections/{connId}/records/{ns}/{set}/{key}
type Bin = { name: string; type: string; value: string }

const bins: Bin[] = [
  { name: "email", type: "string", value: "alice@example.com" },
  { name: "age", type: "integer", value: "29" },
  { name: "is_active", type: "boolean", value: "true" },
  { name: "tags", type: "list", value: '["early-access","beta"]' },
  { name: "profile", type: "map", value: '{"plan":"pro","seats":5}' },
]

const meta = { generation: 3, ttl: 2_592_000, lastUpdate: "2026-04-17T02:12:19Z" }

export default function RecordDetailPage({ params }: PageProps) {
  const pk = decodeURIComponent(params.key)
  return (
    <main className="flex flex-col gap-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500"
      >
        <Link
          href={clusterSections.sets(params.clusterId)}
          className="hover:text-gray-900 dark:hover:text-gray-50"
        >
          Sets
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={clusterSections.set(params.clusterId, params.namespace, params.set)}
          className="hover:text-gray-900 dark:hover:text-gray-50"
        >
          <span className="font-mono">
            {params.namespace}.{params.set}
          </span>
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-mono text-gray-900 dark:text-gray-50">{pk}</span>
      </nav>

      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">
            Record
          </span>
          <h1 className="mt-1 break-all font-mono text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
            {pk}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary">Duplicate</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="primary">Save changes</Button>
        </div>
      </header>

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-gray-500 dark:text-gray-500">Generation</dt>
          <dd className="font-mono text-sm font-medium tabular-nums text-gray-900 dark:text-gray-50">
            {meta.generation}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500 dark:text-gray-500">TTL</dt>
          <dd className="font-mono text-sm font-medium tabular-nums text-gray-900 dark:text-gray-50">
            {meta.ttl === -1 ? "never" : `${meta.ttl}s`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500 dark:text-gray-500">Last update</dt>
          <dd className="font-mono text-sm font-medium text-gray-900 dark:text-gray-50">
            {meta.lastUpdate}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500 dark:text-gray-500">Bins</dt>
          <dd className="font-mono text-sm font-medium tabular-nums text-gray-900 dark:text-gray-50">
            {bins.length}
          </dd>
        </div>
      </Card>

      <Card className="p-0">
        <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
          {bins.map((b) => (
            <li key={b.name} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start">
              <div className="min-w-40 sm:w-56">
                <p className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-50">
                  {b.name}
                </p>
                <Badge variant="neutral">{b.type}</Badge>
              </div>
              <pre className="flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-3 font-mono text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                {b.value}
              </pre>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  )
}
