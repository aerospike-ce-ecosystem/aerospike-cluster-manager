"use client";

import React from "react";

import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/Dialog";
import { Input } from "@/components/Input";
import { Label } from "@/components/Label";
import { ApiError } from "@/lib/api/client";
import { createSampleData } from "@/lib/api/sample-data";

const MAX_RECORDS = 10_000;

interface CreateSampleDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connId: string;
  namespaces: string[];
  defaultNamespace?: string;
  onSuccess?: (summary: {
    recordsCreated: number;
    indexesCreated: number;
    indexesSkipped: number;
    elapsedMs: number;
  }) => void;
}

export function CreateSampleDataDialog({
  open,
  onOpenChange,
  connId,
  namespaces,
  defaultNamespace,
  onSuccess,
}: CreateSampleDataDialogProps) {
  const [namespace, setNamespace] = React.useState(
    defaultNamespace ?? namespaces[0] ?? "",
  );
  const [setName, setSetName] = React.useState("sample_set");
  const [recordCount, setRecordCount] = React.useState("1234");
  const [createIndexes, setCreateIndexes] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setNamespace(defaultNamespace ?? namespaces[0] ?? "");
    setSetName("sample_set");
    setRecordCount("1234");
    setCreateIndexes(true);
    setError(null);
  }, [open, defaultNamespace, namespaces]);

  const handleSubmit = async () => {
    setError(null);
    if (!namespace) {
      setError("Namespace is required");
      return;
    }
    const name = setName.trim();
    if (!name) {
      setError("Set name is required");
      return;
    }
    const count = Number.parseInt(recordCount, 10);
    if (!Number.isFinite(count) || count < 1 || count > MAX_RECORDS) {
      setError(`Record count must be between 1 and ${MAX_RECORDS.toLocaleString()}`);
      return;
    }

    setLoading(true);
    try {
      const result = await createSampleData(connId, {
        namespace,
        setName: name,
        recordCount: count,
        createIndexes,
      });
      onOpenChange(false);
      onSuccess?.({
        recordsCreated: result.recordsCreated,
        indexesCreated: result.indexesCreated.length,
        indexesSkipped: result.indexesSkipped.length,
        elapsedMs: result.elapsedMs,
      });
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail || err.message);
      else if (err instanceof Error) setError(err.message);
      else setError("Failed to create sample data");
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
            Generate sample records with varied bin types (int / string / double / bool / list /
            map / geojson) for testing and exploration.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sd-namespace">Namespace</Label>
            <select
              id="sd-namespace"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Select namespace</option>
              {namespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sd-set">Set Name</Label>
            <Input
              id="sd-set"
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              placeholder="sample_set"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sd-count">
              Record Count{" "}
              <span className="text-xs text-gray-500">
                (1 ~ {MAX_RECORDS.toLocaleString()})
              </span>
            </Label>
            <Input
              id="sd-count"
              type="number"
              min={1}
              max={MAX_RECORDS}
              value={recordCount}
              onChange={(e) => setRecordCount(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2">
            <Checkbox
              id="sd-indexes"
              checked={createIndexes}
              onCheckedChange={(v) => setCreateIndexes(v === true)}
            />
            <Label htmlFor="sd-indexes" className="cursor-pointer text-sm">
              Create secondary indexes (5 indexes on int/str/double/bool/geojson bins)
            </Label>
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} isLoading={loading} loadingText="Creating…">
            Create Sample Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
