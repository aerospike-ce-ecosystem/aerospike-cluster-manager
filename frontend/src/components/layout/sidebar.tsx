"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { FileCode, MoreHorizontal, Plus, Search, Server, Settings, X } from "lucide-react";
import { SidebarBrowser } from "./sidebar-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connection-store";
import { useK8sClusterStore } from "@/stores/k8s-cluster-store";
import { useUIStore } from "@/stores/ui-store";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useEventStream } from "@/hooks/use-event-stream";
import { SIDEBAR_HEALTH_POLL_INTERVAL_MS } from "@/lib/constants";
import type { ConnectionProfile, ConnectionHealthData, SSEEventType } from "@/lib/api/types";

interface ConnectionItemProps {
  connection: ConnectionProfile;
  isMobileOrTablet: boolean;
}

const ConnectionItem = React.memo(function ConnectionItem({
  connection,
  isMobileOrTablet,
}: ConnectionItemProps) {
  const router = useRouter();
  const pathname = usePathname();
  const selectConnection = useConnectionStore((s) => s.selectConnection);
  const status = useConnectionStore((s) => s.healthStatuses[connection.id]);
  const isChecking = useConnectionStore((s) => s.checkingHealth[connection.id]);
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);

  const isActive = pathname?.includes(`/${connection.id}`);

  const handleClick = () => {
    selectConnection(connection.id);
    router.push(`/browser/${connection.id}`);
    if (isMobileOrTablet) setMobileNavOpen(false);
  };

  const handleNav = (path: string) => {
    selectConnection(connection.id);
    router.push(`/${path}/${connection.id}`);
    if (isMobileOrTablet) setMobileNavOpen(false);
  };

  return (
    <div className="group flex items-center gap-0.5">
      <button
        onClick={handleClick}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-150",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-base-200/60 text-sidebar-foreground/80 hover:text-sidebar-foreground",
        )}
      >
        <span
          className={cn(
            "ring-offset-sidebar h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-offset-1 transition-shadow",
            isChecking && !status
              ? "ring-muted-foreground/30"
              : status?.connected
                ? "shadow-success/40 ring-success/30 shadow-[0_0_6px_1px]"
                : "shadow-error/40 ring-error/30 shadow-[0_0_6px_1px]",
          )}
          style={{ backgroundColor: connection.color }}
        />
        <span className="truncate font-medium">{connection.name}</span>
        <span
          className={cn(
            "ml-auto h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
            isChecking && !status
              ? "bg-muted-foreground animate-pulse"
              : status?.connected
                ? "bg-success"
                : "bg-error",
          )}
        >
          <span className="sr-only">
            {isChecking && !status ? "Checking" : status?.connected ? "Connected" : "Disconnected"}
          </span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-6 w-6 shrink-0 transition-opacity",
              isMobileOrTablet ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            aria-label={`More options for ${connection.name}`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleNav("cluster")}>
            <Server className="mr-2 h-4 w-4" /> Overview
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

const SIDEBAR_SSE_TYPES: SSEEventType[] = ["connection.health"];

function SidebarContent({ isMobileOrTablet }: { isMobileOrTablet: boolean }) {
  const { connections, fetchConnections, fetchAllHealth } = useConnectionStore();
  const { k8sAvailable, checkAvailability } = useK8sClusterStore();
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  // Detect active connection from URL
  const connIdMatch = pathname?.match(
    /\/(browser|cluster|indexes|admin|udfs|query|terminal|observability)\/([^/]+)/,
  );
  const activeConnId = connIdMatch?.[2];

  // SSE handler for connection health events
  const handleSSEEvent = useCallback((event: { event: string; data: unknown }) => {
    if (event.event === "connection.health") {
      const data = event.data as ConnectionHealthData;
      useConnectionStore.setState((state) => ({
        healthStatuses: {
          ...state.healthStatuses,
          [data.connectionId]: {
            connected: data.connected,
            nodeCount: data.nodeCount,
            namespaceCount: data.namespaceCount,
            build: data.build,
            edition: data.edition,
            memoryUsed: data.memoryUsed,
            memoryTotal: data.memoryTotal,
            diskUsed: data.diskUsed,
            diskTotal: data.diskTotal,
          },
        },
      }));
    }
  }, []);

  const { fallbackToPolling } = useEventStream({
    eventTypes: SIDEBAR_SSE_TYPES,
    onEvent: handleSSEEvent,
    enabled: true,
  });

  useEffect(() => {
    fetchConnections()
      .then(() => {
        fetchAllHealth();
      })
      .catch((err) => console.error("Failed to load sidebar connections:", err));

    // Only poll if SSE has fallen back to polling mode
    if (!fallbackToPolling) return;

    const interval = setInterval(() => {
      fetchAllHealth();
    }, SIDEBAR_HEALTH_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchConnections, fetchAllHealth, fallbackToPolling]);

  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  const filteredConnections = connections.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleNavigation = (path: string) => {
    router.push(path);
    if (isMobileOrTablet) setMobileNavOpen(false);
  };

  return (
    <>
      <div className="p-2.5">
        <div className="relative">
          <Search className="text-muted-foreground/50 absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            placeholder="Search connections..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-sidebar-accent/50 border-sidebar-border placeholder:text-muted-foreground/40 h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="overflow-auto px-2">
        <div className="space-y-0.5 py-1">
          {filteredConnections.length === 0 && search && (
            <p className="text-muted-foreground px-2 py-4 text-center text-xs">
              No connections found
            </p>
          )}
          {filteredConnections.map((conn) => (
            <ConnectionItem key={conn.id} connection={conn} isMobileOrTablet={isMobileOrTablet} />
          ))}
        </div>
      </div>

      {/* Namespace Tree Browser */}
      {activeConnId && (
        <div className="flex-1 overflow-auto">
          <SidebarBrowser
            key={activeConnId}
            connId={activeConnId}
            isMobileOrTablet={isMobileOrTablet}
          />
        </div>
      )}

      <div className="bg-base-300 mx-2 my-0 h-px" />

      <div className="space-y-1 p-2.5">
        <Button
          variant="outline"
          size="sm"
          className="border-sidebar-border hover:border-primary/50 hover:bg-primary/5 hover:text-primary h-8 w-full justify-start gap-2 border-dashed text-xs transition-colors"
          onClick={() => handleNavigation("/")}
        >
          <Plus className="h-3.5 w-3.5" />
          New Connection
        </Button>
        {k8sAvailable && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="border-sidebar-border hover:border-primary/50 hover:bg-primary/5 hover:text-primary h-8 w-full justify-start gap-2 border-dashed text-xs transition-colors"
              onClick={() => handleNavigation("/k8s/clusters/new")}
            >
              <Plus className="h-3.5 w-3.5" />
              Create Cluster
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-base-content h-8 w-full justify-start gap-2 text-xs"
              onClick={() => handleNavigation("/k8s/templates")}
            >
              <FileCode className="h-3.5 w-3.5" />
              AerospikeClusterTemplate
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-base-content h-8 w-full justify-start gap-2 text-xs"
          onClick={() => handleNavigation("/settings")}
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Button>
      </div>
    </>
  );
}

export function Sidebar() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
  const { isDesktop } = useBreakpoint();

  // Desktop: inline sidebar
  if (isDesktop) {
    if (!sidebarOpen) return null;
    return (
      <aside className="border-sidebar-border bg-sidebar relative flex w-56 flex-col border-r">
        <div className="via-primary/15 pointer-events-none absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent to-transparent" />
        <SidebarContent isMobileOrTablet={false} />
      </aside>
    );
  }

  // Mobile/Tablet: drawer pattern
  return (
    <>
      {/* Backdrop */}
      {mobileNavOpen && (
        <div
          className="bg-base-100/80 fixed inset-0 z-40 backdrop-blur-sm"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          "bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r shadow-xl transition-transform duration-300 ease-in-out",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Close button */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sidebar-foreground text-sm font-semibold">Clusters</span>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-base-content h-8 w-8"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="bg-base-300 mx-2 my-0 h-px" />
        <SidebarContent isMobileOrTablet={true} />
      </aside>
    </>
  );
}
