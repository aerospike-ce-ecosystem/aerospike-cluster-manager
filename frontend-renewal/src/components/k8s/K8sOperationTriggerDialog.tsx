"use client"

import { RiAlertLine } from "@remixicon/react"
import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Checkbox } from "@/components/Checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/Dialog"
import { Input } from "@/components/Input"
import { InlineAlert } from "@/components/common/InlineAlert"
import { Label } from "@/components/Label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { triggerK8sOperation } from "@/lib/api/k8s"
import type { K8sPodStatus, OperationRequest } from "@/lib/types/k8s"

type OperationKind = "WarmRestart" | "PodRestart"

interface K8sOperationTriggerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespace: string
  clusterName: string
  pods: K8sPodStatus[]
  initialSelectedPods?: string[]
  initialKind?: OperationKind
  operationPhase?: string | null
  onSuccess?: () => void
}

export function K8sOperationTriggerDialog({
  open,
  onOpenChange,
  namespace,
  clusterName,
  pods,
  initialSelectedPods = [],
  initialKind = "WarmRestart",
  operationPhase,
  onSuccess,
}: K8sOperationTriggerDialogProps) {
  const [kind, setKind] = useState<OperationKind>(initialKind)
  const [selectedPods, setSelectedPods] = useState<string[]>([])
  const [operationId, setOperationId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setKind(initialKind)
      setSelectedPods(initialSelectedPods)
      setOperationId("")
      setError(null)
    }
  }, [open, initialKind, initialSelectedPods])

  const allSelected = useMemo(
    () => pods.length > 0 && selectedPods.length === pods.length,
    [pods.length, selectedPods.length],
  )
  const someSelected = selectedPods.length > 0 && !allSelected

  const handleToggleAll = () => {
    setSelectedPods(allSelected ? [] : pods.map((p) => p.name))
  }

  const handleTogglePod = (name: string) => {
    setSelectedPods((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    )
  }

  const operationInProgress =
    operationPhase === "InProgress" || operationPhase === "Running"

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      const request: OperationRequest = {
        kind,
        ...(operationId.trim() ? { id: operationId.trim() } : {}),
        ...(selectedPods.length > 0 ? { podList: selectedPods } : {}),
      }
      await triggerK8sOperation(namespace, clusterName, request)
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Trigger cluster operation</DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Run a warm restart or pod restart on &quot;{clusterName}&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {operationInProgress && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              <RiAlertLine aria-hidden="true" className="size-4 shrink-0" />
              <span>
                An operation is already in progress. Wait for it to complete or
                clear it before triggering a new one.
              </span>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="op-kind">Operation type</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as OperationKind)}
            >
              <SelectTrigger id="op-kind">
                <SelectValue placeholder="Select operation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WarmRestart">
                  Warm Restart (rolling, no data loss)
                </SelectItem>
                <SelectItem value="PodRestart">
                  Pod Restart (delete and recreate pods)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="op-id">Operation ID (optional)</Label>
            <Input
              id="op-id"
              placeholder="Auto-generated if empty"
              value={operationId}
              onChange={(e) => setOperationId(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Target pods</Label>
              <Button
                variant="ghost"
                onClick={handleToggleAll}
                className="h-7 px-2 text-xs"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Choose specific pods. If none are selected, the operation applies
              to all pods (cluster-wide).
            </p>
            <div className="max-h-[220px] overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-gray-800">
              {pods.length === 0 ? (
                <p className="py-2 text-center text-xs text-gray-500 dark:text-gray-400">
                  No pods available
                </p>
              ) : (
                <div className="space-y-1">
                  <label className="flex cursor-pointer items-center gap-2 rounded bg-gray-50 px-2 py-1.5 text-xs font-medium dark:bg-gray-900">
                    <Checkbox
                      checked={
                        allSelected
                          ? true
                          : someSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={handleToggleAll}
                      aria-label="Select all pods"
                    />
                    All pods ({pods.length})
                  </label>
                  {pods.map((pod) => (
                    <label
                      key={pod.name}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-900/40"
                    >
                      <Checkbox
                        checked={selectedPods.includes(pod.name)}
                        onCheckedChange={() => handleTogglePod(pod.name)}
                        aria-label={`Select ${pod.name}`}
                      />
                      <span className="flex-1 truncate font-mono text-xs">
                        {pod.name}
                      </span>
                      <Badge variant={pod.isReady ? "success" : "warning"}>
                        {pod.isReady ? "Ready" : "NotReady"}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {selectedPods.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {selectedPods.length} pod
                {selectedPods.length !== 1 ? "s" : ""} selected for{" "}
                {kind === "WarmRestart" ? "warm restart" : "pod restart"}
              </p>
            )}
          </div>

          <InlineAlert message={error} />
        </div>

        <DialogFooter className="mt-6">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSubmit()}
            isLoading={loading}
            disabled={operationInProgress}
          >
            Trigger {kind === "WarmRestart" ? "warm restart" : "pod restart"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
