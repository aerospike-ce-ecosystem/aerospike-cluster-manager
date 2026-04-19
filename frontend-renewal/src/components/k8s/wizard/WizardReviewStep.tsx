"use client"

import { Badge } from "@/components/Badge"
import { Card } from "@/components/Card"
import { JsonViewer } from "@/components/common/JsonViewer"

import type { WizardStepProps } from "./types"

export function WizardReviewStep({ form }: WizardStepProps) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-sm font-semibold">Summary</h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">Name</dt>
            <dd className="font-mono">{form.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">
              Namespace
            </dt>
            <dd className="font-mono">{form.namespace || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">Size</dt>
            <dd>{form.size} node{form.size !== 1 ? "s" : ""}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">Image</dt>
            <dd className="font-mono text-xs">{form.image || "—"}</dd>
          </div>
          {form.resources && (
            <>
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  CPU
                </dt>
                <dd>
                  {form.resources.requests?.cpu ?? "—"} /{" "}
                  {form.resources.limits?.cpu ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  Memory
                </dt>
                <dd>
                  {form.resources.requests?.memory ?? "—"} /{" "}
                  {form.resources.limits?.memory ?? "—"}
                </dd>
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <dt className="text-xs text-gray-500 dark:text-gray-400">
              Namespaces
            </dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {(form.namespaces ?? []).length === 0 && (
                <span className="text-gray-500 dark:text-gray-400">None</span>
              )}
              {(form.namespaces ?? []).map((ns, i) => (
                <Badge
                  key={`${ns.name}-${i}`}
                  variant="neutral"
                  className="gap-1"
                >
                  <span className="font-mono">{ns.name || "(unnamed)"}</span>
                  <span className="text-gray-500 dark:text-gray-400">
                    rf={ns.replicationFactor ?? 1}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {ns.storageEngine?.type ?? "memory"}
                  </span>
                </Badge>
              ))}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Payload preview</h3>
        <div className="max-h-80 overflow-auto rounded-md bg-gray-50 p-3 dark:bg-gray-900">
          <JsonViewer data={form} collapsed />
        </div>
      </Card>
    </div>
  )
}
