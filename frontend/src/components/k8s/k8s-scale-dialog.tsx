"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/common/form-dialog";
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Scale Cluster"
      description={`Change the number of nodes for "${clusterName}". Current size: ${currentSize}.`}
      loading={loading}
      error={error}
      onSubmit={handleScale}
      submitLabel="Scale"
      disabled={size === currentSize || !!error}
      size="sm"
    >
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
    </FormDialog>
  );
}
