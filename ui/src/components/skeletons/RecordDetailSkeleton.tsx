import { Card } from "@/components/Card"

// RecordDetailSkeleton mirrors the record detail layout: a 4-column metadata
// strip (gen / TTL / last update / bins) on top, and a list of bin rows below.
// Used while getRecordDetail() is in flight so the user sees structure
// instead of a centered "Loading record…" string.
export function RecordDetailSkeleton({ binRows = 4 }: { binRows?: number }) {
  return (
    <>
      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          </div>
        ))}
      </Card>

      <Card className="p-0">
        <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
          {Array.from({ length: binRows }).map((_, i) => (
            <li
              key={i}
              className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start"
            >
              <div className="flex min-w-40 flex-col gap-2 sm:w-56">
                <div className="h-4 w-28 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
                <div className="h-4 w-16 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
              </div>
              <div className="flex-1">
                <div className="h-16 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
