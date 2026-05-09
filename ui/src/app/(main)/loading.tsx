import { Card } from "@/components/Card"

// Route-level loading skeleton. Rendered by Next.js automatically while the
// matching segment is suspending (e.g. server components fetching data).
export default function MainLoading() {
  return (
    <main className="flex flex-col gap-6">
      <span role="status" aria-live="polite" className="sr-only">
        Loading…
      </span>

      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-6 w-64 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
      </div>

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          </div>
        ))}
      </Card>

      <Card className="p-0">
        <div className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="h-4 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-4 w-24 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
              <div className="h-4 flex-1 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
            </div>
          ))}
        </div>
      </Card>
    </main>
  )
}
