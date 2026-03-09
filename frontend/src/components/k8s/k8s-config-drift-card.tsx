"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, FileCode, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import type { ConfigDriftResponse } from "@/lib/api/types";

interface K8sConfigDriftCardProps {
  namespace: string;
  name: string;
  className?: string;
}

export function K8sConfigDriftCard({ namespace, name, className }: K8sConfigDriftCardProps) {
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
          <CardTitle className="text-muted-foreground text-sm font-normal">Config Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted h-8 animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!drift) return null;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-normal">
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
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-green-600">In Sync</span>
            </>
          )}
        </div>

        {drift.changedFields.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1 text-xs">Changed fields:</p>
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
            <p className="text-muted-foreground mb-1.5 text-xs">Pod config versions:</p>
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
                    <Hash className="text-muted-foreground h-3 w-3" />
                    <span className="font-mono">{group.configHash?.slice(0, 8) || "unknown"}</span>
                    {group.isCurrent && (
                      <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                        current
                      </Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground">
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
