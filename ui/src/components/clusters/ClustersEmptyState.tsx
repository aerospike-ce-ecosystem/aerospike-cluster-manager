import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import Link from "next/link"

export function ClustersEmptyState({
  onAddConnection,
}: {
  onAddConnection: () => void
}) {
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center">
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">
        No clusters yet
      </h3>
      <p className="max-w-md text-sm text-gray-500 dark:text-gray-500">
        Add a connection profile to manage an existing cluster, or create a new
        one via ACKO.
      </p>
      <div className="flex gap-2 pt-2">
        <Button variant="secondary" onClick={onAddConnection}>
          Add Connection
        </Button>
        <Button variant="primary" asChild>
          <Link href="/clusters/new">Create Cluster</Link>
        </Button>
      </div>
    </Card>
  )
}
