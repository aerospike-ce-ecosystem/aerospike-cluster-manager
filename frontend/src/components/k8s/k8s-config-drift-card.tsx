"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, FileCode, Hash, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
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

export function K8sConfigDriftCard({
  namespace,
  name,
  clusterDetail,
  className,
}: K8sConfigDriftCardProps) {
  const [drift, setDrift] = useState<ConfigDriftResponse | null>(null);
  const [loading, setLoading] = useState(true);

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
          <CardTitle className="text-base-content/60 text-sm font-normal">Config Status</CardTitle>
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
        <CardTitle className="text-base-content/60 flex items-center gap-2 text-sm font-normal">
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
              <Badge
                variant="outline"
                className="ml-auto border-amber-500/30 text-[10px] text-amber-600"
              >
                {drift.changedFields.length} field{drift.changedFields.length !== 1 ? "s" : ""}
              </Badge>
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-green-600">In Sync</span>
            </>
          )}
        </div>

        {/* Visual diff of changed fields */}
        {fieldDiffs.length > 0 && (
          <div className="space-y-2">
            <p className="text-base-content/60 text-xs font-medium">Spec vs Applied diff:</p>
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
          </div>
        )}

        {/* Fallback: show field badges when no detail available for diff */}
        {fieldDiffs.length === 0 && drift.changedFields.length > 0 && (
          <div>
            <p className="text-base-content/60 mb-1 text-xs">Changed fields:</p>
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
            <p className="text-base-content/60 mb-1.5 text-xs">Pod config versions:</p>
            <div className="space-y-1">
              {drift.podHashGroups.map((group, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center justify-between rounded px-2 py-1 text-xs",
                    group.isCurrent ? "bg-green-500/10" : "bg-amber-500/10",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Hash className="text-base-content/60 h-3 w-3" />
                    <span className="font-mono">{group.configHash?.slice(0, 8) || "unknown"}</span>
                    {group.isCurrent && (
                      <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                        current
                      </Badge>
                    )}
                  </div>
                  <span className="text-base-content/60">
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
