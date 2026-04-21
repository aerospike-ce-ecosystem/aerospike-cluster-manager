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
import { ApiError } from "@/lib/api/client";
import { uploadUdf } from "@/lib/api/udfs";

interface RegisterUdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  connId: string;
}

const INITIAL_STATE = {
  filename: "",
  content: "",
};

export function RegisterUdfDialog({
  open,
  onOpenChange,
  onSuccess,
  connId,
}: RegisterUdfDialogProps) {
  const [form, setForm] = React.useState(INITIAL_STATE);
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

    const filename = form.filename.trim();
    const content = form.content;

    if (!filename) {
      setError("Filename is required.");
      return;
    }
    if (!filename.toLowerCase().endsWith(".lua")) {
      setError("Filename must end with .lua.");
      return;
    }
    if (!content.trim()) {
      setError("UDF content cannot be empty.");
      return;
    }

    setIsSubmitting(true);
    try {
      await uploadUdf(connId, { filename, content });
      resetForm();
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail || err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to register UDF.");
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
            <DialogTitle>Register UDF</DialogTitle>
            <DialogDescription>
              Upload a Lua user-defined function module to the cluster.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="udf-filename">Filename</Label>
            <Input
              id="udf-filename"
              value={form.filename}
              onChange={(e) => setForm({ ...form, filename: e.target.value })}
              placeholder="my_module.lua"
              autoFocus
              required
            />
          </div>

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="udf-content">Lua source</Label>
            <textarea
              id="udf-content"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={6}
              spellCheck={false}
              className="block w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 font-mono text-sm text-gray-900 shadow-sm outline-none transition placeholder-gray-400 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:placeholder-gray-500 dark:focus:ring-indigo-400/20"
              placeholder={`function example_fn(rec)\n  return rec.bin_name\nend`}
              required
            />
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
            <Button type="submit" isLoading={isSubmitting} loadingText="Registering...">
              Register
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default RegisterUdfDialog;
