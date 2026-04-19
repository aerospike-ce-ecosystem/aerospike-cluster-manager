"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/Button"
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
import { CE_LIMITS } from "@/lib/constants"

interface K8sScaleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clusterName: string
  currentSize: number
  onScale: (size: number) => Promise<void>
}

export function K8sScaleDialog({
  open,
  onOpenChange,
  clusterName,
  currentSize,
  onScale,
}: K8sScaleDialogProps) {
  const [size, setSize] = useState(currentSize)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSize(currentSize)
      setError(null)
    }
  }, [open, currentSize])

  const handleScale = async () => {
    setLoading(true)
    setError(null)
    try {
      await onScale(size)
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
          <DialogTitle>Scale cluster</DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Change the number of nodes for &quot;{clusterName}&quot;. Current size:{" "}
            {currentSize}.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-2">
          <Label htmlFor="scale-size">
            Cluster size (1-{CE_LIMITS.MAX_NODES})
          </Label>
          <Input
            id="scale-size"
            type="number"
            min={1}
            max={CE_LIMITS.MAX_NODES}
            value={size}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setSize(
                Math.min(
                  CE_LIMITS.MAX_NODES,
                  Math.max(1, Number.isNaN(v) ? 1 : v),
                ),
              )
              setError(null)
            }}
            disabled={loading}
          />
          {size < currentSize && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Scaling down will remove nodes. Data may be lost if not replicated.
            </p>
          )}
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
            onClick={() => void handleScale()}
            isLoading={loading}
            disabled={size === currentSize}
          >
            Scale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
