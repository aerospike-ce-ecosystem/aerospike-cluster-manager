"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { InlineAlert } from "@/components/common/inline-alert";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordDetailSections } from "@/components/browser/record-view-dialog";
import {
  RecordEditorFields,
  type BinEntry,
  buildBinEntriesFromRecord,
  createEmptyBinEntry,
  parseBinValue,
} from "@/components/browser/record-editor-dialog";
import type { AerospikeRecord, BinValue, RecordWriteRequest } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { buildDefaultReturnTo, resolveReturnTo } from "@/lib/record-route-state";
import { getErrorMessage } from "@/lib/utils";
import { useToastStore } from "@/stores/toast-store";

interface RecordDetailPageProps {
  connId: string;
  namespace: string;
  setName: string;
  pk?: string;
  initialIntent?: "edit";
  returnTo?: string;
  createMode?: boolean;
}

type PageMode = "view" | "edit";

interface EditorSnapshot {
  pk: string;
  ttl: string;
  bins: Array<Pick<BinEntry, "name" | "type" | "value">>;
}

function buildEditorSnapshot(pk: string, ttl: string, bins: BinEntry[]): EditorSnapshot {
  return {
    pk: pk.trim(),
    ttl: ttl.trim(),
    bins: bins.map(({ name, type, value }) => ({
      name: name.trim(),
      type,
      value: value.trim(),
    })),
  };
}

export function RecordDetailPage({
  connId,
  namespace,
  setName,
  pk,
  initialIntent,
  returnTo,
  createMode = false,
}: RecordDetailPageProps) {
  const router = useRouter();
  const defaultReturnTo = useMemo(
    () => buildDefaultReturnTo(connId, namespace, setName),
    [connId, namespace, setName],
  );
  const targetReturnTo = useMemo(
    () => resolveReturnTo(returnTo, defaultReturnTo),
    [defaultReturnTo, returnTo],
  );

  const [record, setRecord] = useState<AerospikeRecord | null>(null);
  const [loading, setLoading] = useState(!createMode);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<PageMode>(
    createMode || initialIntent === "edit" ? "edit" : "view",
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const [editorPK, setEditorPK] = useState("");
  const [editorSetName, setEditorSetName] = useState(createMode ? "" : setName);
  const [editorTTL, setEditorTTL] = useState("0");
  const [editorBins, setEditorBins] = useState<BinEntry[]>([createEmptyBinEntry()]);
  const [useCodeEditor, setUseCodeEditor] = useState<Record<string, boolean>>({});
  const [initialSnapshot, setInitialSnapshot] = useState<EditorSnapshot>(() =>
    buildEditorSnapshot("", "0", [createEmptyBinEntry()]),
  );

  const resetEditorForCreate = useCallback(() => {
    const nextBins = [createEmptyBinEntry()];
    const snapshot = buildEditorSnapshot("", "0", nextBins);
    setRecord(null);
    setEditorPK("");
    setEditorTTL("0");
    setEditorBins(nextBins);
    setUseCodeEditor({});
    setInitialSnapshot(snapshot);
  }, []);

  const resetEditorFromRecord = useCallback((nextRecord: AerospikeRecord) => {
    const nextBins = buildBinEntriesFromRecord(nextRecord);
    const snapshot = buildEditorSnapshot(nextRecord.key.pk, String(nextRecord.meta.ttl), nextBins);
    setRecord(nextRecord);
    setEditorPK(nextRecord.key.pk);
    setEditorTTL(String(nextRecord.meta.ttl));
    setEditorBins(nextBins.length > 0 ? nextBins : [createEmptyBinEntry()]);
    setUseCodeEditor({});
    setInitialSnapshot(snapshot);
  }, []);

  useEffect(() => {
    if (createMode) {
      resetEditorForCreate();
      setMode("edit");
      setLoading(false);
      setError(null);
      return;
    }

    if (!pk?.trim()) {
      setLoading(false);
      setError("Primary key is required");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getRecord(connId, namespace, setName, pk.trim())
      .then((nextRecord) => {
        if (cancelled) return;
        resetEditorFromRecord(nextRecord);
        setMode(initialIntent === "edit" ? "edit" : "view");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    connId,
    createMode,
    initialIntent,
    namespace,
    pk,
    resetEditorForCreate,
    resetEditorFromRecord,
    setName,
  ]);

  const isDirty = useMemo(() => {
    return (
      JSON.stringify(buildEditorSnapshot(editorPK, editorTTL, editorBins)) !==
      JSON.stringify(initialSnapshot)
    );
  }, [editorBins, editorPK, editorTTL, initialSnapshot]);

  const addBin = useCallback(() => {
    setEditorBins((prev) => [...prev, createEmptyBinEntry()]);
  }, []);

  const removeBin = useCallback((id: string) => {
    setEditorBins((prev) => prev.filter((bin) => bin.id !== id));
  }, []);

  const updateBin = useCallback((id: string, field: keyof BinEntry, value: string) => {
    setEditorBins((prev) => prev.map((bin) => (bin.id === id ? { ...bin, [field]: value } : bin)));
  }, []);

  const navigateBack = useCallback(() => {
    router.push(targetReturnTo);
  }, [router, targetReturnTo]);

  const handleBack = useCallback(() => {
    if (mode === "edit" && isDirty) {
      setDiscardConfirmOpen(true);
      return;
    }

    navigateBack();
  }, [isDirty, mode, navigateBack]);

  const handleSave = useCallback(async () => {
    if (!editorPK.trim()) {
      useToastStore.getState().addToast("error", "Primary key is required");
      return;
    }

    const targetSet = createMode ? editorSetName.trim() : setName;
    if (createMode && !targetSet) {
      useToastStore.getState().addToast("error", "Set name is required");
      return;
    }

    setSaving(true);
    try {
      const bins: Record<string, BinValue> = {};
      for (const bin of editorBins) {
        if (bin.name.trim()) {
          bins[bin.name.trim()] = parseBinValue(bin.value, bin.type);
        }
      }

      const payload: RecordWriteRequest = {
        key: { namespace, set: targetSet, pk: editorPK.trim() },
        bins,
        ttl: Number.parseInt(editorTTL, 10) || 0,
      };

      await api.putRecord(connId, payload);
      useToastStore
        .getState()
        .addToast("success", createMode ? "Record created" : "Record updated");
      navigateBack();
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [connId, createMode, editorBins, editorPK, editorSetName, editorTTL, namespace, navigateBack, setName]);

  const handleDelete = useCallback(async () => {
    if (!record) return;

    setDeleting(true);
    try {
      await api.deleteRecord(connId, record.key.namespace, record.key.set, record.key.pk);
      useToastStore.getState().addToast("success", "Record deleted");
      navigateBack();
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }, [connId, navigateBack, record]);

  const displaySetName = createMode ? editorSetName || setName : setName;
  const description = useMemo(
    () => (
      <span className="font-mono text-xs">
        {namespace}
        <span className="text-muted-foreground/30 mx-1">.</span>
        {displaySetName}
        {!createMode && editorPK && (
          <>
            <span className="text-muted-foreground/30 mx-1">/</span>
            <span className="text-primary">{editorPK}</span>
          </>
        )}
      </span>
    ),
    [createMode, displaySetName, editorPK, namespace],
  );

  if (loading) {
    return (
      <div className="animate-fade-in space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    );
  }

  if (!createMode && !record) {
    return (
      <div className="animate-fade-in space-y-6 p-6 lg:p-8">
        <PageHeader
          title="Record Detail"
          description={description}
          actions={
            <Button variant="outline" size="sm" onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          }
        />
        <InlineAlert message={error || "Record not found"} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 p-6 lg:p-8">
      <PageHeader
        title={createMode ? "New Record" : mode === "edit" ? "Edit Record" : "Record Detail"}
        description={description}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleBack} disabled={saving || deleting}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {mode === "edit" ? "Cancel" : "Back"}
            </Button>

            {mode === "view" && record && (
              <>
                <Button variant="outline" size="sm" onClick={() => setMode("edit")}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </>
            )}

            {mode === "edit" && (
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : createMode ? (
                  <Plus className="mr-2 h-4 w-4" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {createMode ? "Create" : "Save"}
              </Button>
            )}
          </>
        }
      />

      <InlineAlert message={error} />

      {mode === "view" && record ? (
        <div className="bg-base-100 rounded-xl border">
          <RecordDetailSections record={record} />
        </div>
      ) : (
        <div className="bg-base-100 rounded-xl border">
          <RecordEditorFields
            mode={createMode ? "create" : "edit"}
            pk={editorPK}
            onPKChange={setEditorPK}
            ttl={editorTTL}
            onTTLChange={setEditorTTL}
            bins={editorBins}
            onAddBin={addBin}
            onRemoveBin={removeBin}
            onUpdateBin={updateBin}
            useCodeEditor={useCodeEditor}
            onToggleCodeEditor={(id) => setUseCodeEditor((prev) => ({ ...prev, [id]: !prev[id] }))}
            saving={saving}
            record={record}
            namespace={namespace}
            setName={createMode ? editorSetName : setName}
            onSetNameChange={createMode ? setEditorSetName : undefined}
          />
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Record"
        description={`Are you sure you want to delete record with PK "${record?.key.pk}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />

      <ConfirmDialog
        open={discardConfirmOpen}
        onOpenChange={setDiscardConfirmOpen}
        title="Discard Changes"
        description="You have unsaved changes. Leave this page and discard them?"
        confirmLabel="Discard"
        cancelLabel="Stay"
        variant="default"
        onConfirm={navigateBack}
      />
    </div>
  );
}
