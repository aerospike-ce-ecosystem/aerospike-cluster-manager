"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  AlertTriangle,
  FileCode,
  Hash,
  Minus,
  Plus,
  RotateCcw,
  Columns2,
  List,
} from "lucide-react";
import { cn, getErrorMessage } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { useToastStore } from "@/stores/toast-store";
import type { ConfigDriftResponse, K8sClusterDetail } from "@/lib/api/types";

interface K8sConfigDriftCardProps {
  namespace: string;
  name: string;
  /** When provided, the component computes a field-level diff from spec vs status */
  clusterDetail?: K8sClusterDetail;
  className?: string;
}

interface FieldDiff {
  path: string;
  specValue: unknown;
  appliedValue: unknown;
  type: "added" | "removed" | "changed";
}

function computeFieldDiffs(
  spec: Record<string, unknown>,
  appliedSpec: Record<string, unknown>,
  changedFields: string[],
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  for (const field of changedFields) {
    const specVal = spec[field];
    const appliedVal = appliedSpec[field];

    if (specVal !== undefined && appliedVal === undefined) {
      diffs.push({ path: field, specValue: specVal, appliedValue: undefined, type: "added" });
    } else if (specVal === undefined && appliedVal !== undefined) {
      diffs.push({ path: field, specValue: undefined, appliedValue: appliedVal, type: "removed" });
    } else {
      diffs.push({ path: field, specValue: specVal, appliedValue: appliedVal, type: "changed" });
    }
  }

  return diffs;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "(none)";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const s = JSON.stringify(value, null, 2);
    return s.length > 120 ? `${s.slice(0, 117)}...` : s;
  } catch {
    return String(value);
  }
}

type DiffLineType = "same" | "added" | "removed";

interface DiffLine {
  type: DiffLineType;
  left: string;
  right: string;
  leftNum: number | null;
  rightNum: number | null;
}

/** Compute a line-by-line unified diff between two JSON strings. */
function computeLineDiff(leftJson: string, rightJson: string): DiffLine[] {
  const leftLines = leftJson.split("\n");
  const rightLines = rightJson.split("\n");

  // Simple LCS-based diff for reasonable-sized configs
  const m = leftLines.length;
  const n = rightLines.length;

  // For large configs, fall back to a simpler approach
  if (m * n > 500_000) {
    const result: DiffLine[] = [];
    const maxLen = Math.max(m, n);
    for (let i = 0; i < maxLen; i++) {
      const l = i < m ? leftLines[i] : "";
      const r = i < n ? rightLines[i] : "";
      if (l === r) {
        result.push({ type: "same", left: l, right: r, leftNum: i + 1, rightNum: i + 1 });
      } else {
        if (i < m)
          result.push({ type: "removed", left: l, right: "", leftNum: i + 1, rightNum: null });
        if (i < n)
          result.push({ type: "added", left: "", right: r, leftNum: null, rightNum: i + 1 });
      }
    }
    return result;
  }

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        leftLines[i - 1] === rightLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftLines[i - 1] === rightLines[j - 1]) {
      result.push({
        type: "same",
        left: leftLines[i - 1],
        right: rightLines[j - 1],
        leftNum: i,
        rightNum: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({
        type: "added",
        left: "",
        right: rightLines[j - 1],
        leftNum: null,
        rightNum: j,
      });
      j--;
    } else {
      result.push({
        type: "removed",
        left: leftLines[i - 1],
        right: "",
        leftNum: i,
        rightNum: null,
      });
      i--;
    }
  }
  result.reverse();
  return result;
}

function SideBySideDiff({
  desired,
  applied,
}: {
  desired: Record<string, unknown> | null;
  applied: Record<string, unknown> | null;
}) {
  const leftJson = applied ? JSON.stringify(applied, null, 2) : "{}";
  const rightJson = desired ? JSON.stringify(desired, null, 2) : "{}";
  const lines = computeLineDiff(leftJson, rightJson);

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-2 text-[10px] font-medium">
        <span className="text-error/80">Applied (current)</span>
        <span className="text-green-600/80">Desired (spec)</span>
      </div>
      <div className="max-h-64 overflow-auto rounded border text-[11px]">
        <table className="w-full border-collapse font-mono">
          <tbody>
            {lines.map((line, idx) => (
              <tr
                key={idx}
                className={cn(
                  line.type === "added" && "bg-green-500/10",
                  line.type === "removed" && "bg-error/10",
                )}
              >
                <td className="text-base-content/50 w-8 border-r px-1 text-right select-none">
                  {line.leftNum ?? ""}
                </td>
                <td
                  className={cn(
                    "px-2 whitespace-pre",
                    line.type === "removed" && "text-error/80",
                    line.type === "same" && "text-base-content/70",
                  )}
                >
                  {line.left}
                </td>
                <td className="text-base-content/50 w-8 border-x px-1 text-right select-none">
                  {line.rightNum ?? ""}
                </td>
                <td
                  className={cn(
                    "px-2 whitespace-pre",
                    line.type === "added" && "text-green-600/80",
                    line.type === "same" && "text-base-content/70",
                  )}
                >
                  {line.right}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function K8sConfigDriftCard({
  namespace,
  name,
  clusterDetail,
  className,
}: K8sConfigDriftCardProps) {
  const [drift, setDrift] = useState<ConfigDriftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [diffView, setDiffView] = useState<"fields" | "side-by-side">("fields");

  useEffect(() => {
    let cancelled = false;
    api
      .getK8sClusterConfigDrift(namespace, name)
      .then((data) => {
        if (!cancelled) setDrift(data);
      })
      .catch(() => {
        if (!cancelled) setDrift(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [namespace, name]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base-content/50 text-sm font-normal">Config Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-base-200 h-8 animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!drift) return null;

  // Compute field-level diffs if cluster detail is available
  const fieldDiffs: FieldDiff[] =
    clusterDetail && drift.changedFields.length > 0
      ? computeFieldDiffs(
          drift.desiredConfig ?? (clusterDetail.spec as Record<string, unknown>) ?? {},
          drift.appliedConfig ?? {},
          drift.changedFields,
        )
      : [];

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base-content/50 flex items-center gap-2 text-sm font-normal">
          <FileCode className="h-4 w-4" />
          Config Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {drift.hasDrift ? (
            <>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-600">Config Drift Detected</span>
              <Badge variant="outline" className="border-amber-500/30 text-[10px] text-amber-600">
                {drift.changedFields.length} field{drift.changedFields.length !== 1 ? "s" : ""}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 gap-1 text-xs"
                disabled={reconciling}
                onClick={async () => {
                  setReconciling(true);
                  try {
                    await api.forceReconcileK8sCluster(namespace, name);
                    useToastStore.getState().addToast("success", "Force reconcile triggered");
                  } catch (err) {
                    useToastStore.getState().addToast("error", getErrorMessage(err));
                  } finally {
                    setReconciling(false);
                  }
                }}
              >
                <RotateCcw className={cn("h-3 w-3", reconciling && "animate-spin")} />
                Force Reconcile
              </Button>
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-green-600">In Sync</span>
            </>
          )}
        </div>

        {/* Diff view toggle + content */}
        {drift.hasDrift && (drift.desiredConfig || fieldDiffs.length > 0) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-base-content/50 text-xs font-medium">Spec vs Applied diff:</p>
              <div className="ml-auto flex rounded border text-[10px]">
                <button
                  type="button"
                  onClick={() => setDiffView("fields")}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5",
                    diffView === "fields"
                      ? "bg-primary/10 text-primary"
                      : "text-base-content/50 hover:bg-base-200",
                  )}
                >
                  <List className="h-3 w-3" />
                  Fields
                </button>
                <button
                  type="button"
                  onClick={() => setDiffView("side-by-side")}
                  className={cn(
                    "flex items-center gap-1 border-l px-2 py-0.5",
                    diffView === "side-by-side"
                      ? "bg-primary/10 text-primary"
                      : "text-base-content/50 hover:bg-base-200",
                  )}
                >
                  <Columns2 className="h-3 w-3" />
                  Side-by-side
                </button>
              </div>
            </div>

            {diffView === "fields" && fieldDiffs.length > 0 && (
              <div className="overflow-hidden rounded border">
                {fieldDiffs.map((diff) => (
                  <div key={diff.path} className="border-b last:border-b-0">
                    <div className="bg-base-200/50 flex items-center gap-1.5 px-3 py-1.5">
                      <span className="text-xs font-medium">{diff.path}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "ml-auto px-1 py-0 text-[10px]",
                          diff.type === "added" && "border-green-500/30 text-green-600",
                          diff.type === "removed" && "border-error/30 text-error",
                          diff.type === "changed" && "border-amber-500/30 text-amber-600",
                        )}
                      >
                        {diff.type}
                      </Badge>
                    </div>
                    <div className="space-y-0 px-3 py-1.5 text-xs">
                      {diff.appliedValue !== undefined && (
                        <div className="bg-error/5 flex items-start gap-1.5 rounded px-2 py-1">
                          <Minus className="text-error mt-0.5 h-3 w-3 shrink-0" />
                          <pre className="text-error/80 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-pre-wrap">
                            {formatValue(diff.appliedValue)}
                          </pre>
                        </div>
                      )}
                      {diff.specValue !== undefined && (
                        <div className="flex items-start gap-1.5 rounded bg-green-500/5 px-2 py-1">
                          <Plus className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                          <pre className="overflow-hidden font-mono text-[11px] text-ellipsis whitespace-pre-wrap text-green-600/80">
                            {formatValue(diff.specValue)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {diffView === "side-by-side" && (
              <SideBySideDiff desired={drift.desiredConfig} applied={drift.appliedConfig} />
            )}
          </div>
        )}

        {/* Fallback: show field badges when no detail available for diff */}
        {fieldDiffs.length === 0 && drift.changedFields.length > 0 && (
          <div>
            <p className="text-base-content/50 mb-1 text-xs">Changed fields:</p>
            <div className="flex flex-wrap gap-1">
              {drift.changedFields.map((field) => (
                <Badge key={field} variant="outline" className="text-xs">
                  {field}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {drift.podHashGroups.length > 1 && (
          <div>
            <p className="text-base-content/50 mb-1.5 text-xs">Pod config versions:</p>
            <div className="space-y-1">
              {drift.podHashGroups.map((group) => (
                <div
                  key={`${group.configHash ?? "unknown"}-${group.isCurrent}`}
                  className={cn(
                    "flex items-center justify-between rounded px-2 py-1 text-xs",
                    group.isCurrent ? "bg-green-500/10" : "bg-amber-500/10",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Hash className="text-base-content/50 h-3 w-3" />
                    <span className="font-mono">{group.configHash?.slice(0, 8) || "unknown"}</span>
                    {group.isCurrent && (
                      <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                        current
                      </Badge>
                    )}
                  </div>
                  <span className="text-base-content/50">
                    {group.pods.length} pod{group.pods.length !== 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
