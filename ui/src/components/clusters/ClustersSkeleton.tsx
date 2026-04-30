import { Card } from "@/components/Card"

export function ClustersSkeleton() {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="flex flex-col gap-4">
          <div className="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-3 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-2 h-px bg-gray-200 dark:bg-gray-800" />
          <div className="h-6 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
        </Card>
      ))}
    </section>
  )
}
