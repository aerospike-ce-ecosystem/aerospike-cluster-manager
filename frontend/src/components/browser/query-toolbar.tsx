"use client";

import { useState, useCallback, useMemo } from "react";
import { Play, Search, SlidersHorizontal, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/common/loading-button";
import { InlineAlert } from "@/components/common/inline-alert";
import { FormField } from "@/components/common/form-field";
import { LazyCodeEditor as CodeEditor } from "@/components/common/code-editor-lazy";
import { useQueryStore } from "@/stores/query-store";
import type { PredicateOperator } from "@/lib/api/types";
import { useToastStore } from "@/stores/toast-store";

export type ViewMode = "browse" | "query" | "pk";

const OPERATORS: { value: PredicateOperator; label: string }[] = [
  { value: "equals", label: "Equals" },
  { value: "between", label: "Between" },
  { value: "contains", label: "Contains" },
  { value: "geo_within_region", label: "Geo Within Region" },
  { value: "geo_contains_point", label: "Geo Contains Point" },
];

const MODE_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "browse", label: "Scan All" },
  { value: "query", label: "Index Query" },
  { value: "pk", label: "PK Lookup" },
];

interface QueryToolbarProps {
  connId: string;
  namespace: string;
  set: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onQueryExecuted: () => void;
}

export function QueryToolbar({
  connId,
  namespace,
  set,
  viewMode,
  onViewModeChange,
  onQueryExecuted,
}: QueryToolbarProps) {
  const store = useQueryStore();

  // Predicate local state
  const [predBin, setPredBin] = useState("");
  const [predOp, setPredOp] = useState<PredicateOperator>("equals");
  const [predValue, setPredValue] = useState("");
  const [predValue2, setPredValue2] = useState("");

  // Advanced section
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Known bins for multi-select (populated from previous results)
  const knownBins = useMemo(() => {
    const bins = new Set<string>();
    store.results.forEach((r) => Object.keys(r.bins).forEach((b) => bins.add(b)));
    return Array.from(bins).sort();
  }, [store.results]);

  const toggleBin = useCallback(
    (bin: string) => {
      const current = store.selectBins;
      if (current.includes(bin)) {
        store.setSelectBins(current.filter((b) => b !== bin));
      } else {
        store.setSelectBins([...current, bin]);
      }
    },
    [store],
  );

  const handleClear = useCallback(() => {
    setPredBin("");
    setPredOp("equals");
    setPredValue("");
    setPredValue2("");
    setAdvancedOpen(false);
    store.setPrimaryKey("");
    onViewModeChange("browse");
  }, [store, onViewModeChange]);

  const handleExecute = useCallback(async () => {
    if (viewMode === "pk") {
      if (!store.primaryKey.trim()) {
        useToastStore.getState().addToast("error", "Primary key is required");
        return;
      }
      store.setNamespace(namespace);
      store.setSet(set);
      store.setPredicate(null);
    } else if (viewMode === "query") {
      if (!predBin.trim()) {
        useToastStore.getState().addToast("error", "Predicate bin is required");
        return;
      }
      store.setNamespace(namespace);
      store.setSet(set);
      store.setPredicate({
        bin: predBin.trim(),
        operator: predOp,
        value: predValue,
        value2: predOp === "between" ? predValue2 : undefined,
      });
    }
    await store.executeQuery(connId);
    onQueryExecuted();
  }, [
    connId,
    namespace,
    set,
    viewMode,
    store,
    predBin,
    predOp,
    predValue,
    predValue2,
    onQueryExecuted,
  ]);

  const currentModeLabel = MODE_OPTIONS.find((o) => o.value === viewMode)?.label ?? "Scan All";
  const showClear = viewMode !== "browse";
  const showBadge = viewMode !== "browse" && store.hasExecuted;

  return (
    <div className="border-base-300/50 bg-base-100/60 space-y-0 border-b px-3 py-2 sm:px-6">
      {/* ── Main filter row ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Mode icon */}
        <SlidersHorizontal className="text-muted-foreground h-4 w-4 shrink-0" />

        {/* Mode select */}
        <Select
          value={viewMode}
          onChange={(e) => onViewModeChange(e.target.value as ViewMode)}
          className="h-8 w-[140px] text-xs font-medium"
          data-testid="filter-mode-select"
        >
          {MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>

        {/* PK Lookup inline fields */}
        {viewMode === "pk" && (
          <>
            <Input
              placeholder="Primary key..."
              value={store.primaryKey}
              onChange={(e) => store.setPrimaryKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleExecute()}
              className="h-8 max-w-[320px] min-w-[160px] flex-1 text-xs"
            />
            <LoadingButton
              onClick={handleExecute}
              disabled={store.loading}
              loading={store.loading}
              size="sm"
              className="h-8"
            >
              {!store.loading && <Search className="mr-1.5 h-3.5 w-3.5" />}
              Search
            </LoadingButton>
          </>
        )}

        {/* Index Query inline fields */}
        {viewMode === "query" && (
          <>
            <Input
              placeholder="bin_name"
              value={predBin}
              onChange={(e) => setPredBin(e.target.value)}
              className="h-8 w-[120px] text-xs"
            />
            <Select
              value={predOp}
              onChange={(e) => setPredOp(e.target.value as PredicateOperator)}
              className="h-8 w-[130px] text-xs"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </Select>
            <Input
              placeholder="value"
              value={predValue}
              onChange={(e) => setPredValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleExecute()}
              className="h-8 w-[120px] text-xs"
            />
            {predOp === "between" && (
              <Input
                placeholder="upper bound"
                value={predValue2}
                onChange={(e) => setPredValue2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleExecute()}
                className="h-8 w-[120px] text-xs"
              />
            )}
            <LoadingButton
              onClick={handleExecute}
              disabled={store.loading}
              loading={store.loading}
              size="sm"
              className="h-8"
            >
              {!store.loading && <Play className="mr-1.5 h-3.5 w-3.5" />}
              Execute
            </LoadingButton>
          </>
        )}

        {/* Clear button */}
        {showClear && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="text-muted-foreground hover:text-base-content h-8 gap-1 px-2 text-xs"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}

        {/* Active filter badge */}
        {showBadge && (
          <Badge variant="default" className="text-[10px]">
            {store.returnedRecords} result{store.returnedRecords !== 1 ? "s" : ""}
          </Badge>
        )}

        {/* Advanced toggle (query mode only) */}
        {viewMode === "query" && (
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="text-muted-foreground hover:text-base-content ml-auto flex items-center gap-1 text-xs transition-colors"
          >
            {advancedOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Advanced
          </button>
        )}
      </div>

      {/* ── Advanced section (full-width below) ──────── */}
      {viewMode === "query" && advancedOpen && (
        <div className="mt-3 space-y-3">
          {/* Expression Filter */}
          <FormField
            id="expression-filter"
            label="Expression Filter"
            hint="Raw JSON filter expression"
          >
            <div className="h-[120px] overflow-hidden rounded-md border">
              <CodeEditor
                value={store.expression}
                onChange={(v) => store.setExpression(v)}
                language="json"
                height="120px"
              />
            </div>
          </FormField>

          {/* Max Records */}
          <FormField id="max-records" label="Max Records" className="max-w-[200px]">
            <Input
              id="max-records"
              type="number"
              value={store.maxRecords}
              onChange={(e) => store.setMaxRecords(parseInt(e.target.value, 10) || 100)}
            />
          </FormField>

          {/* Bin Selection */}
          {knownBins.length > 0 && (
            <div>
              <Label className="text-xs">Select Bins (optional)</Label>
              <div className="border-base-300/60 mt-1 flex max-h-[120px] flex-wrap gap-3 overflow-auto rounded-lg border p-3">
                {knownBins.map((bin) => (
                  <div key={bin} className="flex items-center gap-1.5">
                    <Checkbox
                      id={`qbin-${bin}`}
                      checked={store.selectBins.includes(bin)}
                      onCheckedChange={() => toggleBin(bin)}
                    />
                    <label htmlFor={`qbin-${bin}`} className="cursor-pointer font-mono text-xs">
                      {bin}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <InlineAlert message={store.error} className={store.error ? "mt-2" : ""} />
    </div>
  );
}
