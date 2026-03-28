"use client";

import { useCallback, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/utils";
import { useToastStore } from "@/stores/toast-store";

interface K8sImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function K8sImportDialog({ open, onOpenChange, onSuccess }: K8sImportDialogProps) {
  const [yamlText, setYamlText] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ name: string; namespace: string; size: number } | null>(
    null,
  );

  const parseYaml = useCallback((text: string) => {
    try {
      const parsed = JSON.parse(text);
      const meta = parsed.metadata || {};
      setPreview({
        name: meta.name || "(unknown)",
        namespace: meta.namespace || "default",
        size: parsed.spec?.size || 0,
      });
      return parsed;
    } catch {
      // Try simple YAML-like parsing for basic cases
      setPreview(null);
      return null;
    }
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setYamlText(text);
        parseYaml(text);
      };
      reader.readAsText(file);
    },
    [parseYaml],
  );

  const handleImport = async () => {
    if (!yamlText.trim()) return;
    setLoading(true);
    try {
      let cr: Record<string, unknown>;
      try {
        cr = JSON.parse(yamlText);
      } catch {
        useToastStore
          .getState()
          .addToast("error", "Invalid JSON format. Please paste the CR as JSON.");
        setLoading(false);
        return;
      }
      await api.importK8sCluster({ cr });
      useToastStore.getState().addToast("success", "Cluster imported successfully");
      onOpenChange(false);
      setYamlText("");
      setPreview(null);
      onSuccess?.();
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Cluster from CR
          </DialogTitle>
          <DialogDescription>
            Paste an AerospikeCluster CR (JSON) or upload a file to create a cluster.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="cr-file">Upload CR file</Label>
            <input
              id="cr-file"
              type="file"
              accept=".json,.yaml,.yml"
              onChange={handleFileUpload}
              className="mt-1 w-full rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm shadow-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-sm file:font-medium file:text-primary"
            />
          </div>

          <div>
            <Label htmlFor="cr-text">Or paste CR JSON</Label>
            <textarea
              id="cr-text"
              value={yamlText}
              onChange={(e) => {
                setYamlText(e.target.value);
                parseYaml(e.target.value);
              }}
              placeholder='{"apiVersion": "acko.io/v1alpha1", "kind": "AerospikeCluster", ...}'
              rows={12}
              className="bg-base-200 mt-1 w-full rounded-lg border p-3 font-mono text-xs"
            />
          </div>

          {preview && (
            <div className="bg-base-200 rounded-lg p-3 text-sm">
              <p className="font-medium">Preview:</p>
              <div className="text-base-content/60 mt-1 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="font-medium">Name:</span> {preview.name}
                </div>
                <div>
                  <span className="font-medium">Namespace:</span> {preview.namespace}
                </div>
                <div>
                  <span className="font-medium">Size:</span> {preview.size}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={loading || !yamlText.trim()}>
            {loading ? "Importing..." : "Import Cluster"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
