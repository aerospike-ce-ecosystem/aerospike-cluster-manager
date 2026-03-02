import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { K8sClusterPhase } from "@/lib/api/types";

const phaseConfig: Record<string, { label: string; className: string }> = {
  InProgress: {
    label: "In Progress",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  Completed: {
    label: "Running",
    className: "bg-success/10 text-success border-success/20",
  },
  Error: {
    label: "Error",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  ScalingUp: {
    label: "Scaling Up",
    className: "bg-info/10 text-info border-info/20",
  },
  ScalingDown: {
    label: "Scaling Down",
    className: "bg-info/10 text-info border-info/20",
  },
  WaitingForMigration: {
    label: "Migrating",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  RollingRestart: {
    label: "Restarting",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  ACLSync: {
    label: "ACL Sync",
    className: "bg-info/10 text-info border-info/20",
  },
  Paused: {
    label: "Paused",
    className: "bg-muted text-muted-foreground border-muted",
  },
  Deleting: {
    label: "Deleting",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  Unknown: {
    label: "Unknown",
    className: "bg-muted text-muted-foreground border-muted",
  },
};

export function K8sClusterStatusBadge({ phase }: { phase: K8sClusterPhase | string }) {
  const config = phaseConfig[phase] || phaseConfig.Unknown;
  return (
    <Badge variant="outline" className={cn("text-[11px]", config.className)}>
      {config.label}
    </Badge>
  );
}
