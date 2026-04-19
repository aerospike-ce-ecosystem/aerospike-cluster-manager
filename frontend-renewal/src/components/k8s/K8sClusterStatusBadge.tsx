import { Badge } from "@/components/Badge"

type Phase =
  | "InProgress"
  | "Completed"
  | "Error"
  | "ScalingUp"
  | "ScalingDown"
  | "WaitingForMigration"
  | "RollingRestart"
  | "ACLSync"
  | "Paused"
  | "Deleting"
  | "Unknown"
  | string

const phaseConfig: Record<
  string,
  { label: string; variant: "default" | "neutral" | "success" | "warning" | "error" }
> = {
  InProgress: { label: "In Progress", variant: "warning" },
  Completed: { label: "Running", variant: "success" },
  Error: { label: "Error", variant: "error" },
  ScalingUp: { label: "Scaling Up", variant: "default" },
  ScalingDown: { label: "Scaling Down", variant: "default" },
  WaitingForMigration: { label: "Migrating", variant: "warning" },
  RollingRestart: { label: "Restarting", variant: "warning" },
  ACLSync: { label: "ACL Sync", variant: "default" },
  Paused: { label: "Paused", variant: "neutral" },
  Deleting: { label: "Deleting", variant: "error" },
  Unknown: { label: "Unknown", variant: "neutral" },
}

export const TRANSITIONAL_PHASES: Phase[] = [
  "InProgress",
  "ScalingUp",
  "ScalingDown",
  "WaitingForMigration",
  "RollingRestart",
  "ACLSync",
  "Deleting",
]

export function K8sClusterStatusBadge({ phase }: { phase: Phase }) {
  const config = phaseConfig[phase] ?? phaseConfig.Unknown
  return <Badge variant={config.variant}>{config.label}</Badge>
}
