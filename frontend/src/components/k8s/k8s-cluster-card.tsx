"use client";

import { Server, Clock, Container, AlertTriangle, RefreshCcw } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { K8sClusterStatusBadge } from "./k8s-cluster-status-badge";
import { InteractiveCard } from "@/components/common/interactive-card";
import type { K8sClusterSummary } from "@/lib/api/types";

interface K8sClusterCardProps {
  cluster: K8sClusterSummary;
  onClick?: () => void;
  index?: number;
}

export function K8sClusterCard({ cluster, onClick, index = 0 }: K8sClusterCardProps) {
  return (
    <InteractiveCard index={index} onClick={onClick}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base">{cluster.name}</CardTitle>
          <div className="flex items-center gap-1.5">
            {cluster.failedReconcileCount > 0 && (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <AlertTriangle className="h-3 w-3" />
                {cluster.failedReconcileCount}
              </Badge>
            )}
            {cluster.templateDrifted && (
              <Badge variant="outline" className="text-warning border-warning gap-1 text-[10px]">
                <RefreshCcw className="h-3 w-3" />
                Drift
              </Badge>
            )}
            <K8sClusterStatusBadge phase={cluster.phase} />
          </div>
        </div>
        <p className="text-base-content/60 font-mono text-xs">{cluster.namespace}</p>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1 text-[11px]">
            <Server className="h-3 w-3" />
            {cluster.size} node{cluster.size !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="secondary" className="gap-1 text-[11px]">
            <Container className="h-3 w-3" />
            {cluster.image}
          </Badge>
          {cluster.age && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              <Clock className="h-3 w-3" />
              {cluster.age}
            </Badge>
          )}
        </div>
      </CardContent>
    </InteractiveCard>
  );
}
