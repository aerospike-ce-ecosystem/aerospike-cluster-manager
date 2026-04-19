"use client"

import {
  RiArrowLeftLine,
  RiDeleteBin2Line,
  RiFileCopyLine,
} from "@remixicon/react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { ackoSections } from "@/app/siteConfig"
import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { InlineAlert } from "@/components/common/InlineAlert"
import { JsonViewer } from "@/components/common/JsonViewer"
import { PageHeader } from "@/components/common/PageHeader"
import { useK8sTemplateStore } from "@/stores/k8s-template-store"

// FIXME(stream-c): port inline edit dialog (K8sTemplateEditDialog) — see
// frontend/src/components/k8s/k8s-template-edit-dialog.tsx (733 lines). For now users
// must delete and re-create to change a template.

export default function TemplateDetailPage() {
  const router = useRouter()
  const params = useParams<{ name: string }>()
  const paramName = params?.name ?? ""
  const { selectedTemplate, loading, error, fetchTemplate, deleteTemplate } =
    useK8sTemplateStore()
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copyMsg, setCopyMsg] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (paramName) void fetchTemplate(paramName)
  }, [paramName, fetchTemplate])

  const handleDelete = async () => {
    setDeleting(true)
    setActionError(null)
    try {
      await deleteTemplate(paramName)
      router.push(ackoSections.templates())
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
      setShowDelete(false)
    }
  }

  const handleCopySpec = async () => {
    if (!selectedTemplate?.spec) return
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(selectedTemplate.spec, null, 2),
      )
      setCopyMsg("Spec copied to clipboard")
      setTimeout(() => setCopyMsg(null), 1500)
    } catch {
      setActionError("Failed to copy to clipboard")
    }
  }

  if (loading && !selectedTemplate) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-60 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
        <div className="h-80 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-900" />
      </div>
    )
  }

  if (!selectedTemplate) {
    return (
      <main className="flex flex-col gap-6">
        <InlineAlert message={error || "Template not found"} />
        <Button variant="secondary" asChild className="gap-1 self-start">
          <Link href={ackoSections.templates()}>
            <RiArrowLeftLine aria-hidden="true" className="size-4" />
            Back to templates
          </Link>
        </Button>
      </main>
    )
  }

  const spec = selectedTemplate.spec as Record<string, unknown>
  const status = (selectedTemplate.status || {}) as Record<string, unknown>
  const usedBy = (status.usedBy as string[] | undefined) || []
  const scheduling = spec.scheduling as Record<string, unknown> | undefined
  const monitoring = spec.monitoring as Record<string, unknown> | undefined
  const resources = spec.resources as
    | Record<string, Record<string, string>>
    | undefined

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title={selectedTemplate.name}
        description={`Cluster-scoped · Created ${selectedTemplate.age || "unknown"} ago`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" asChild className="gap-1">
              <Link href={ackoSections.templates()}>
                <RiArrowLeftLine aria-hidden="true" className="size-4" />
                Back
              </Link>
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleCopySpec()}
              className="gap-1"
            >
              <RiFileCopyLine aria-hidden="true" className="size-4" />
              Copy spec
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowDelete(true)}
              disabled={usedBy.length > 0}
              title={
                usedBy.length > 0 ? `Used by: ${usedBy.join(", ")}` : undefined
              }
              className="gap-1"
            >
              <RiDeleteBin2Line aria-hidden="true" className="size-4" />
              Delete
            </Button>
          </div>
        }
      />

      {copyMsg && <InlineAlert message={copyMsg} variant="info" />}
      <InlineAlert message={actionError || error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Overview</h3>
          <dl className="space-y-2 text-sm">
            {typeof spec.description === "string" && (
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  Description
                </dt>
                <dd>{spec.description}</dd>
              </div>
            )}
            {typeof spec.image === "string" && (
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  Image
                </dt>
                <dd className="font-mono text-xs">{spec.image}</dd>
              </div>
            )}
            {spec.size != null && (
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  Default size
                </dt>
                <dd>{String(spec.size)} nodes</dd>
              </div>
            )}
            {scheduling?.podAntiAffinityLevel != null && (
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  Anti-affinity
                </dt>
                <dd>{String(scheduling.podAntiAffinityLevel)}</dd>
              </div>
            )}
            {monitoring?.enabled === true && (
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  Monitoring
                </dt>
                <dd>Port {String(monitoring.port)}</dd>
              </div>
            )}
          </dl>
        </Card>

        {resources && (
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Resources</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  Requests
                </dt>
                <dd className="font-mono text-xs">
                  CPU: {resources.requests?.cpu || "—"} · Memory:{" "}
                  {resources.requests?.memory || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  Limits
                </dt>
                <dd className="font-mono text-xs">
                  CPU: {resources.limits?.cpu || "—"} · Memory:{" "}
                  {resources.limits?.memory || "—"}
                </dd>
              </div>
            </dl>
          </Card>
        )}

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Referenced clusters</h3>
          {usedBy.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No clusters are using this template.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {usedBy.map((cluster) => {
                const parts = cluster.split("/")
                const [ns, clusterName] =
                  parts.length === 2 ? parts : [null, cluster]
                return (
                  <li key={cluster}>
                    {ns && clusterName ? (
                      <Link
                        className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                        href={ackoSections.detail(ns, clusterName)}
                      >
                        <Badge variant="neutral">{cluster}</Badge>
                      </Link>
                    ) : (
                      <Badge variant="neutral">{cluster}</Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Full spec</h3>
        <div className="max-h-[60vh] overflow-auto rounded-md bg-gray-50 p-3 dark:bg-gray-900">
          <JsonViewer data={spec} collapsed />
        </div>
      </Card>

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete AerospikeClusterTemplate"
        description={`Are you sure you want to delete "${selectedTemplate.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </main>
  )
}
