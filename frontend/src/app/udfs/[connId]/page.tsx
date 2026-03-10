"use client";

import { use, useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Trash2, Eye, Play, Upload, FileCode, RefreshCw } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { InlineAlert } from "@/components/common/inline-alert";
import { LoadingButton } from "@/components/common/loading-button";
import { PageHeader } from "@/components/common/page-header";
import { LazyCodeEditor as CodeEditor } from "@/components/common/code-editor-lazy";
import { api } from "@/lib/api/client";
import type { UDFModule } from "@/lib/api/types";
import { truncateMiddle } from "@/lib/formatters";
import { sanitizeFilename, sanitizeInput } from "@/lib/sanitize";
import { getErrorMessage } from "@/lib/utils";
import { useToastStore } from "@/stores/toast-store";

export default function UDFsPage({ params }: { params: Promise<{ connId: string }> }) {
  const { connId } = use(params);
  const [udfs, setUdfs] = useState<UDFModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFilename, setUploadFilename] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [uploading, setUploading] = useState(false);

  // View source dialog
  const [viewSource, setViewSource] = useState<UDFModule | null>(null);

  // Apply UDF dialog
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyModule, setApplyModule] = useState("");
  const [applyNs, setApplyNs] = useState("");
  const [applySet, setApplySet] = useState("");
  const [applyPK, setApplyPK] = useState("");
  const [applyFunction, setApplyFunction] = useState("");
  const [applyArgs, setApplyArgs] = useState("[]");
  const [applying, setApplying] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<UDFModule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUDFs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getUDFs(connId);
      setUdfs(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [connId]);

  useEffect(() => {
    fetchUDFs();
  }, [fetchUDFs]);

  const handleUpload = async () => {
    if (!uploadFilename.trim() || !uploadContent.trim()) {
      useToastStore.getState().addToast("error", "Filename and content are required");
      return;
    }
    setUploading(true);
    try {
      await api.uploadUDF(connId, {
        filename: sanitizeFilename(uploadFilename.trim()),
        content: uploadContent,
      });
      useToastStore.getState().addToast("success", "UDF uploaded");
      setUploadOpen(false);
      setUploadFilename("");
      setUploadContent("");
      await fetchUDFs();
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".lua";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      setUploadFilename(sanitizeFilename(file.name));
      setUploadContent(text);
      setUploadOpen(true);
    };
    input.click();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteUDF(connId, deleteTarget.filename);
      useToastStore.getState().addToast("success", "UDF deleted");
      setDeleteTarget(null);
      await fetchUDFs();
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleApply = async () => {
    if (!applyNs.trim() || !applyPK.trim() || !applyFunction.trim()) {
      useToastStore.getState().addToast("error", "Namespace, PK, and function name are required");
      return;
    }
    setApplying(true);
    try {
      let args;
      try {
        args = JSON.parse(applyArgs);
      } catch {
        useToastStore.getState().addToast("error", "Invalid JSON for arguments");
        setApplying(false);
        return;
      }
      // Sanitize user inputs to prevent AQL injection
      const safePK = sanitizeInput(applyPK);
      const safeFunction = sanitizeInput(applyFunction);
      // Use the terminal API to apply the UDF since there's no direct apply endpoint
      const command = `execute ${applyModule}.${safeFunction}(${JSON.stringify(args)}) on ${applyNs}.${applySet || ""} where PK = '${safePK}'`;
      await api.executeCommand(connId, command);
      useToastStore.getState().addToast("success", "UDF applied successfully");
      setApplyOpen(false);
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setApplying(false);
    }
  };

  const openApplyDialog = useCallback((udf: UDFModule) => {
    setApplyModule(udf.filename.replace(/\.lua$/, ""));
    setApplyNs("");
    setApplySet("");
    setApplyPK("");
    setApplyFunction("");
    setApplyArgs("[]");
    setApplyOpen(true);
  }, []);

  const udfColumns = useMemo<ColumnDef<UDFModule>[]>(
    () => [
      {
        accessorKey: "filename",
        header: "Filename",
        cell: ({ getValue }) => (
          <span className="font-mono font-medium">{getValue() as string}</span>
        ),
        meta: { mobileSlot: "title", mobileLabel: "Module" },
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ getValue }) => <Badge variant="secondary">{getValue() as string}</Badge>,
        meta: { mobileSlot: "meta" },
      },
      {
        accessorKey: "hash",
        header: "Hash",
        cell: ({ getValue }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {truncateMiddle(getValue() as string, 24)}
          </span>
        ),
        meta: { hideOn: ["mobile"], mobileSlot: "content", mobileLabel: "Hash" },
      },
      {
        id: "actions",
        header: "Actions",
        size: 160,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setViewSource(row.original)}
              aria-label="View source"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => openApplyDialog(row.original)}
              aria-label="Apply UDF"
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-error h-8 w-8 p-0"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete UDF"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        meta: { mobileSlot: "actions" },
      },
    ],

    [openApplyDialog],
  );

  return (
    <div className="animate-fade-in space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="UDF Modules"
        description="Manage User-Defined Functions (Lua scripts)"
        actions={
          <>
            <Button variant="neutral" size="sm" onClick={fetchUDFs}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="warning" size="sm" onClick={handleFileInput}>
              <Upload className="mr-2 h-4 w-4" />
              Upload File
            </Button>
            <Button
              variant="success"
              onClick={() => {
                setUploadFilename("");
                setUploadContent("");
                setUploadOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              New UDF
            </Button>
          </>
        }
      />

      <InlineAlert message={error} />

      {/* Table */}
      <DataTable
        data={udfs}
        columns={udfColumns}
        loading={loading}
        emptyState={
          !error ? (
            <EmptyState
              icon={FileCode}
              title="No UDF modules"
              description="Upload a Lua script to register a User-Defined Function."
              action={
                <Button onClick={handleFileInput}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File
                </Button>
              }
            />
          ) : undefined
        }
        className="rounded-lg border"
        testId="udfs-table"
        mobileLayout="cards"
      />

      {/* Upload / Paste Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="flex max-h-[80vh] max-w-[95vw] flex-col sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Upload UDF Module</DialogTitle>
            <DialogDescription>Provide a Lua script filename and content.</DialogDescription>
          </DialogHeader>
          <div className="grid flex-1 gap-4 overflow-hidden py-2">
            <div className="grid gap-2">
              <Label>Filename</Label>
              <Input
                placeholder="my_module.lua"
                value={uploadFilename}
                onChange={(e) => setUploadFilename(e.target.value)}
              />
            </div>
            <div className="grid min-h-0 flex-1 gap-2">
              <Label>Source Code</Label>
              <div className="h-[300px] overflow-hidden rounded-md border">
                <CodeEditor
                  value={uploadContent}
                  onChange={(v) => setUploadContent(v)}
                  language="lua"
                  height="300px"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>
              Cancel
            </Button>
            <LoadingButton
              onClick={handleUpload}
              disabled={uploading || !uploadFilename.trim() || !uploadContent.trim()}
              loading={uploading}
            >
              Upload
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Source Dialog */}
      <Dialog open={!!viewSource} onOpenChange={(open) => !open && setViewSource(null)}>
        <DialogContent className="flex max-h-[80vh] max-w-[95vw] flex-col sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>{viewSource?.filename}</DialogTitle>
            <DialogDescription>Read-only view of the UDF source code.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
            <CodeEditor
              value={viewSource?.content ?? "-- Source not available"}
              readOnly
              language="lua"
              height="400px"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Apply UDF Dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Apply UDF</DialogTitle>
            <DialogDescription>Execute {applyModule} on a specific record.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Namespace</Label>
              <Input
                placeholder="test"
                value={applyNs}
                onChange={(e) => setApplyNs(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Set</Label>
              <Input
                placeholder="demo"
                value={applySet}
                onChange={(e) => setApplySet(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Primary Key</Label>
              <Input
                placeholder="key1"
                value={applyPK}
                onChange={(e) => setApplyPK(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Function Name</Label>
              <Input
                placeholder="my_function"
                value={applyFunction}
                onChange={(e) => setApplyFunction(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Arguments (JSON array)</Label>
              <Textarea
                placeholder='["arg1", 42]'
                value={applyArgs}
                onChange={(e) => setApplyArgs(e.target.value)}
                rows={3}
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)} disabled={applying}>
              Cancel
            </Button>
            <LoadingButton
              onClick={handleApply}
              disabled={applying || !applyNs.trim() || !applyPK.trim() || !applyFunction.trim()}
              loading={applying}
            >
              Apply
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete UDF"
        description={`Are you sure you want to delete "${deleteTarget?.filename}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
