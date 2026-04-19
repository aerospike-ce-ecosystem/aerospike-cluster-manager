"use client"

import {
  RiAlertLine,
  RiArrowLeftLine,
  RiDeleteBin2Line,
  RiExpandLeftRightLine,
  RiRefreshLine,
} from "@remixicon/react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { InlineAlert } from "@/components/common/InlineAlert"
import { JsonViewer } from "@/components/common/JsonViewer"
import { PageHeader } from "@/components/common/PageHeader"
import { K8sClusterStatusBadge, TRANSITIONAL_PHASES } from "@/components/k8s/K8sClusterStatusBadge"
import { K8sDeleteDialog } from "@/components/k8s/K8sDeleteDialog"
import { K8sEventTimeline } from "@/components/k8s/K8sEventTimeline"
import { K8sOperationStatus } from "@/components/k8s/K8sOperationStatus"
import { K8sOperationTriggerDialog } from "@/components/k8s/K8sOperationTriggerDialog"
import { K8sPodTable } from "@/components/k8s/K8sPodTable"
import { K8sScaleDialog } from "@/components/k8s/K8sScaleDialog"
import { PauseResumeButton } from "@/components/k8s/PauseResumeButton"
import { deleteConnection } from "@/lib/api/connections"
import {
  clearK8sOperations,
  deleteK8sCluster,
  forceReconcileK8sCluster,
  getK8sCluster,
  listK8sClusterEvents,
  resetCircuitBreaker,
  scaleK8sCluster,
} from "@/lib/api/k8s"
import { cx } from "@/lib/utils"
import type { K8sClusterDetail, K8sClusterEvent } from "@/lib/types/k8s"

interface ClusterDetailLayoutProps {
  namespace: string
  name: string
  /** Where to navigate after a successful delete. */
  onDeletedHref?: string
  /** Hide the "Back to ACKO clusters" button (used when embedded inside a cluster drill-down tab). */
  hideBackButton?: boolean
}

export function ClusterDetailLayout({
  namespace,
  name,
  onDeletedHref,
  hideBackButton,
}: ClusterDetailLayoutProps) {
  const [cluster, setCluster] = useState<K8sClusterDetail | null>(null)
  const [events, setEvents] = useState<K8sClusterEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [scaleOpen, setScaleOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [operationDialogOpen, setOperationDialogOpen] = useState(false)
  const [operationDialogKind, setOperationDialogKind] = useState<
    "WarmRestart" | "PodRestart"
  >("WarmRestart")
  const [selectedPods, setSelectedPods] = useState<string[]>([])

  const refetchAll = useCallback(async () => {
    setRefreshing(true)
    try {
      const [detail, evts] = await Promise.all([
        getK8sCluster(namespace, name),
        listK8sClusterEvents(namespace, name).catch(() => [] as K8sClusterEvent[]),
      ])
      setCluster(detail)
      setEvents(evts)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [namespace, name])

  useEffect(() => {
    setLoading(true)
    void refetchAll()
  }, [refetchAll])

  // Auto-refresh during transitional phases.
  useEffect(() => {
    if (!cluster?.phase) return
    const isTransitional = (TRANSITIONAL_PHASES as string[]).includes(cluster.phase)
    if (!isTransitional) return
    const id = setInterval(() => {
      void refetchAll()
    }, 5000)
    return () => clearInterval(id)
  }, [cluster?.phase, refetchAll])

  const operationInProgress =
    cluster?.operationStatus?.phase === "InProgress" ||
    cluster?.operationStatus?.phase === "Running"

  const handleScale = async (size: number) => {
    try {
      await scaleK8sCluster(namespace, name, { size })
      await refetchAll()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  const handleDeleteCluster = async () => {
    await deleteK8sCluster(namespace, name)
    if (onDeletedHref && typeof window !== "undefined") {
      window.location.href = onDeletedHref
    }
  }

  const handleDeleteConnection = async (connectionId: string) => {
    await deleteConnection(connectionId)
  }

  const handleForceReconcile = async () => {
    setActionError(null)
    try {
      await forceReconcileK8sCluster(namespace, name)
      await refetchAll()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleResetCircuitBreaker = async () => {
    setActionError(null)
    try {
      await resetCircuitBreaker(namespace, name)
      await refetchAll()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  if (loading && !cluster) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-60 animate-pulse rounded bg-gray-100 dark:bg-gray-900" />
        <div className="h-40 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-900" />
        <div className="h-80 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-900" />
      </div>
    )
  }

  if (!cluster) {
    return (
      <div className="space-y-4">
        <InlineAlert message={error ?? "Cluster not found"} />
        {!hideBackButton && onDeletedHref && (
          <Button variant="secondary" asChild className="gap-1">
            <Link href={onDeletedHref}>
              <RiArrowLeftLine aria-hidden="true" className="size-4" />
              Back
            </Link>
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={cluster.name}
        description={
          <span className="font-mono text-xs">
            {cluster.namespace} · {cluster.image}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {!hideBackButton && onDeletedHref && (
              <Button variant="ghost" asChild className="gap-1">
                <Link href={onDeletedHref}>
                  <RiArrowLeftLine aria-hidden="true" className="size-4" />
                  Back
                </Link>
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => void refetchAll()}
              isLoading={refreshing}
              className="gap-1"
            >
              <RiRefreshLine aria-hidden="true" className="size-4" />
              Refresh
            </Button>
            <Button
              variant="secondary"
              onClick={() => setScaleOpen(true)}
              className="gap-1"
            >
              <RiExpandLeftRightLine aria-hidden="true" className="size-4" />
              Scale
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setOperationDialogKind("WarmRestart")
                setOperationDialogOpen(true)
              }}
              disabled={operationInProgress}
            >
              Warm restart
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setOperationDialogKind("PodRestart")
                setOperationDialogOpen(true)
              }}
              disabled={operationInProgress}
            >
              Pod restart
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleForceReconcile()}
            >
              Force reconcile
            </Button>
            <PauseResumeButton
              namespace={namespace}
              name={name}
              phase={cluster.phase}
              onDone={() => void refetchAll()}
              onError={setActionError}
            />
            <Button
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              className="gap-1"
            >
              <RiDeleteBin2Line aria-hidden="true" className="size-4" />
              Delete
            </Button>
          </div>
        }
      />

      <InlineAlert message={error} />
      <InlineAlert message={actionError} />

      {cluster.splitBrainDetected && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <RiAlertLine aria-hidden="true" className="size-4 shrink-0" />
          <div>
            <p className="font-medium">Split-brain detected</p>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Aerospike cluster size ({cluster.aerospikeClusterSize ?? "?"})
              differs from expected pod count ({cluster.size}). Nodes may not be
              forming a single cluster.
            </p>
          </div>
        </div>
      )}

      {/* Overview stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Status
          </p>
          <div className="mt-2">
            <K8sClusterStatusBadge phase={cluster.phase} />
          </div>
          {cluster.phaseReason && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {cluster.phaseReason}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Size
          </p>
          <p className="mt-2 text-2xl font-bold">{cluster.size}</p>
          {cluster.aerospikeClusterSize != null &&
            cluster.aerospikeClusterSize !== cluster.size && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                AS cluster-size: {cluster.aerospikeClusterSize}
              </p>
            )}
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Image
          </p>
          <p className="mt-2 truncate font-mono text-sm" title={cluster.image}>
            {cluster.image}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Age
          </p>
          <p className="mt-2 text-2xl font-bold">{cluster.age ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Failed reconciles
          </p>
          <p
            className={cx(
              "mt-2 text-2xl font-bold",
              cluster.failedReconcileCount > 0
                ? "text-red-600 dark:text-red-400"
                : "text-gray-900 dark:text-gray-50",
            )}
          >
            {cluster.failedReconcileCount}
          </p>
          {cluster.failedReconcileCount > 0 && (
            <button
              type="button"
              className="mt-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
              onClick={() => void handleResetCircuitBreaker()}
            >
              Reset circuit breaker
            </button>
          )}
        </Card>
      </div>

      {/* Operation status */}
      {cluster.operationStatus && (
        <K8sOperationStatus
          operationStatus={cluster.operationStatus}
          totalPodCount={cluster.pods.length}
          onClear={async () => {
            await clearK8sOperations(namespace, name)
            await refetchAll()
          }}
        />
      )}

      {/* Conditions */}
      {cluster.conditions && cluster.conditions.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Conditions</h3>
          <div className="space-y-2">
            {cluster.conditions.map((cond) => (
              <div
                key={cond.type}
                className="flex items-center justify-between rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cx(
                      "size-2 rounded-full",
                      cond.status === "True"
                        ? "bg-emerald-500"
                        : "bg-gray-300 dark:bg-gray-700",
                    )}
                  />
                  <span className="font-medium">{cond.type}</span>
                </div>
                <div className="flex items-center gap-4 text-gray-500 dark:text-gray-400">
                  {cond.reason && <span>{cond.reason}</span>}
                  {cond.message && (
                    <span
                      className="max-w-xs truncate"
                      title={cond.message}
                    >
                      {cond.message}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Reconciliation health (simplified) */}
      {/* FIXME(stream-c): port full K8sReconciliationHealth card (backoff timer, last error) —
          see frontend/src/components/k8s/k8s-reconciliation-health.tsx (259 lines). */}
      {(cluster.lastReconcileError || cluster.lastReconcileTime) && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Reconciliation health</h3>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {cluster.lastReconcileTime && (
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  Last reconcile
                </dt>
                <dd className="mt-0.5 font-mono text-xs">
                  {cluster.lastReconcileTime}
                </dd>
              </div>
            )}
            {cluster.operatorVersion && (
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  Operator version
                </dt>
                <dd className="mt-0.5 font-mono text-xs">
                  {cluster.operatorVersion}
                </dd>
              </div>
            )}
            {cluster.lastReconcileError && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-red-600 dark:text-red-400">
                  Last reconcile error
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap rounded bg-red-50 p-2 font-mono text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {cluster.lastReconcileError}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {/* Config drift (simplified) */}
      {/* FIXME(stream-c): port full K8sConfigDriftCard (per-pod spec hash grouping,
          diff of changedFields) — see frontend/src/components/k8s/k8s-config-drift-card.tsx. */}
      {cluster.pendingRestartPods.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Config drift</h3>
            <Badge variant="warning">
              {cluster.pendingRestartPods.length} pending restart
            </Badge>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Some pods are awaiting a restart to apply the desired spec.
          </p>
          <ul className="mt-3 space-y-0.5">
            {cluster.pendingRestartPods.map((pod) => (
              <li key={pod} className="font-mono text-xs">
                {pod}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Pods */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Pods</h3>
        <K8sPodTable
          pods={cluster.pods}
          selectable
          selectedPods={selectedPods}
          onSelectionChange={setSelectedPods}
        />
      </Card>

      {/* Events */}
      {events.length > 0 && <K8sEventTimeline events={events} />}

      {/* Spec viewer */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Spec</h3>
        <div className="max-h-80 overflow-auto rounded-md bg-gray-50 p-3 dark:bg-gray-900">
          <JsonViewer data={cluster.spec} collapsed />
        </div>
      </Card>

      {/* Dialogs */}
      <K8sScaleDialog
        open={scaleOpen}
        onOpenChange={setScaleOpen}
        clusterName={cluster.name}
        currentSize={cluster.size}
        onScale={handleScale}
      />

      <K8sDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        clusterName={cluster.name}
        namespace={cluster.namespace}
        connectionId={cluster.connectionId ?? null}
        onDeleteCluster={handleDeleteCluster}
        onDeleteConnection={handleDeleteConnection}
      />

      <K8sOperationTriggerDialog
        open={operationDialogOpen}
        onOpenChange={setOperationDialogOpen}
        namespace={namespace}
        clusterName={name}
        pods={cluster.pods}
        initialSelectedPods={selectedPods}
        initialKind={operationDialogKind}
        operationPhase={cluster.operationStatus?.phase ?? undefined}
        onSuccess={() => {
          setSelectedPods([])
          void refetchAll()
        }}
      />
    </div>
  )
}
