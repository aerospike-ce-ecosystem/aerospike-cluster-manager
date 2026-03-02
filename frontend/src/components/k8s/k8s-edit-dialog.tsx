"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { LoadingButton } from "@/components/common/loading-button";
import { getErrorMessage } from "@/lib/utils";
import type { K8sClusterDetail, UpdateK8sClusterRequest } from "@/lib/api/types";

interface K8sEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cluster: K8sClusterDetail;
  onSave: (data: UpdateK8sClusterRequest) => Promise<void>;
}

export function K8sEditDialog({ open, onOpenChange, cluster, onSave }: K8sEditDialogProps) {
  const [image, setImage] = useState("");
  const [size, setSize] = useState(1);
  const [enableDynamicConfig, setEnableDynamicConfig] = useState(false);
  const [aerospikeConfigText, setAerospikeConfigText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // Derive initial values from the cluster spec
  const initialImage = cluster.image;
  const initialSize = cluster.size;
  const initialEnableDynamicConfig = Boolean(cluster.spec?.enableDynamicConfigUpdate);
  const initialAerospikeConfig = useMemo(
    () => (cluster.spec?.aerospikeConfig as Record<string, unknown>) ?? {},
    [cluster.spec?.aerospikeConfig],
  );
  const initialAerospikeConfigText = useMemo(
    () => JSON.stringify(initialAerospikeConfig, null, 2),
    [initialAerospikeConfig],
  );

  // Reset form state when the dialog opens
  useEffect(() => {
    if (open) {
      setImage(initialImage);
      setSize(initialSize);
      setEnableDynamicConfig(initialEnableDynamicConfig);
      setAerospikeConfigText(initialAerospikeConfigText);
      setError(null);
      setConfigError(null);
    }
  }, [open, initialImage, initialSize, initialEnableDynamicConfig, initialAerospikeConfigText]);

  // Validate JSON on every keystroke
  useEffect(() => {
    if (!aerospikeConfigText.trim()) {
      setConfigError(null);
      return;
    }
    try {
      JSON.parse(aerospikeConfigText);
      setConfigError(null);
    } catch {
      setConfigError("Invalid JSON");
    }
  }, [aerospikeConfigText]);

  const hasChanges =
    image !== initialImage ||
    size !== initialSize ||
    enableDynamicConfig !== initialEnableDynamicConfig ||
    aerospikeConfigText !== initialAerospikeConfigText;

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const data: UpdateK8sClusterRequest = {};

      if (size !== initialSize) {
        data.size = size;
      }
      if (image !== initialImage) {
        data.image = image;
      }
      if (enableDynamicConfig !== initialEnableDynamicConfig) {
        data.enableDynamicConfig = enableDynamicConfig;
      }
      if (aerospikeConfigText !== initialAerospikeConfigText) {
        const parsed = JSON.parse(aerospikeConfigText) as Record<string, unknown>;
        data.aerospikeConfig = parsed;
      }

      await onSave(data);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Cluster</DialogTitle>
          <DialogDescription>
            Modify the configuration for &quot;{cluster.name}&quot;. Only changed fields will be
            applied.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Image */}
          <div className="grid gap-2">
            <Label htmlFor="edit-image">Image</Label>
            <Input
              id="edit-image"
              value={image}
              onChange={(e) => {
                setImage(e.target.value);
                setError(null);
              }}
              placeholder="aerospike:ce-8.1.1.1"
              disabled={loading}
            />
          </div>

          {/* Size */}
          <div className="grid gap-2">
            <Label htmlFor="edit-size">Cluster Size (1-8)</Label>
            <Input
              id="edit-size"
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
            {size < initialSize && (
              <p className="text-warning text-sm">
                Scaling down will remove nodes. Data may be lost if not replicated.
              </p>
            )}
          </div>

          {/* Enable Dynamic Config */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-dynamic-config"
              checked={enableDynamicConfig}
              onCheckedChange={(checked) => {
                setEnableDynamicConfig(checked);
                setError(null);
              }}
              disabled={loading}
            />
            <Label htmlFor="edit-dynamic-config" className="cursor-pointer">
              Enable Dynamic Config Update
            </Label>
          </div>

          {/* Aerospike Config */}
          <div className="grid gap-2">
            <Label htmlFor="edit-aerospike-config">Aerospike Config (JSON)</Label>
            <Textarea
              id="edit-aerospike-config"
              value={aerospikeConfigText}
              onChange={(e) => {
                setAerospikeConfigText(e.target.value);
                setError(null);
              }}
              rows={12}
              className="font-mono text-xs"
              placeholder='{"service": {...}, "network": {...}, "namespaces": [...]}'
              disabled={loading}
            />
            {configError && <p className="text-destructive text-sm">{configError}</p>}
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <LoadingButton
            onClick={handleSave}
            loading={loading}
            disabled={!hasChanges || loading || !!configError}
          >
            Save Changes
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
