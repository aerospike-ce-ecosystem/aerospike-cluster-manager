"use client"

import { RiAlertLine, RiDeleteBin2Line } from "@remixicon/react"
import { useState } from "react"

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
import { InlineAlert } from "@/components/common/InlineAlert"
import { Label } from "@/components/Label"

interface K8sDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clusterName: string
  namespace: string
  /** When present, a linked connection profile will also be deleted if the user keeps the default. */
  connectionId?: string | null
  /** Delete the AerospikeCluster CR. */
  onDeleteCluster: () => Promise<void>
  /** Delete the linked connection profile. Only invoked when connectionId is truthy and the user opts in. */
  onDeleteConnection?: (connectionId: string) => Promise<void>
}

export function K8sDeleteDialog({
  open,
  onOpenChange,
  clusterName,
  namespace,
  connectionId,
  onDeleteCluster,
  onDeleteConnection,
}: K8sDeleteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConnectionToo, setDeleteConnectionToo] = useState(true)

  const handleConfirm = async () => {
    setLoading(true)
    setError(null)
    try {
      await onDeleteCluster()
      if (connectionId && deleteConnectionToo && onDeleteConnection) {
        await onDeleteConnection(connectionId)
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <RiAlertLine aria-hidden="true" className="size-5" />
            Delete cluster
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            This will destroy all data in the cluster. This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3 text-sm">
          <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/30">
            <p className="font-medium text-red-900 dark:text-red-200">
              The following will be deleted:
            </p>
            <ul className="mt-2 space-y-1.5 text-red-800 dark:text-red-300">
              <li className="flex items-center gap-2">
                <RiDeleteBin2Line aria-hidden="true" className="size-4 shrink-0" />
                <span>
                  <span className="font-semibold">AerospikeCluster</span>{" "}
                  <code className="font-mono text-xs">
                    {namespace}/{clusterName}
                  </code>
                </span>
              </li>
              {connectionId && onDeleteConnection && (
                <li className="flex items-center gap-2">
                  <Checkbox
                    id="delete-connection"
                    checked={deleteConnectionToo}
                    onCheckedChange={(c) => setDeleteConnectionToo(c === true)}
                  />
                  <Label htmlFor="delete-connection" className="text-sm">
                    <span className="font-semibold">Connection profile</span>{" "}
                    <code className="font-mono text-xs">{connectionId}</code>
                  </Label>
                </li>
              )}
            </ul>
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
            variant="destructive"
            onClick={() => void handleConfirm()}
            isLoading={loading}
          >
            Delete cluster
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
