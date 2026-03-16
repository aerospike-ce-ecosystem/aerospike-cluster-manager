"use client";

import React, { useState } from "react";
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
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/common/form-field";
import { LoadingButton } from "@/components/common/loading-button";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/utils";
import { useToastStore } from "@/stores/toast-store";

interface CreateSampleDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connId: string;
  namespaces: string[];
  onSuccess: () => void;
}

export function CreateSampleDataDialog({
  open,
  onOpenChange,
  connId,
  namespaces,
  onSuccess,
}: CreateSampleDataDialogProps) {
  const [namespace, setNamespace] = useState(namespaces[0] ?? "");
  const [setName, setSetName] = useState("sample_set");
  const [recordCount, setRecordCount] = useState("1234");
  const [createIndexes, setCreateIndexes] = useState(true);
  const [loading, setLoading] = useState(false);

  // Sync namespace when namespaces prop changes
  React.useEffect(() => {
    if (namespaces.length > 0 && !namespaces.includes(namespace)) {
      setNamespace(namespaces[0]);
    }
  }, [namespaces, namespace]);

  const handleSubmit = async () => {
    if (!namespace) {
      useToastStore.getState().addToast("error", "Namespace is required");
      return;
    }
    if (!setName.trim()) {
      useToastStore.getState().addToast("error", "Set name is required");
      return;
    }
    const count = parseInt(recordCount, 10);
    if (isNaN(count) || count < 1 || count > 10000) {
      useToastStore.getState().addToast("error", "Record count must be between 1 and 10,000");
      return;
    }

    setLoading(true);
    try {
      const result = await api.createSampleData(connId, {
        namespace,
        setName: setName.trim(),
        recordCount: count,
        createIndexes,
      });

      const parts: string[] = [`${result.recordsCreated} records`];
      if (result.indexesCreated.length > 0) {
        parts.push(`${result.indexesCreated.length} indexes`);
      }
      if (result.indexesSkipped.length > 0) {
        parts.push(`${result.indexesSkipped.length} indexes skipped`);
      }
      const elapsed = (result.elapsedMs / 1000).toFixed(1);
      useToastStore.getState().addToast("success", `Created ${parts.join(", ")} in ${elapsed}s`);

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Sample Data</DialogTitle>
          <DialogDescription>
            Generate sample records with various bin types (Integer, String, Double, Boolean, List,
            Map, GeoJSON) for testing and exploration.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <FormField id="sample-namespace" label="Namespace">
            <Select value={namespace} onChange={(e) => setNamespace(e.target.value)}>
              <option value="">Select namespace</option>
              {namespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="sample-set-name" label="Set Name">
            <Input
              placeholder="sample_set"
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
            />
          </FormField>
          <FormField id="sample-record-count" label="Record Count" hint="1 ~ 10,000 records">
            <Input
              type="number"
              placeholder="1234"
              min={1}
              max={10000}
              value={recordCount}
              onChange={(e) => setRecordCount(e.target.value)}
            />
          </FormField>
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="create-indexes"
                checked={createIndexes}
                onCheckedChange={setCreateIndexes}
              />
              <Label htmlFor="create-indexes" className="cursor-pointer text-sm font-normal">
                Create secondary indexes (5 indexes on int/str/double/bool/geojson bins)
              </Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <LoadingButton onClick={handleSubmit} loading={loading}>
            Create Sample Data
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
