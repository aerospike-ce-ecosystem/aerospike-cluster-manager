"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  Clock,
  Filter,
  RefreshCw,
  Shield,
  Server,
  Layers,
  Activity,
  Globe,
  BarChart3,
  FileText,
  Zap,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { K8sClusterEvent, EventCategory } from "@/lib/api/types";
import { EVENT_CATEGORIES } from "@/lib/api/types";

const CATEGORY_CONFIG: Record<EventCategory, { icon: React.ElementType; color: string }> = {
  Lifecycle: { icon: Activity, color: "text-blue-500" },
  "Rolling Restart": { icon: RefreshCw, color: "text-orange-500" },
  Configuration: { icon: FileText, color: "text-purple-500" },
  "ACL Security": { icon: Shield, color: "text-red-500" },
  Scaling: { icon: Layers, color: "text-green-500" },
  "Rack Management": { icon: Server, color: "text-cyan-500" },
  Network: { icon: Globe, color: "text-indigo-500" },
  Monitoring: { icon: BarChart3, color: "text-yellow-500" },
  Template: { icon: FileText, color: "text-pink-500" },
  "Circuit Breaker": { icon: Zap, color: "text-red-600" },
  Other: { icon: Circle, color: "text-gray-500" },
};

function formatTimestamp(ts?: string): string {
  if (!ts) return "";
  try {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return "just now";
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  } catch {
    return ts;
  }
}

interface K8sEventTimelineProps {
  events: K8sClusterEvent[];
  className?: string;
}

export function K8sEventTimeline({ events, className }: K8sEventTimelineProps) {
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null);

  const categoryCounts = events.reduce<Record<string, number>>((acc, e) => {
    const cat = e.category || "Other";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const filteredEvents = selectedCategory
    ? events.filter((e) => (e.category || "Other") === selectedCategory)
    : events;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Events
            <Badge variant="secondary" className="ml-1">
              {filteredEvents.length}
            </Badge>
          </CardTitle>
          {selectedCategory && (
            <button
              onClick={() => setSelectedCategory(null)}
              className="text-base-content/60 hover:text-base-content flex items-center gap-1 text-xs"
            >
              <Filter className="h-3 w-3" />
              Clear filter
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {EVENT_CATEGORIES.filter((cat) => categoryCounts[cat]).map((cat) => {
            const config = CATEGORY_CONFIG[cat];
            const Icon = config.icon;
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(isSelected ? null : cat)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-base-300 hover:bg-base-200 text-base-content/60",
                )}
              >
                <Icon className={cn("h-3 w-3", config.color)} />
                {cat}
                <span className="ml-0.5 opacity-60">{categoryCounts[cat]}</span>
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        {filteredEvents.length === 0 ? (
          <p className="text-base-content/60 py-4 text-center text-sm">No events</p>
        ) : (
          <div className="space-y-1">
            {filteredEvents.map((event, i) => {
              const cat = (event.category || "Other") as EventCategory;
              const config = CATEGORY_CONFIG[cat];
              const Icon = config.icon;
              const isWarning = event.type === "Warning";
              return (
                <div
                  key={`${event.source ?? ""}-${event.reason ?? ""}-${event.firstTimestamp ?? ""}-${event.lastTimestamp ?? ""}-${event.message?.slice(0, 20) ?? ""}-${i}`}
                  className={cn(
                    "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm",
                    isWarning ? "bg-error/5" : "hover:bg-base-200/50",
                  )}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {isWarning ? (
                      <AlertTriangle className="text-error h-3.5 w-3.5" />
                    ) : (
                      <Icon className={cn("h-3.5 w-3.5", config.color)} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{event.reason}</span>
                      {(event.count ?? 0) > 1 && (
                        <Badge variant="outline" className="px-1 py-0 text-[10px]">
                          x{event.count}
                        </Badge>
                      )}
                    </div>
                    <p className="text-base-content/60 truncate text-xs">{event.message}</p>
                  </div>
                  <span className="text-base-content/60 flex-shrink-0 text-xs">
                    {formatTimestamp(event.lastTimestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
