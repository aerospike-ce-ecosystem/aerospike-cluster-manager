"use client"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import Link from "next/link"
import { useEffect } from "react"

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ClusterError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("cluster route error:", error)
  }, [error])

  const isDev = process.env.NODE_ENV !== "production"

  return (
    <main className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wider text-red-600 uppercase dark:text-red-400">
            Cluster error
          </span>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
            Failed to load this cluster
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            The cluster page hit an unexpected error. Try again, or return to
            the clusters list to pick a different one.
          </p>
        </div>

        {isDev && error?.message && (
          <pre className="overflow-x-auto rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        )}

        <div className="flex gap-2">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/clusters">Back to clusters</Link>
          </Button>
        </div>
      </Card>
    </main>
  )
}
