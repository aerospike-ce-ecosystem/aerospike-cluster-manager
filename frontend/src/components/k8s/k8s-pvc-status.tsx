"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import type { PVCInfo } from "@/lib/api/types";

interface K8sPVCStatusProps {
  namespace: string;
  name: string;
  className?: string;
}

function statusColor(status: string) {
  switch (status) {
    case "Bound":
      return "bg-success/10 text-success border-success/20";
    case "Pending":
      return "bg-warning/10 text-warning border-warning/20";
    case "Released":
      return "bg-info/10 text-info border-info/20";
    case "Failed":
      return "bg-error/10 text-error border-error/20";
    default:
      return "bg-base-200 text-base-content/60 border-base-300";
  }
}

export function K8sPVCStatus({ namespace, name, className }: K8sPVCStatusProps) {
  const [pvcs, setPvcs] = useState<PVCInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getK8sClusterPVCs(namespace, name)
      .then((data) => {
        if (!cancelled) setPvcs(data);
      })
      .catch(() => {
        if (!cancelled) setPvcs([]);
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
          <CardTitle className="text-base-content/60 flex items-center gap-2 text-sm font-normal">
            <HardDrive className="h-4 w-4" />
            Storage (PVCs)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-base-200 h-8 animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (pvcs.length === 0) return null;

  const boundCount = pvcs.filter((p) => p.status === "Bound").length;
  const orphanCount = pvcs.filter((p) => p.isOrphan).length;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base-content/60 flex items-center gap-2 text-sm font-normal">
          <HardDrive className="h-4 w-4" />
          Storage (PVCs)
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {boundCount}/{pvcs.length} Bound
            </Badge>
            {orphanCount > 0 && (
              <Badge
                variant="outline"
                className="bg-warning/10 text-warning border-warning/20 text-[10px]"
              >
                {orphanCount} Orphan
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-base-content/60 border-b text-left text-xs">
                <th className="pr-4 pb-2 font-medium">Name</th>
                <th className="pr-4 pb-2 font-medium">Status</th>
                <th className="pr-4 pb-2 font-medium">Pod</th>
                <th className="pr-4 pb-2 font-medium">Capacity</th>
                <th className="pr-4 pb-2 font-medium">Storage Class</th>
                <th className="pr-4 pb-2 font-medium">Access Modes</th>
                <th className="pb-2 font-medium">Volume</th>
              </tr>
            </thead>
            <tbody>
              {pvcs.map((pvc) => (
                <tr key={pvc.name} className="border-b last:border-b-0">
                  <td className="py-2 pr-4 font-mono text-xs">{pvc.name}</td>
                  <td className="py-2 pr-4">
                    <Badge variant="outline" className={cn("text-[10px]", statusColor(pvc.status))}>
                      {pvc.status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {pvc.isOrphan ? (
                      <span className="text-warning inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        (orphan)
                      </span>
                    ) : (
                      <span className="font-mono">{pvc.boundPod || "-"}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {pvc.capacity || pvc.requestedSize || "-"}
                  </td>
                  <td className="py-2 pr-4 text-xs">{pvc.storageClass || "-"}</td>
                  <td className="py-2 pr-4 text-xs">{pvc.accessModes.join(", ") || "-"}</td>
                  <td
                    className="max-w-[160px] truncate py-2 font-mono text-xs"
                    title={pvc.volumeName || ""}
                  >
                    {pvc.volumeName || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
