"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/common/loading-button";
import { InlineAlert } from "@/components/common/inline-alert";
import { getErrorMessage } from "@/lib/utils";

interface K8sScaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterName: string;
  currentSize: number;
  onScale: (size: number) => Promise<void>;
}

export function K8sScaleDialog({
  open,
  onOpenChange,
  clusterName,
  currentSize,
  onScale,
}: K8sScaleDialogProps) {
  const [size, setSize] = useState(currentSize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSize(currentSize);
      setError(null);
    }
  }, [open, currentSize]);

  const handleScale = async () => {
    setLoading(true);
    setError(null);
    try {
      await onScale(size);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Scale Cluster</DialogTitle>
          <DialogDescription>
            Change the number of nodes for &quot;{clusterName}&quot;. Current size: {currentSize}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="scale-size">Cluster Size (1-8)</Label>
            <Input
              id="scale-size"
              type="number"
              min={1}
              max={8}
              value={size}
              onChange={(e) => {
                setSize(Math.min(8, Math.max(1, parseInt(e.target.value) || 1)));
                setError(null);
              }}
              disabled={loading}
            />
          </div>
          {size < currentSize && (
            <p className="text-warning text-sm">
              Scaling down will remove nodes. Data may be lost if not replicated.
            </p>
          )}
          <InlineAlert message={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <LoadingButton
            onClick={handleScale}
            loading={loading}
            disabled={size === currentSize || loading || !!error}
          >
            Scale
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
