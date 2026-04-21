"use client";

import React from "react";

import { Button } from "@/components/Button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select";
import { ApiError } from "@/lib/api/client";
import { createIndex } from "@/lib/api/indexes";
import type { SecondaryIndexType } from "@/lib/types/index";

interface CreateIndexDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  connId: string;
}

interface FormState {
  name: string;
  namespace: string;
  set: string;
  bin: string;
  binType: SecondaryIndexType;
}

const INITIAL_STATE: FormState = {
  name: "",
  namespace: "",
  set: "",
  bin: "",
  binType: "numeric",
};

const BIN_TYPE_OPTIONS: Array<{ value: SecondaryIndexType; label: string }> = [
  { value: "numeric", label: "NUMERIC" },
  { value: "string", label: "STRING" },
  { value: "geo2dsphere", label: "GEO2DSPHERE" },
];

export function CreateIndexDialog({
  open,
  onOpenChange,
  onSuccess,
  connId,
}: CreateIndexDialogProps) {
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const resetForm = () => {
    setForm(INITIAL_STATE);
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const name = form.name.trim();
    const namespace = form.namespace.trim();
    const bin = form.bin.trim();
    const set = form.set.trim();

    if (!name) {
      setError("Index name is required.");
      return;
    }
    if (!namespace) {
      setError("Namespace is required.");
      return;
    }
    if (!bin) {
      setError("Bin is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createIndex(connId, {
        name,
        namespace,
        set,
        bin,
        type: form.binType,
      });
      resetForm();
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create index.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
          <DialogHeader>
            <DialogTitle>Create secondary index</DialogTitle>
            <DialogDescription>
              Define a new secondary index on a bin within a namespace.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="idx-name">Index name</Label>
            <Input
              id="idx-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="idx_users_email"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="idx-namespace">Namespace</Label>
              <Input
                id="idx-namespace"
                value={form.namespace}
                onChange={(e) => setForm({ ...form, namespace: e.target.value })}
                placeholder="test"
                required
              />
            </div>
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="idx-set">Set (optional)</Label>
              <Input
                id="idx-set"
                value={form.set}
                onChange={(e) => setForm({ ...form, set: e.target.value })}
                placeholder="users"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="idx-bin">Bin</Label>
              <Input
                id="idx-bin"
                value={form.bin}
                onChange={(e) => setForm({ ...form, bin: e.target.value })}
                placeholder="email"
                required
              />
            </div>
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="idx-bintype">Bin type</Label>
              <Select
                value={form.binType}
                onValueChange={(value) =>
                  setForm({ ...form, binType: value as SecondaryIndexType })
                }
              >
                <SelectTrigger id="idx-bintype">
                  <SelectValue placeholder="Select bin type" />
                </SelectTrigger>
                <SelectContent>
                  {BIN_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} loadingText="Creating...">
              Create index
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateIndexDialog;
