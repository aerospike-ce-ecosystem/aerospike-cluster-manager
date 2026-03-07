"use client";

import { use, useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  Copy,
  Database,
  Code,
  Check,
  Minus,
  X,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";
import type { ColumnDef, ColumnPinningState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable } from "@/components/common/data-table";
import { TablePagination } from "@/components/common/table-pagination";
import { renderCellValue } from "@/components/browser/record-cell-renderer";
import { RecordViewDialog } from "@/components/browser/record-view-dialog";
import {
  RecordEditorDialog,
  type BinEntry,
  parseBinValue,
  detectBinType,
  serializeBinValue,
} from "@/components/browser/record-editor-dialog";
import { BatchReadDialog } from "@/components/browser/batch-read-dialog";
import { FilterToolbar } from "@/components/browser/filter-toolbar";
import { useBrowserStore } from "@/stores/browser-store";
import { useFilterStore } from "@/stores/filter-store";
import { useConnectionStore } from "@/stores/connection-store";
import { usePagination } from "@/hooks/use-pagination";
import type {
  AerospikeRecord,
  BinValue,
  RecordWriteRequest,
  SecondaryIndex,
} from "@/lib/api/types";
import { PAGE_SIZE_OPTIONS } from "@/lib/constants";
import { cn, getErrorMessage } from "@/lib/utils";
import { truncateMiddle, formatNumber, formatTTLAsExpiry } from "@/lib/formatters";
import { detectBinTypes } from "@/lib/bin-type-detector";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

const COLUMN_PINNING: ColumnPinningState = {
  left: ["select", "rowNumber"],
  right: ["actions"],
};

/* ─── Page Component ─────────────────────────────────── */

export default function BrowserPage({
  params,
}: {
  params: Promise<{ connId: string; ns: string; set: string }>;
}) {
  const { connId, ns, set } = use(params);
  const router = useRouter();

  const {
    records,
    total,
    page,
    pageSize,
    loading,
    error,
    executionTimeMs,
    scannedRecords,
    fetchFilteredRecords,
    putRecord,
    deleteRecord,
    setPage,
    setPageSize,
  } = useBrowserStore();

  const filterStore = useFilterStore();

  const pagination = usePagination({ total, page, pageSize });

  const connections = useConnectionStore((s) => s.connections);
  const currentConnection = useMemo(
    () => connections.find((c) => c.id === connId),
    [connections, connId],
  );

  const [selectedPKs, setSelectedPKs] = useState<Set<string>>(new Set());
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);

  const [viewRecord, setViewRecord] = useState<AerospikeRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | "duplicate">("create");
  const [deleteTarget, setDeleteTarget] = useState<AerospikeRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editor form state
  const [editorPK, setEditorPK] = useState("");
  const [editorTTL, setEditorTTL] = useState("0");
  const [editorBins, setEditorBins] = useState<BinEntry[]>([
    { id: crypto.randomUUID(), name: "", value: "", type: "string" },
  ]);
  const [useCodeEditor, setUseCodeEditor] = useState<Record<string, boolean>>({});

  const decodedNs = decodeURIComponent(ns);
  const decodedSet = decodeURIComponent(set);

  // Fetch secondary indexes for this connection
  const [indexes, setIndexes] = useState<SecondaryIndex[]>([]);
  useEffect(() => {
    api
      .getIndexes(connId)
      .then(setIndexes)
      .catch(() => setIndexes([]));
  }, [connId]);

  // Initial fetch
  useEffect(() => {
    fetchFilteredRecords(connId, decodedNs, decodedSet);
  }, [connId, decodedNs, decodedSet, fetchFilteredRecords]);

  // Reset filter store when leaving
  useEffect(() => {
    return () => {
      filterStore.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayRecords = records;
  const displayLoading = loading;

  // Detect dynamic bin columns from active records
  const binColumns = useMemo(() => {
    const allBins = new Set<string>();
    displayRecords.forEach((r) => {
      Object.keys(r.bins).forEach((b) => allBins.add(b));
    });
    return Array.from(allBins).sort();
  }, [displayRecords]);

  // Auto-detect bin types for the filter toolbar
  const binTypeHints = useMemo(() => detectBinTypes(displayRecords), [displayRecords]);

  // Only bins with secondary indexes on this namespace/set are filterable
  const indexedBinSet = useMemo(() => {
    const set_ = new Map<string, SecondaryIndex>();
    for (const idx of indexes) {
      if (idx.namespace === decodedNs && idx.set === decodedSet && idx.state === "ready") {
        set_.set(idx.bin, idx);
      }
    }
    return set_;
  }, [indexes, decodedNs, decodedSet]);

  // Build available bins from index metadata (not from current records, which may be empty after filtering)
  const availableBins = useMemo(
    () =>
      Array.from(indexedBinSet.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, idx]) => {
          const indexType =
            idx.type === "numeric" ? "integer" : idx.type === "geo2dsphere" ? "geo" : idx.type;
          return {
            name,
            type: binTypeHints[name] ?? (indexType as import("@/lib/api/types").BinDataType),
          };
        }),
    [binTypeHints, indexedBinSet],
  );

  // Execute filtered query
  const refreshCurrentView = useCallback(
    async (currentPage: number, currentPageSize: number, primaryKeyOverride?: string) => {
      const filters = filterStore.toFilterGroup();
      const primaryKey = primaryKeyOverride ?? (filterStore.primaryKey.trim() || undefined);
      await fetchFilteredRecords(
        connId,
        decodedNs,
        decodedSet,
        filters,
        currentPage,
        currentPageSize,
        primaryKey,
      );
    },
    [connId, decodedNs, decodedSet, filterStore, fetchFilteredRecords],
  );

  const handleFilterExecute = useCallback(() => {
    setSelectedPKs(new Set());
    refreshCurrentView(1, pageSize);
  }, [pageSize, refreshCurrentView]);

  // PK lookup
  const handlePKLookup = useCallback(
    (pk: string) => {
      setSelectedPKs(new Set());
      refreshCurrentView(1, pageSize, pk);
    },
    [pageSize, refreshCurrentView],
  );

  const openEditor = useCallback(
    (mode: "create" | "edit" | "duplicate", record?: AerospikeRecord) => {
      setEditorMode(mode);
      if (record && (mode === "edit" || mode === "duplicate")) {
        setEditorPK(mode === "duplicate" ? "" : record.key.pk);
        setEditorTTL(String(record.meta.ttl));
        setEditorBins(
          Object.entries(record.bins).map(([name, value]) => ({
            id: crypto.randomUUID(),
            name,
            value: serializeBinValue(value),
            type: detectBinType(value),
          })),
        );
      } else {
        setEditorPK("");
        setEditorTTL("0");
        setEditorBins([{ id: crypto.randomUUID(), name: "", value: "", type: "string" }]);
      }
      setUseCodeEditor({});
      setEditorOpen(true);
    },
    [],
  );

  const addBin = useCallback(() => {
    setEditorBins((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", value: "", type: "string" },
    ]);
  }, []);

  const removeBin = useCallback((id: string) => {
    setEditorBins((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const updateBin = useCallback((id: string, field: keyof BinEntry, val: string) => {
    setEditorBins((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: val } : b)));
  }, []);

  const handleSaveRecord = async () => {
    if (!editorPK.trim()) {
      toast.error("Primary key is required");
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
      const data: RecordWriteRequest = {
        key: { namespace: decodedNs, set: decodedSet, pk: editorPK.trim() },
        bins,
        ttl: parseInt(editorTTL, 10) || 0,
      };
      await putRecord(connId, data, {
        refresh: () => refreshCurrentView(page, pageSize),
      });
      toast.success(
        editorMode === "create"
          ? "Record created"
          : editorMode === "duplicate"
            ? "Record duplicated"
            : "Record updated",
      );
      setEditorOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRecord(
        connId,
        deleteTarget.key.namespace,
        deleteTarget.key.set,
        deleteTarget.key.pk,
        { refresh: () => refreshCurrentView(page, pageSize) },
      );
      toast.success("Record deleted");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
      refreshCurrentView(newPage, pageSize);
    },
    [pageSize, refreshCurrentView, setPage],
  );

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      setPageSize(newSize);
      refreshCurrentView(1, newSize);
    },
    [refreshCurrentView, setPageSize],
  );

  const togglePK = useCallback((pk: string) => {
    setSelectedPKs((prev) => {
      const next = new Set(prev);
      if (next.has(pk)) next.delete(pk);
      else next.add(pk);
      return next;
    });
  }, []);

  const toggleAllPKs = useCallback(() => {
    setSelectedPKs((prev) => {
      if (prev.size === displayRecords.length) return new Set();
      return new Set(displayRecords.map((r) => String(r.key.pk)));
    });
  }, [displayRecords]);

  const generateBatchReadCode = useCallback(() => {
    const selected = displayRecords.filter((r) => selectedPKs.has(String(r.key.pk)));
    const host = currentConnection?.hosts?.[0] ?? "127.0.0.1";
    const port = currentConnection?.port ?? 3000;
    const keysStr = selected
      .map((r) => `        ("${decodedNs}", "${decodedSet}", "${r.key.pk}")`)
      .join(",\n");

    return `import asyncio
import aerospike_py as aerospike

async def main():
    client = aerospike.AsyncClient({"hosts": [("${host}", ${port})]})
    await client.connect()

    keys = [
${keysStr},
    ]

    batch = await client.batch_read(keys)

    for br in batch.batch_records:
        if br.record:
            print(br.record.bins)
        else:
            print(f"Failed to read key: {br.key}")

    await client.close()

asyncio.run(main())`;
  }, [displayRecords, selectedPKs, decodedNs, decodedSet, currentConnection]);

  // Export handlers for current records
  const handleExportJSON = useCallback(() => {
    const data = records.map((r) => ({
      key: r.key,
      meta: r.meta,
      bins: r.bins,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `records-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported as JSON");
  }, [records]);

  const handleExportCSV = useCallback(() => {
    if (records.length === 0) return;
    const binNames = new Set<string>();
    records.forEach((r) => Object.keys(r.bins).forEach((b) => binNames.add(b)));
    const headers = ["pk", "generation", "ttl", ...Array.from(binNames)];
    const rows = records.map((r) => [
      r.key.pk,
      r.meta.generation,
      r.meta.ttl,
      ...Array.from(binNames).map((b) => {
        const val = r.bins[b];
        if (val === null || val === undefined) return "";
        if (typeof val === "object") return JSON.stringify(val);
        return String(val);
      }),
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `records-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported as CSV");
  }, [records]);

  const padLength = String(pagination.end).length;
  const { isDesktop } = useBreakpoint();

  /* ─── DataTable column definitions ─────────────────── */

  const tableMinWidth = useMemo(
    () => 40 + 56 + 180 + 70 + 80 + binColumns.length * 160 + 130,
    [binColumns.length],
  );

  const tableColumns = useMemo<ColumnDef<AerospikeRecord, unknown>[]>(
    () => [
      // Checkbox (pinned left)
      {
        id: "select",
        size: 40,
        header: () => (
          <button
            onClick={toggleAllPKs}
            className={cn(
              "inline-flex h-4 w-4 items-center justify-center rounded border transition-colors",
              selectedPKs.size === displayRecords.length && displayRecords.length > 0
                ? "border-accent bg-accent text-accent-foreground"
                : selectedPKs.size > 0
                  ? "border-accent/60 bg-accent/20"
                  : "border-muted-foreground/30 hover:border-muted-foreground/50",
            )}
          >
            {selectedPKs.size === displayRecords.length && displayRecords.length > 0 ? (
              <Check className="h-3 w-3" />
            ) : selectedPKs.size > 0 ? (
              <Minus className="h-3 w-3" />
            ) : null}
          </button>
        ),
        cell: ({ row }) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePK(String(row.original.key.pk));
            }}
            className={cn(
              "inline-flex h-4 w-4 items-center justify-center rounded border transition-colors",
              selectedPKs.has(String(row.original.key.pk))
                ? "border-accent bg-accent text-accent-foreground"
                : "border-muted-foreground/30 hover:border-muted-foreground/50",
            )}
          >
            {selectedPKs.has(String(row.original.key.pk)) && <Check className="h-3 w-3" />}
          </button>
        ),
        meta: { className: "px-2 text-center" },
      },
      // Row number (pinned left)
      {
        id: "rowNumber",
        size: 56,
        header: () => <span className="grid-row-num font-mono">#</span>,
        cell: ({ row }) => (
          <span className="grid-row-num font-mono">
            {String(pagination.start + row.index).padStart(padLength, "0")}
          </span>
        ),
        meta: { className: "px-4 text-right" },
      },
      // PK
      {
        id: "pk",
        size: 180,
        header: () => (
          <span className="text-muted-foreground/60 font-mono text-[10px] font-semibold tracking-[0.1em] uppercase">
            PK
          </span>
        ),
        cell: ({ row }) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setViewRecord(row.original);
            }}
            className="text-foreground hover:text-accent w-full truncate text-left font-mono text-[13px] font-medium hover:underline"
          >
            {truncateMiddle(String(row.original.key.pk), 28)}
          </button>
        ),
        meta: { className: "overflow-hidden" },
      },
      // Generation
      {
        id: "gen",
        size: 70,
        header: () => (
          <span className="text-muted-foreground/60 font-mono text-[10px] font-semibold tracking-[0.1em] uppercase">
            Gen
          </span>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {row.original.meta.generation}
          </span>
        ),
      },
      // TTL → Expiry
      {
        id: "ttl",
        size: 170,
        header: () => (
          <span className="text-muted-foreground/60 font-mono text-[10px] font-semibold tracking-[0.1em] uppercase">
            Expiry
          </span>
        ),
        cell: ({ row }) => {
          const ttl = row.original.meta.ttl;
          return (
            <span className="text-muted-foreground/60 font-mono text-xs" title={`TTL: ${ttl}s`}>
              {formatTTLAsExpiry(ttl)}
            </span>
          );
        },
      },
      // Dynamic bin columns
      ...binColumns.map(
        (col): ColumnDef<AerospikeRecord, unknown> => ({
          id: `bin_${col}`,
          size: 160,
          header: () => (
            <span className="text-muted-foreground/60 font-mono text-[10px] font-semibold tracking-[0.1em]">
              {col}
            </span>
          ),
          cell: ({ row }) => renderCellValue(row.original.bins[col]),
          meta: { className: "overflow-hidden" },
        }),
      ),
      // Actions (pinned right)
      {
        id: "actions",
        size: 130,
        header: () => null,
        cell: ({ row }) => (
          <div className="row-actions-group flex items-center justify-end gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewRecord(row.original);
                  }}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted/50 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span className="font-mono text-[10px]">View</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditor("edit", row.original);
                  }}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted/50 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span className="font-mono text-[10px]">Edit</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditor("duplicate", row.original);
                  }}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted/50 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span className="font-mono text-[10px]">Duplicate</span>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(row.original);
                  }}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span className="font-mono text-[10px]">Delete</span>
              </TooltipContent>
            </Tooltip>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      binColumns,
      selectedPKs,
      displayRecords.length,
      toggleAllPKs,
      togglePK,
      pagination.start,
      padLength,
    ],
  );

  /* ─── Render ───────────────────────────────────────── */

  return (
    <div className="flex h-full flex-col">
      {/* ── Command Bar ──────────────────────────────── */}
      <div className="border-border/50 bg-card/80 border-b px-3 py-2.5 backdrop-blur-md sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <nav className="flex min-w-0 items-center gap-0.5 font-mono text-[13px]">
              <button
                onClick={() => router.push(`/browser/${connId}`)}
                className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
              >
                Namespaces
              </button>
              <span className="text-muted-foreground/30 mx-1 shrink-0 sm:mx-1.5">›</span>
              <button
                onClick={() => router.push(`/browser/${connId}`)}
                className="text-muted-foreground hover:text-foreground max-w-[60px] truncate transition-colors sm:max-w-none"
              >
                {decodedNs}
              </button>
              <span className="text-muted-foreground/30 mx-1 shrink-0 sm:mx-1.5">›</span>
              <span className="text-accent max-w-[80px] truncate font-medium sm:max-w-none">
                {decodedSet}
              </span>
            </nav>

            {total > 0 && (
              <div className="bg-accent/8 border-accent/15 flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="bg-accent absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" />
                  <span className="bg-accent relative inline-flex h-1.5 w-1.5 rounded-full" />
                </span>
                <span className="text-accent font-mono text-[11px] font-medium tabular-nums">
                  {formatNumber(total)}
                </span>
              </div>
            )}
          </div>

          <Button
            onClick={() => openEditor("create")}
            size="sm"
            variant="outline"
            className="border-accent/30 text-accent hover:bg-accent/10 hover:border-accent/50 h-8 shrink-0 gap-1.5 font-mono text-xs transition-colors sm:h-7"
            data-compact
          >
            <Plus className="h-3 w-3" />
            <span className="hidden sm:inline">new record</span>
          </Button>
        </div>
      </div>

      {/* ── Filter Toolbar ─────────────────────────────── */}
      <FilterToolbar
        connId={connId}
        namespace={decodedNs}
        set={decodedSet}
        availableBins={availableBins}
        onExecute={handleFilterExecute}
        onPKLookup={handlePKLookup}
        loading={loading}
        error={error}
        stats={
          filterStore.conditions.length > 0
            ? { executionTimeMs, scannedRecords, returnedRecords: total }
            : undefined
        }
      />

      {/* ── Export bar (when filters active) ─────────── */}
      {filterStore.conditions.length > 0 && records.length > 0 && (
        <div className="bg-card/60 animate-fade-in flex items-center justify-end gap-2 border-b px-3 py-1.5 sm:px-6">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJSON}
            data-compact
            className="h-7"
          >
            <FileJson className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">JSON</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            data-compact
            className="h-7"
          >
            <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
        </div>
      )}

      {/* ── Data Grid ────────────────────────────────── */}
      <div className="relative flex-1 overflow-auto">
        {!isDesktop && displayRecords.length > 0 ? (
          <>
            {/* Loading indicator (page navigation) */}
            {displayLoading && (
              <div className="bg-accent/10 sticky top-0 right-0 left-0 z-20 h-[2px] overflow-hidden">
                <div className="loading-bar bg-accent h-full w-1/4 rounded-full" />
              </div>
            )}
            {/* Mobile card view */}
            <div className="space-y-2 p-3">
              {displayRecords.map((record, idx) => (
                <div
                  key={record.key.pk + idx}
                  className="border-border/40 bg-card/60 animate-fade-in rounded-lg border p-3"
                  style={{ animationDelay: `${idx * 25}ms` }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => togglePK(String(record.key.pk))}
                        className={cn(
                          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                          selectedPKs.has(String(record.key.pk))
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-muted-foreground/30 hover:border-muted-foreground/50",
                        )}
                      >
                        {selectedPKs.has(String(record.key.pk)) && <Check className="h-3 w-3" />}
                      </button>
                      <span className="text-accent font-mono text-sm font-medium">
                        {truncateMiddle(String(record.key.pk), 24)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setViewRecord(record)}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted/50 inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openEditor("edit", record)}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted/50 inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(record)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-muted-foreground">
                      Gen:{" "}
                      <span className="text-foreground font-mono">{record.meta.generation}</span>
                    </span>
                    <span className="text-muted-foreground" title={`TTL: ${record.meta.ttl}s`}>
                      Expiry:{" "}
                      <span className="text-foreground font-mono">
                        {formatTTLAsExpiry(record.meta.ttl)}
                      </span>
                    </span>
                  </div>
                  {binColumns.length > 0 && (
                    <div className="border-border/30 mt-2 space-y-1 border-t pt-2">
                      {binColumns.slice(0, 3).map((col) => (
                        <div key={col} className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground/60 w-20 shrink-0 truncate font-mono">
                            {col}
                          </span>
                          <span className="min-w-0 truncate">
                            {renderCellValue(record.bins[col])}
                          </span>
                        </div>
                      ))}
                      {binColumns.length > 3 && (
                        <span className="text-muted-foreground/50 text-[10px]">
                          +{binColumns.length - 3} more bins
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <TooltipProvider delayDuration={300}>
            <DataTable
              data={displayRecords}
              columns={tableColumns}
              loading={displayLoading}
              emptyState={
                filterStore.conditions.length > 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Database className="text-muted-foreground/30 mb-4 h-16 w-16" />
                    <h3 className="text-base-content/70 mb-2 text-lg font-semibold">No Results</h3>
                    <p className="text-base-content/50 max-w-md text-sm">
                      No records match the current filters. Try adjusting or clearing the filters.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Database className="text-muted-foreground/30 mb-4 h-16 w-16" />
                    <h3 className="text-base-content/70 mb-2 text-lg font-semibold">
                      No Records Found
                    </h3>
                    <p className="text-base-content/50 mb-6 max-w-md text-sm">
                      This set appears to be empty. Create a new record to get started.
                    </p>
                    <button
                      className="btn btn-primary btn-sm gap-2"
                      onClick={() => openEditor("create")}
                    >
                      <Plus className="h-4 w-4" />
                      Create Record
                    </button>
                  </div>
                )
              }
              enableColumnPinning
              columnPinning={COLUMN_PINNING}
              tableMinWidth={tableMinWidth}
              testId="records-table"
            />
          </TooltipProvider>
        )}
      </div>

      {/* ── Selection Toolbar ─────────────────────────── */}
      {selectedPKs.size > 0 && (
        <div className="border-accent/30 bg-accent/5 border-t px-3 py-2 backdrop-blur-md sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-accent font-mono text-[11px] font-medium tabular-nums">
                {selectedPKs.size} selected
              </span>
              <button
                onClick={() => setSelectedPKs(new Set())}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-mono text-[11px] transition-colors"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            </div>
            <Button
              onClick={() => setBatchDialogOpen(true)}
              size="sm"
              variant="outline"
              className="border-accent/30 text-accent hover:bg-accent/10 hover:border-accent/50 h-7 gap-1.5 font-mono text-xs transition-colors"
              data-compact
            >
              <Code className="h-3 w-3" />
              Generate batch_read
            </Button>
          </div>
        </div>
      )}

      {/* ── Bottom Bar ───────────────────────────────── */}
      <TablePagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        loading={loading}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
      />

      <RecordViewDialog record={viewRecord} onClose={() => setViewRecord(null)} />

      <RecordEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mode={editorMode}
        namespace={decodedNs}
        set={decodedSet}
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
        onSave={handleSaveRecord}
      />

      <BatchReadDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        selectedCount={selectedPKs.size}
        generateCode={generateBatchReadCode}
      />

      {/* ── Delete Confirmation ──────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Record"
        description={`Are you sure you want to delete record with PK "${deleteTarget?.key.pk}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteRecord}
        loading={deleting}
      />
    </div>
  );
}
