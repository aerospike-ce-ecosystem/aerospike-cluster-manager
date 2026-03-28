"use client";

import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Database,
  FlaskConical,
  HardDrive,
  Layers,
  Plus,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes, formatNumber, formatUptime } from "@/lib/formatters";
import { StatusBadge } from "@/components/common/status-badge";
import type { ClusterInfo, NamespaceInfo } from "@/lib/api/types";

interface UnifiedOverviewProps {
  cluster: ClusterInfo;
  connId: string;
  onCreateSampleData?: () => void;
  onCreateSet?: (namespace: string) => void;
}

function MetricCard({
  label,
  value,
  subtitle,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="border-base-300 bg-base-100 flex flex-col gap-2 rounded-xl border p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-base-content/40 text-[11px] font-medium">{label}</span>
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", iconBg)}>
          <Icon className={cn("h-3.5 w-3.5", iconColor)} />
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-base-content text-2xl font-extrabold">{value}</span>
        {subtitle && <span className="text-base-content/40 text-xs font-medium">{subtitle}</span>}
      </div>
    </div>
  );
}

function NamespaceRow({
  ns,
  connId,
  onCreateSet,
}: {
  ns: NamespaceInfo;
  connId: string;
  onCreateSet?: (namespace: string) => void;
}) {
  const router = useRouter();
  const memPct = ns.memoryTotal > 0 ? Math.round((ns.memoryUsed / ns.memoryTotal) * 100) : 0;
  const isWarning = ns.stopWrites || ns.hwmBreached;

  return (
    <div className="border-base-300/60 bg-base-200/30 flex flex-col overflow-hidden rounded-xl border">
      {/* Header — stacks on mobile */}
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "h-9 w-1 shrink-0 rounded-full",
              isWarning
                ? "from-error to-error/70 bg-gradient-to-b"
                : "from-primary to-primary/70 bg-gradient-to-b",
            )}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-base-content text-sm font-bold">{ns.name}</span>
              <StatusBadge
                status={ns.stopWrites ? "error" : ns.hwmBreached ? "warning" : "ready"}
                label={ns.stopWrites ? "Stop Writes" : ns.hwmBreached ? "HWM Breached" : "Healthy"}
              />
            </div>
            <span className="text-base-content/40 text-[10px]">
              {ns.sets.length} set{ns.sets.length !== 1 ? "s" : ""} · RF {ns.replicationFactor}
            </span>
          </div>
        </div>

        {/* Metrics — 2-col grid on mobile, inline on desktop */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-4 sm:flex sm:flex-1 sm:gap-5 sm:pl-0">
          <div className="flex flex-col gap-0.5">
            <span className="text-base-content/30 text-[9px] font-medium tracking-wider">
              OBJECTS
            </span>
            <span className="text-base-content font-mono text-xs font-semibold">
              {formatNumber(ns.objects)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-base-content/30 text-[9px] font-medium tracking-wider">
              MEMORY
            </span>
            <span className="text-base-content font-mono text-xs font-semibold">
              {formatBytes(ns.memoryUsed)} / {formatBytes(ns.memoryTotal)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-base-content/30 text-[9px] font-medium tracking-wider">HWM</span>
            <span
              className={cn(
                "font-mono text-xs font-semibold",
                ns.highWaterMemoryPct > 70 ? "text-warning" : "text-success",
              )}
            >
              {ns.highWaterMemoryPct}%
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-base-content/30 text-[9px] font-medium tracking-wider">TTL</span>
            <span className="text-base-content/50 font-mono text-xs font-semibold">
              {ns.defaultTtl === 0 ? "None" : `${ns.defaultTtl}s`}
            </span>
          </div>
        </div>

        {/* Memory bar — desktop only */}
        <div className="hidden w-16 flex-col gap-1 sm:flex">
          <div className="bg-base-300 h-1 w-full overflow-hidden rounded-full">
            <div
              className={cn("h-full rounded-full", memPct > 80 ? "bg-error" : "bg-primary")}
              style={{ width: `${Math.max(memPct, 1)}%` }}
            />
          </div>
          <span className="text-base-content/30 text-right text-[9px]">{memPct}%</span>
        </div>
      </div>

      {/* Sets */}
      <div className="border-base-300/40 flex flex-wrap items-center gap-1.5 border-t px-4 py-2.5 sm:px-5">
        {ns.sets.map((set) => (
          <button
            key={set.name}
            onClick={() => router.push(`/browser/${connId}/${ns.name}/${set.name}`)}
            className="border-base-300 bg-base-100 hover:border-primary/30 hover:bg-primary/5 group flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors"
          >
            <span className="text-base-content font-medium">{set.name}</span>
            <span className="text-base-content/30 bg-base-200 rounded px-1.5 py-0.5 font-mono text-[10px]">
              {formatNumber(set.objects)}
            </span>
            <ChevronRight className="text-base-content/20 group-hover:text-primary h-3 w-3 transition-colors" />
          </button>
        ))}
        {onCreateSet && (
          <button
            onClick={() => onCreateSet(ns.name)}
            className="text-primary/70 hover:text-primary hover:border-primary/40 hover:bg-primary/5 border-primary/20 flex items-center gap-1 rounded-lg border border-dashed px-2.5 py-1.5 text-xs font-medium transition-colors"
          >
            <Plus className="h-3 w-3" />
            <span>Create Set</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function UnifiedOverview({
  cluster,
  connId,
  onCreateSampleData,
  onCreateSet,
}: UnifiedOverviewProps) {
  const totalObjects = cluster.namespaces.reduce((sum, ns) => sum + ns.objects, 0);
  const totalMemUsed = cluster.namespaces.reduce((sum, ns) => sum + ns.memoryUsed, 0);
  const totalMemTotal = cluster.namespaces.reduce((sum, ns) => sum + ns.memoryTotal, 0);
  const memPct = totalMemTotal > 0 ? Math.round((totalMemUsed / totalMemTotal) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Metric Cards — 2x2 on mobile, 4-col on desktop */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Active Nodes"
          value={String(cluster.nodes.length)}
          subtitle={`/ ${cluster.nodes.length} healthy`}
          icon={Server}
          iconBg="bg-success/10"
          iconColor="text-success"
        />
        <MetricCard
          label="Namespaces"
          value={String(cluster.namespaces.length)}
          subtitle="/ 2 max"
          icon={Database}
          iconBg="bg-primary/10"
          iconColor="text-primary"
        />
        <MetricCard
          label="Total Objects"
          value={formatNumber(totalObjects)}
          icon={Layers}
          iconBg="bg-warning/10"
          iconColor="text-warning"
        />
        <MetricCard
          label="Memory Usage"
          value={`${memPct}%`}
          subtitle={formatBytes(totalMemUsed)}
          icon={HardDrive}
          iconBg="bg-[#7C3AED]/10"
          iconColor="text-[#7C3AED]"
        />
      </div>

      {/* Namespaces + Nodes — stacks on mobile, side-by-side on lg */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Namespaces */}
        <div className="border-base-300 bg-base-100 flex min-w-0 flex-col gap-3 rounded-xl border p-4 shadow-sm sm:p-5 lg:flex-[3]">
          <div className="flex items-center justify-between">
            <span className="text-base-content text-sm font-bold">Namespaces</span>
            <div className="flex items-center gap-2">
              <span className="text-base-content/30 text-xs">
                {cluster.namespaces.length} / 2 max (CE)
              </span>
              {onCreateSampleData && (
                <button
                  onClick={onCreateSampleData}
                  className="text-primary bg-primary/5 hover:bg-primary/10 border-primary/20 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors"
                >
                  <FlaskConical className="h-3 w-3" />
                  Sample Data
                </button>
              )}
            </div>
          </div>
          {cluster.namespaces.map((ns) => (
            <NamespaceRow key={ns.name} ns={ns} connId={connId} onCreateSet={onCreateSet} />
          ))}
        </div>

        {/* Nodes */}
        <div className="border-base-300 bg-base-100 flex flex-col gap-3 rounded-xl border p-4 shadow-sm sm:p-5 lg:flex-1">
          <span className="text-base-content text-sm font-bold">Nodes</span>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {cluster.nodes.map((node) => (
              <div
                key={node.name}
                className="border-base-300/60 bg-base-200/30 flex flex-col gap-2 rounded-lg border p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="bg-success shadow-success/15 h-1.5 w-1.5 rounded-full shadow-[0_0_0_2px]" />
                    <span className="text-base-content truncate font-mono text-xs font-semibold">
                      {node.name}
                    </span>
                  </div>
                  <span className="bg-success/10 text-success rounded px-2 py-0.5 text-[9px] font-semibold">
                    ONLINE
                  </span>
                </div>
                <div className="flex gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-base-content/25 text-[9px]">UPTIME</span>
                    <span className="text-base-content font-mono text-[11px] font-semibold">
                      {formatUptime(node.uptime)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-base-content/25 text-[9px]">CLIENTS</span>
                    <span className="text-base-content font-mono text-[11px] font-semibold">
                      {node.clientConnections}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-base-content/25 text-[9px]">BUILD</span>
                    <span className="text-base-content font-mono text-[11px] font-semibold">
                      {node.build}
                    </span>
                  </div>
                </div>
                <span className="text-base-content/30 truncate font-mono text-[9px]">
                  {node.address}:{node.port}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
