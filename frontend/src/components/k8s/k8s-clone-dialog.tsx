"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/common/form-dialog";
import { getErrorMessage } from "@/lib/utils";
import { api } from "@/lib/api/client";

interface K8sCloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceNamespace: string;
  sourceName: string;
  onCloned?: (namespace: string, name: string) => void;
}

export function K8sCloneDialog({
  open,
  onOpenChange,
  sourceNamespace,
  sourceName,
  onCloned,
}: K8sCloneDialogProps) {
  const [cloneName, setCloneName] = useState("");
  const [cloneNamespace, setCloneNamespace] = useState(sourceNamespace);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCloneName(`${sourceName}-clone`);
      setCloneNamespace(sourceNamespace);
      setError(null);
    }
  }, [open, sourceName, sourceNamespace]);

  const isValid = cloneName.trim().length > 0 && cloneNamespace.trim().length > 0;

  const handleClone = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.cloneK8sCluster(sourceNamespace, sourceName, {
        name: cloneName.trim(),
        namespace: cloneNamespace.trim() !== sourceNamespace ? cloneNamespace.trim() : undefined,
      });
      onOpenChange(false);
      onCloned?.(cloneNamespace.trim(), cloneName.trim());
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
      title="Clone Cluster"
      description={`Create a copy of "${sourceName}" with a new name. The spec will be copied; operations and paused state will not.`}
      loading={loading}
      error={error}
      onSubmit={handleClone}
      submitLabel="Clone"
      disabled={!isValid}
      size="sm"
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="clone-name">New Cluster Name</Label>
          <Input
            id="clone-name"
            value={cloneName}
            onChange={(e) => setCloneName(e.target.value)}
            placeholder="my-cluster-clone"
            autoFocus
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="clone-namespace">Namespace</Label>
          <Input
            id="clone-namespace"
            value={cloneNamespace}
            onChange={(e) => setCloneNamespace(e.target.value)}
            placeholder={sourceNamespace}
          />
        </div>
      </div>
    </FormDialog>
  );
}
