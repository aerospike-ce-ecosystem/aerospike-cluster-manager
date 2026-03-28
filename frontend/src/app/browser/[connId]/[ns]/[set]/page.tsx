"use client";

import { use, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  RefreshCw,
} from "lucide-react";
import type { ColumnDef, ColumnPinningState, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable } from "@/components/common/data-table";
import { Select } from "@/components/ui/select";
import { renderCellValue } from "@/components/browser/record-cell-renderer";
import {
  RecordEditorDialog,
  type BinEntry,
  buildBinEntriesFromRecord,
  createEmptyBinEntry,
  parseBinValue,
} from "@/components/browser/record-editor-dialog";
import { BatchReadDialog } from "@/components/browser/batch-read-dialog";
import { FilterToolbar } from "@/components/browser/filter-toolbar";
import { useBrowserStore } from "@/stores/browser-store";
import { useFilterStore } from "@/stores/filter-store";
import { useConnectionStore } from "@/stores/connection-store";
import { useAsyncData } from "@/hooks/use-async-data";
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
import {
  buildCurrentListReturnTo,
  buildNewRecordHref,
  buildRecordDetailHref,
  buildRecordListSearchParams,
  readRecordListRouteState,
} from "@/lib/record-route-state";
import { useToastStore } from "@/stores/toast-store";

const COLUMN_PINNING: ColumnPinningState = {
  left: ["select", "rowNumber", "pk", "gen", "ttl"],
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
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    records,
    total,
    pageSize,
    loading,
    error,
    executionTimeMs,
    scannedRecords,
    totalEstimated,
    fetchFilteredRecords,
    putRecord,
    deleteRecord,
  } = useBrowserStore();

  const filterStore = useFilterStore();

  const connections = useConnectionStore((s) => s.connections);
  const currentConnection = useMemo(
    () => connections.find((c) => c.id === connId),
    [connections, connId],
  );

  const [selectedPKs, setSelectedPKs] = useState<Set<string>>(new Set());
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"duplicate">("duplicate");
  const [deleteTarget, setDeleteTarget] = useState<AerospikeRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editor form state
  const [editorPK, setEditorPK] = useState("");
  const [editorTTL, setEditorTTL] = useState("0");
  const [editorBins, setEditorBins] = useState<BinEntry[]>([createEmptyBinEntry()]);
  const [useCodeEditor, setUseCodeEditor] = useState<Record<string, boolean>>({});

  const decodedNs = decodeURIComponent(ns);
  const decodedSet = decodeURIComponent(set);
  const routeState = useMemo(
    () => readRecordListRouteState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const currentListReturnTo = useMemo(
    () => buildCurrentListReturnTo(pathname, searchParams),
    [pathname, searchParams],
  );

  // Fetch secondary indexes for this connection
  const { data: indexesData } = useAsyncData<SecondaryIndex[]>(
    () => api.getIndexes(connId),
    [connId],
  );
  const indexes = useMemo<SecondaryIndex[]>(() => indexesData ?? [], [indexesData]);

  // Reset filter store when leaving
  useEffect(() => {
    return () => {
      filterStore.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeFilters = useMemo(() => filterStore.toFilterGroup(), [filterStore]);

  useEffect(() => {
    useFilterStore.setState({
      primaryKey: routeState.primaryKey,
      logic: routeState.filters?.logic ?? "and",
      conditions: routeState.filters?.conditions ?? [],
    });
    useBrowserStore.setState({
      pageSize: routeState.pageSize,
    });
  }, [routeState.filters, routeState.pageSize, routeState.primaryKey]);

  useEffect(() => {
    fetchFilteredRecords(
      connId,
      decodedNs,
      decodedSet,
      routeState.filters,
      routeState.pageSize,
      routeState.primaryKey || undefined,
    );
  }, [
    connId,
    decodedNs,
    decodedSet,
    fetchFilteredRecords,
    routeState.filters,
    routeState.pageSize,
    routeState.primaryKey,
  ]);

  useEffect(() => {
    setSelectedPKs(new Set());
  }, [searchParams]);

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

  const replaceRouteState = useCallback(
    (nextState: {
      pageSize: number;
      primaryKey: string;
      filters?: { logic: "and" | "or"; conditions: typeof filterStore.conditions };
    }) => {
      const nextParams = buildRecordListSearchParams({
        pageSize: nextState.pageSize,
        primaryKey: nextState.primaryKey,
        filters: nextState.filters,
      });
      const query = nextParams.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      router.replace(href, { scroll: false });
    },
    // filterStore is only referenced in the TypeScript type annotation (typeof), not at runtime
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, router],
  );

  // Execute filtered query / reload
  const refreshCurrentView = useCallback(async () => {
    await fetchFilteredRecords(
      connId,
      decodedNs,
      decodedSet,
      activeFilters,
      routeState.pageSize,
      routeState.primaryKey || undefined,
    );
  }, [
    activeFilters,
    connId,
    decodedNs,
    decodedSet,
    fetchFilteredRecords,
    routeState.pageSize,
    routeState.primaryKey,
  ]);

  const handleFilterExecute = useCallback(() => {
    setSelectedPKs(new Set());
    replaceRouteState({
      pageSize: routeState.pageSize,
      primaryKey: filterStore.primaryKey.trim(),
      filters:
        filterStore.conditions.length > 0
          ? {
              logic: filterStore.logic,
              conditions: filterStore.conditions,
            }
          : undefined,
    });
  }, [
    filterStore.conditions,
    filterStore.logic,
    filterStore.primaryKey,
    replaceRouteState,
    routeState.pageSize,
  ]);

  // PK lookup
  const handlePKLookup = useCallback(
    (pk: string) => {
      setSelectedPKs(new Set());
      replaceRouteState({
        pageSize: routeState.pageSize,
        primaryKey: pk.trim(),
        filters:
          filterStore.conditions.length > 0
            ? {
                logic: filterStore.logic,
                conditions: filterStore.conditions,
              }
            : undefined,
      });
    },
    [filterStore.conditions, filterStore.logic, replaceRouteState, routeState.pageSize],
  );

  const openDuplicateEditor = useCallback((record: AerospikeRecord) => {
    const nextBins = buildBinEntriesFromRecord(record);
    setEditorMode("duplicate");
    setEditorPK("");
    setEditorTTL(String(record.meta.ttl));
    setEditorBins(nextBins.length > 0 ? nextBins : [createEmptyBinEntry()]);
    setUseCodeEditor({});
    setEditorOpen(true);
  }, []);

  const openRecordDetail = useCallback(
    (record: AerospikeRecord, intent?: "edit") => {
      router.push(
        buildRecordDetailHref({
          connId,
          namespace: decodedNs,
          setName: decodedSet,
          pk: record.key.pk,
          intent,
          returnTo: currentListReturnTo,
        }),
      );
    },
    [connId, currentListReturnTo, decodedNs, decodedSet, router],
  );

  const addBin = useCallback(() => {
    setEditorBins((prev) => [...prev, createEmptyBinEntry()]);
  }, []);

  const removeBin = useCallback((id: string) => {
    setEditorBins((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const updateBin = useCallback((id: string, field: keyof BinEntry, val: string) => {
    setEditorBins((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: val } : b)));
  }, []);

  const handleSaveRecord = async () => {
    if (!editorPK.trim()) {
      useToastStore.getState().addToast("error", "Primary key is required");
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
        refresh: refreshCurrentView,
      });
      useToastStore.getState().addToast("success", "Record duplicated");
      setEditorOpen(false);
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
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
        { refresh: refreshCurrentView },
      );
      useToastStore.getState().addToast("success", "Record deleted");
      setDeleteTarget(null);
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleLimitChange = useCallback(
    (newSize: number) => {
      replaceRouteState({
        pageSize: newSize,
        primaryKey: routeState.primaryKey,
        filters: routeState.filters,
      });
    },
    [replaceRouteState, routeState.filters, routeState.primaryKey],
  );

  // Ref so checkbox column header/cell can read the latest selectedPKs
  // without being in tableColumns useMemo deps (avoids full column rebuild on every toggle)
  const selectedPKsRef = useRef(selectedPKs);
  selectedPKsRef.current = selectedPKs;

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
    useToastStore.getState().addToast("success", "Exported as JSON");
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
    useToastStore.getState().addToast("success", "Exported as CSV");
  }, [records]);

  const { isMobile, isTablet } = useBreakpoint();

  /* ─── DataTable column definitions ─────────────────── */

  const tableMinWidth = useMemo(
    () =>
      isTablet
        ? 40 + 180 + Math.max(binColumns.length, 1) * 160 + 130
        : 40 + 56 + 180 + 70 + 170 + binColumns.length * 160 + 130,
    [binColumns.length, isTablet],
  );

  const tableColumns = useMemo<ColumnDef<AerospikeRecord, unknown>[]>(
    () => [
      // Checkbox (pinned left)
      {
        id: "select",
        size: 40,
        header: () => {
          // Read from ref so this function doesn't need selectedPKs in useMemo deps
          const pks = selectedPKsRef.current;
          return (
            <button
              onClick={toggleAllPKs}
              className={cn(
                "inline-flex h-4 w-4 items-center justify-center rounded border transition-colors",
                pks.size === displayRecords.length && displayRecords.length > 0
                  ? "border-accent bg-accent text-primary-content"
                  : pks.size > 0
                    ? "border-accent/60 bg-accent/20"
                    : "border-muted-foreground/30 hover:border-muted-foreground/50",
              )}
            >
              {pks.size === displayRecords.length && displayRecords.length > 0 ? (
                <Check className="h-3 w-3" />
              ) : pks.size > 0 ? (
                <Minus className="h-3 w-3" />
              ) : null}
            </button>
          );
        },
        cell: ({ row }) => {
          const pks = selectedPKsRef.current;
          const pk = String(row.original.key.pk);
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePK(pk);
              }}
              className={cn(
                "inline-flex h-4 w-4 items-center justify-center rounded border transition-colors",
                pks.has(pk)
                  ? "border-accent bg-accent text-primary-content"
                  : "border-muted-foreground/30 hover:border-muted-foreground/50",
              )}
            >
              {pks.has(pk) && <Check className="h-3 w-3" />}
            </button>
          );
        },
        meta: {
          headerClassName: "px-2 text-center",
          cellClassName: "px-2 text-center",
          hideOn: ["mobile"],
          mobileSlot: "meta",
        },
      },
      // Row number (pinned left)
      {
        id: "rowNumber",
        size: 44,
        header: () => <span className="grid-row-num font-mono">#</span>,
        cell: ({ row }) => <span className="grid-row-num font-mono">{row.index + 1}</span>,
        meta: {
          headerClassName: "px-4 text-right",
          cellClassName: "px-4 text-right",
          hideOn: ["mobile", "tablet"],
          mobileSlot: "meta",
        },
      },
      // PK
      {
        id: "pk",
        size: 200,
        header: () => (
          <span className="text-muted-foreground/60 font-mono text-[10px] font-semibold tracking-[0.1em] uppercase">
            PK
          </span>
        ),
        cell: ({ row }) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openRecordDetail(row.original);
            }}
            className="text-base-content hover:text-primary w-full truncate text-left font-mono text-[13px] font-medium hover:underline"
          >
            {truncateMiddle(String(row.original.key.pk), 28)}
          </button>
        ),
        meta: {
          cellClassName: "overflow-hidden",
          mobileLabel: "PK",
          mobileSlot: "title",
        },
      },
      // Generation
      {
        id: "gen",
        size: 56,
        header: () => (
          <span className="text-muted-foreground/60 font-mono text-[10px] font-semibold tracking-[0.1em] uppercase">
            Gen
          </span>
        ),
        meta: {
          hideOn: ["mobile", "tablet"],
          mobileLabel: "Generation",
          mobileSlot: "meta",
        },
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {row.original.meta.generation}
          </span>
        ),
      },
      // TTL → Expiry
      {
        id: "ttl",
        size: 120,
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
        meta: {
          hideOn: ["mobile", "tablet"],
          mobileLabel: "Expiry",
          mobileSlot: "meta",
        },
      },
      // Dynamic bin columns
      ...binColumns.map(
        (col): ColumnDef<AerospikeRecord, unknown> => ({
          id: `bin_${col}`,
          size: 140,
          header: () => (
            <span className="text-muted-foreground/60 font-mono text-[10px] font-semibold tracking-[0.1em]">
              {col}
            </span>
          ),
          cell: ({ row }) => renderCellValue(row.original.bins[col], col),
          meta: {
            cellClassName: "overflow-hidden",
            hideOn: ["mobile"],
            mobileLabel: col,
            mobileSlot: "content",
          },
        }),
      ),
      // Actions (pinned right)
      {
        id: "actions",
        size: 110,
        header: () => null,
        cell: ({ row }) => (
          <div className="row-actions-group flex items-center justify-end gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openRecordDetail(row.original);
                  }}
                  className="text-muted-foreground hover:text-base-content hover:bg-base-200/50 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                  aria-label={`View ${row.original.key.pk}`}
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
                    openRecordDetail(row.original, "edit");
                  }}
                  className="text-muted-foreground hover:text-base-content hover:bg-base-200/50 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                  aria-label={`Edit ${row.original.key.pk}`}
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
                    openDuplicateEditor(row.original);
                  }}
                  className="text-muted-foreground hover:text-base-content hover:bg-base-200/50 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                  aria-label={`Duplicate ${row.original.key.pk}`}
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
                  className="text-muted-foreground hover:text-error hover:bg-error/10 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                  aria-label={`Delete ${row.original.key.pk}`}
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
        meta: {
          headerClassName: "px-2",
          cellClassName: "px-2",
          hideOn: ["mobile"],
          mobileSlot: "actions",
        },
      },
    ],
    // selectedPKs intentionally omitted — read via selectedPKsRef to avoid
    // rebuilding all column definitions on every checkbox toggle.
    [
      binColumns,
      displayRecords.length,
      openDuplicateEditor,
      openRecordDetail,
      toggleAllPKs,
      togglePK,
    ],
  );

  const renderMobileRecordCard = useCallback(
    (row: Row<AerospikeRecord>, idx: number) => {
      const record = row.original;

      return (
        <div
          key={record.key.pk + idx}
          className="border-base-300/40 bg-base-100/60 animate-fade-in rounded-2xl border p-3 shadow-sm"
          style={{ animationDelay: `${idx * 25}ms` }}
          onClick={() => openRecordDetail(record)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openRecordDetail(record);
            }
          }}
          tabIndex={0}
          data-testid={`records-table-row-${idx}`}
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePK(String(record.key.pk));
                }}
                className={cn(
                  "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  selectedPKs.has(String(record.key.pk))
                    ? "border-accent bg-accent text-primary-content"
                    : "border-muted-foreground/30 hover:border-muted-foreground/50",
                )}
                aria-label={`Select ${record.key.pk}`}
              >
                {selectedPKs.has(String(record.key.pk)) && <Check className="h-3 w-3" />}
              </button>

              <div className="min-w-0">
                <div className="text-primary truncate font-mono text-sm font-medium">
                  {truncateMiddle(String(record.key.pk), 24)}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">
                    Gen:{" "}
                    <span className="text-base-content font-mono">{record.meta.generation}</span>
                  </span>
                  <span className="text-muted-foreground" title={`TTL: ${record.meta.ttl}s`}>
                    Expiry:{" "}
                    <span className="text-base-content font-mono">
                      {formatTTLAsExpiry(record.meta.ttl)}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div
              className="flex shrink-0 items-center gap-1"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => openRecordDetail(record)}
                className="text-muted-foreground hover:text-base-content hover:bg-base-200/50 inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                aria-label={`View ${record.key.pk}`}
              >
                <Eye className="h-4 w-4" />
              </button>
              <button
                onClick={() => openRecordDetail(record, "edit")}
                className="text-muted-foreground hover:text-base-content hover:bg-base-200/50 inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                aria-label={`Edit ${record.key.pk}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDeleteTarget(record)}
                className="text-muted-foreground hover:text-error hover:bg-error/10 inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                aria-label={`Delete ${record.key.pk}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {binColumns.length > 0 && (
            <div className="border-base-300/30 mt-2 space-y-1 border-t pt-2">
              {binColumns.slice(0, 3).map((col) => (
                <div key={col} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground/60 w-20 shrink-0 truncate font-mono">
                    {col}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {renderCellValue(record.bins[col], col)}
                  </span>
                </div>
              ))}
              {binColumns.length > 3 && (
                <span className="text-muted-foreground/50 text-[10px]">
                  +{binColumns.length - 3} more bins in details
                </span>
              )}
            </div>
          )}
        </div>
      );
    },
    [binColumns, openRecordDetail, selectedPKs, togglePK],
  );

  /* ─── Render ───────────────────────────────────────── */

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* ── Command Bar ──────────────────────────────── */}
      <div className="border-base-300/50 bg-base-100/80 border-b px-3 py-2.5 backdrop-blur-md sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <nav className="flex min-w-0 items-center gap-0.5 font-mono text-[13px]">
              <button
                onClick={() => router.push(`/browser/${connId}`)}
                className="text-muted-foreground hover:text-base-content shrink-0 transition-colors"
              >
                Namespaces
              </button>
              <span className="text-muted-foreground/30 mx-1 shrink-0 sm:mx-1.5">›</span>
              <button
                onClick={() => router.push(`/browser/${connId}`)}
                className="text-muted-foreground hover:text-base-content max-w-[60px] truncate transition-colors sm:max-w-none"
              >
                {decodedNs}
              </button>
              <span className="text-muted-foreground/30 mx-1 shrink-0 sm:mx-1.5">›</span>
              <span className="text-primary max-w-[80px] truncate font-medium sm:max-w-none">
                {decodedSet}
              </span>
            </nav>

            {total > 0 && (
              <div className="bg-accent/8 border-accent/15 flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="bg-accent absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" />
                  <span className="bg-accent relative inline-flex h-1.5 w-1.5 rounded-full" />
                </span>
                <span className="text-primary font-mono text-[11px] font-medium tabular-nums">
                  {totalEstimated ? "~" : ""}
                  {formatNumber(total)}
                </span>
              </div>
            )}
          </div>

          <Button
            onClick={() =>
              router.push(
                buildNewRecordHref({
                  connId,
                  namespace: decodedNs,
                  setName: decodedSet,
                  returnTo: currentListReturnTo,
                }),
              )
            }
            size="sm"
            variant="outline"
            className="border-accent/30 text-primary hover:bg-accent/10 hover:border-accent/50 h-8 shrink-0 gap-1.5 font-mono text-xs transition-colors sm:h-7"
            data-compact
            aria-label="New record"
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
        <div className="bg-base-100/60 animate-fade-in flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-6">
          <span className="text-muted-foreground text-xs">
            Export {formatNumber(records.length)} visible record{records.length === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJSON}
              data-compact
              className="h-7"
              aria-label="Export JSON"
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
              aria-label="Export CSV"
            >
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
          </div>
        </div>
      )}

      {/* ── Data Grid ────────────────────────────────── */}
      <div className="relative min-h-0 min-w-0 flex-1">
        <div>
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
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-content px-3 h-8 text-xs font-medium shadow-sm hover:bg-primary/90 transition-colors"
                    onClick={() =>
                      router.push(
                        buildNewRecordHref({
                          connId,
                          namespace: decodedNs,
                          setName: decodedSet,
                          returnTo: currentListReturnTo,
                        }),
                      )
                    }
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
            virtualScrolling={!isMobile}
            maxHeight="calc(100vh - 280px)"
            mobileLayout="cards"
            mobileCardRenderer={renderMobileRecordCard}
          />
        </div>
      </div>

      {/* ── Selection Toolbar ─────────────────────────── */}
      {selectedPKs.size > 0 && (
        <div className="border-accent/30 bg-accent/5 shrink-0 border-t px-3 py-2 backdrop-blur-md sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-primary font-mono text-[11px] font-medium tabular-nums">
                {selectedPKs.size} selected
              </span>
              <button
                onClick={() => setSelectedPKs(new Set())}
                className="text-muted-foreground hover:text-base-content inline-flex items-center gap-1 font-mono text-[11px] transition-colors"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            </div>
            <Button
              onClick={() => setBatchDialogOpen(true)}
              size="sm"
              variant="outline"
              className="border-accent/30 text-primary hover:bg-accent/10 hover:border-accent/50 h-7 gap-1.5 font-mono text-xs transition-colors"
              data-compact
            >
              <Code className="h-3 w-3" />
              <span>{isMobile ? "batch_read" : "Generate batch_read"}</span>
            </Button>
          </div>
        </div>
      )}

      {/* ── Bottom Bar (Limit + Reload) ─────────────── */}
      {(displayRecords.length > 0 || total > 0) && (
        <div className="gradient-border-top safe-bottom bg-base-100/90 flex w-full min-w-0 shrink-0 items-center gap-4 px-4 py-2 backdrop-blur-md sm:px-6">
          {/* Execution time */}
          {executionTimeMs > 0 && (
            <>
              <span className="text-muted-foreground font-mono text-[11px] font-medium tabular-nums">
                {executionTimeMs}ms
              </span>
              <span className="text-base-300 text-xs">|</span>
            </>
          )}

          {/* Record count */}
          <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
            <span className="text-base-content/80 font-medium">
              {formatNumber(displayRecords.length)}
            </span>
            <span className="mx-1 opacity-50">of</span>
            <span className="text-base-content/80 font-medium">
              {totalEstimated ? "~" : ""}
              {formatNumber(total)}
            </span>
          </span>

          <span className="text-base-300 hidden text-xs sm:inline">|</span>

          {/* Limit selector */}
          <Select
            value={String(pageSize)}
            onChange={(e) => handleLimitChange(parseInt(e.target.value, 10))}
            className="border-base-300/50 text-base-content/70 h-6 w-[58px] bg-transparent px-1.5 font-mono text-[11px]"
            disabled={loading}
            aria-label="Records limit"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
          </Select>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Reload button */}
          <Button
            onClick={refreshCurrentView}
            disabled={loading}
            size="sm"
            variant="outline"
            className="border-accent/25 text-primary hover:border-accent/50 hover:bg-accent/5 h-7 gap-1.5 font-mono text-[11px] transition-colors"
            data-compact
            aria-label="Reload records"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            <span className="hidden sm:inline">Reload</span>
          </Button>
        </div>
      )}

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
