"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import type { K8sPodStatus, RackAwareConfig, RackConfig, MigrationStatus } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface K8sRackTopologyProps {
  rackConfig: RackAwareConfig | undefined | null;
  pods: K8sPodStatus[];
  migrationStatus?: MigrationStatus | null;
  className?: string;
}

type PodVisualStatus = "ready" | "not-ready" | "migrating" | "unstable";

interface RackGroup {
  rack: RackConfig;
  pods: K8sPodStatus[];
  zone: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPodStatus(pod: K8sPodStatus, migratingPods: Set<string>): PodVisualStatus {
  if (pod.unstableSince) return "unstable";
  if (migratingPods.has(pod.name)) return "migrating";
  if (pod.isReady) return "ready";
  return "not-ready";
}

const STATUS_STYLES: Record<PodVisualStatus, { dot: string; label: string }> = {
  ready: { dot: "bg-success", label: "Ready" },
  "not-ready": { dot: "bg-error", label: "Not Ready" },
  migrating: { dot: "bg-warning", label: "Migrating" },
  unstable: { dot: "bg-orange-500", label: "Unstable" },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PodIcon({ pod, status }: { pod: K8sPodStatus; status: PodVisualStatus }) {
  const style = STATUS_STYLES[status];
  // Extract short name: take last segment after the last dash-group
  const shortName = pod.name.split("-").slice(-2).join("-");

  return (
    <div
      className="bg-base-200 hover:bg-base-300 flex items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors"
      title={`${pod.name}\nPhase: ${pod.phase}\nNode: ${pod.nodeId ?? "N/A"}\nIP: ${pod.podIP ?? "N/A"}`}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)} />
      <span className="truncate font-mono text-[11px]">{shortName}</span>
    </div>
  );
}

function RackCard({
  rackGroup,
  migratingPods,
  expectedSize,
}: {
  rackGroup: RackGroup;
  migratingPods: Set<string>;
  expectedSize: number | null;
}) {
  const readyCount = rackGroup.pods.filter((p) => p.isReady).length;
  const totalCount = rackGroup.pods.length;

  return (
    <div className="bg-base-100 rounded-xl border p-3 shadow-sm">
      {/* Rack header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Rack {rackGroup.rack.id}</span>
          {rackGroup.rack.nodeName && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {rackGroup.rack.nodeName}
            </Badge>
          )}
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            readyCount === totalCount && totalCount > 0
              ? "bg-success/10 text-success border-success/20"
              : readyCount === 0 && totalCount > 0
                ? "bg-error/10 text-error border-error/20"
                : "bg-warning/10 text-warning border-warning/20",
          )}
        >
          {readyCount}/{expectedSize ?? totalCount} ready
        </Badge>
      </div>

      {/* Pod grid */}
      {totalCount === 0 ? (
        <p className="text-base-content/40 py-2 text-center text-xs">No pods</p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {rackGroup.pods.map((pod) => (
            <PodIcon key={pod.name} pod={pod} status={getPodStatus(pod, migratingPods)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function K8sRackTopology({
  rackConfig,
  pods,
  migrationStatus,
  className,
}: K8sRackTopologyProps) {
  const [expanded, setExpanded] = useState(true);

  // Build the set of pods currently migrating
  const migratingPods = useMemo(() => {
    const set = new Set<string>();
    if (migrationStatus?.inProgress && migrationStatus.pods) {
      for (const p of migrationStatus.pods) {
        if (p.migratingPartitions > 0) set.add(p.podName);
      }
    }
    return set;
  }, [migrationStatus]);

  // Group pods by rack, organized by zone
  const { zoneMap, zones } = useMemo(() => {
    const racks = rackConfig?.racks ?? [];
    const rackMap = new Map<number, RackConfig>();
    for (const r of racks) rackMap.set(r.id, r);

    // Group pods by rackId
    const podsByRack = new Map<number, K8sPodStatus[]>();
    const unassigned: K8sPodStatus[] = [];
    for (const pod of pods) {
      if (pod.rackId != null && rackMap.has(pod.rackId)) {
        const list = podsByRack.get(pod.rackId) ?? [];
        list.push(pod);
        podsByRack.set(pod.rackId, list);
      } else if (pod.rackId != null) {
        // Pod has a rackId but no matching rack config -- create a synthetic rack
        if (!rackMap.has(pod.rackId)) {
          rackMap.set(pod.rackId, { id: pod.rackId });
        }
        const list = podsByRack.get(pod.rackId) ?? [];
        list.push(pod);
        podsByRack.set(pod.rackId, list);
      } else {
        unassigned.push(pod);
      }
    }

    // Build rack groups
    const rackGroups: RackGroup[] = [];
    for (const [rackId, rack] of rackMap) {
      rackGroups.push({
        rack,
        pods: podsByRack.get(rackId) ?? [],
        zone: rack.zone ?? rack.region ?? "default",
      });
    }

    // Add unassigned pods as a virtual rack if any
    if (unassigned.length > 0) {
      rackGroups.push({
        rack: { id: -1 },
        pods: unassigned,
        zone: "unassigned",
      });
    }

    // Sort racks by id
    rackGroups.sort((a, b) => a.rack.id - b.rack.id);

    // Organize by zone
    const zm = new Map<string, RackGroup[]>();
    for (const rg of rackGroups) {
      const list = zm.get(rg.zone) ?? [];
      list.push(rg);
      zm.set(rg.zone, list);
    }

    const zoneNames = Array.from(zm.keys()).sort((a, b) => {
      // "default" and "unassigned" go last
      if (a === "default" || a === "unassigned") return 1;
      if (b === "default" || b === "unassigned") return -1;
      return a.localeCompare(b);
    });

    return { zoneMap: zm, zones: zoneNames };
  }, [rackConfig, pods]);

  // Don't render if there are no racks and no pods
  if (zones.length === 0) return null;

  // Determine the expected pod count per rack (evenly split by cluster size / rack count)
  const rackCount = rackConfig?.racks?.length ?? 1;
  const expectedSizePerRack = rackCount > 0 ? Math.ceil(pods.length / rackCount) : null;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <button
            type="button"
            className="flex items-center gap-2"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <LayoutGrid className="h-4 w-4" />
            Rack Topology
          </button>
          <div className="ml-auto flex items-center gap-3">
            {Object.entries(STATUS_STYLES).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1 text-[10px]">
                <span className={cn("h-2 w-2 rounded-full", val.dot)} />
                <span className="text-base-content/60">{val.label}</span>
              </div>
            ))}
          </div>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent>
          <div
            className={cn(
              "grid gap-4",
              zones.length === 1
                ? "grid-cols-1"
                : zones.length === 2
                  ? "grid-cols-1 md:grid-cols-2"
                  : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
            )}
          >
            {zones.map((zone) => {
              const rackGroups = zoneMap.get(zone) ?? [];
              const isDefault = zone === "default";
              const isUnassigned = zone === "unassigned";
              const zoneLabel = isDefault
                ? rackCount > 1
                  ? "All Zones"
                  : "Default"
                : isUnassigned
                  ? "Unassigned"
                  : zone;

              return (
                <div
                  key={zone}
                  className={cn(
                    "rounded-xl border-2 border-dashed p-3",
                    isUnassigned
                      ? "border-warning/30 bg-warning/5"
                      : "border-base-300 bg-base-200/30",
                  )}
                >
                  {/* Zone header */}
                  <div className="mb-3 flex items-center gap-2">
                    <Badge variant="outline" className="bg-base-100 text-[11px] font-medium">
                      {zoneLabel}
                    </Badge>
                    <span className="text-base-content/40 text-[10px]">
                      {rackGroups.length} rack{rackGroups.length !== 1 ? "s" : ""},{" "}
                      {rackGroups.reduce((sum, rg) => sum + rg.pods.length, 0)} pod
                      {rackGroups.reduce((sum, rg) => sum + rg.pods.length, 0) !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Racks within this zone */}
                  <div className="space-y-3">
                    {rackGroups.map((rg) => (
                      <RackCard
                        key={rg.rack.id}
                        rackGroup={rg}
                        migratingPods={migratingPods}
                        expectedSize={expectedSizePerRack}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
