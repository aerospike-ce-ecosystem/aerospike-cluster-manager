"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { FileCode, MoreHorizontal, Plus, Search, Server, Table2, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
import type { ConnectionProfile } from "@/lib/api/types";

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
            ? "bg-accent/10 text-accent"
            : "hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground",
        )}
      >
        <span
          className={cn(
            "ring-offset-sidebar h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-offset-1 transition-shadow",
            isChecking && !status
              ? "ring-muted-foreground/30"
              : status?.connected
                ? "status-glow-green ring-success/30"
                : "status-glow-red ring-destructive/30",
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
                : "bg-destructive",
          )}
        />
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
          <DropdownMenuItem onClick={() => handleNav("browser")}>
            <Table2 className="mr-2 h-4 w-4" /> Namespaces
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleNav("cluster")}>
            <Server className="mr-2 h-4 w-4" /> Overview
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

function SidebarContent({ isMobileOrTablet }: { isMobileOrTablet: boolean }) {
  const { connections, fetchConnections, fetchAllHealth } = useConnectionStore();
  const { k8sAvailable, checkAvailability } = useK8sClusterStore();
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
  const [search, setSearch] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetchConnections()
      .then(() => {
        fetchAllHealth();
      })
      .catch((err) => console.error("Failed to load sidebar connections:", err));

    const interval = setInterval(() => {
      fetchAllHealth();
    }, 30_000);

    return () => clearInterval(interval);
  }, [fetchConnections, fetchAllHealth]);

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

      <ScrollArea className="flex-1 px-2">
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
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      <div className="space-y-1 p-2.5">
        <Button
          variant="outline"
          size="sm"
          className="border-sidebar-border hover:border-accent/50 hover:bg-accent/5 hover:text-accent h-8 w-full justify-start gap-2 border-dashed text-xs transition-colors"
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
              className="border-sidebar-border hover:border-accent/50 hover:bg-accent/5 hover:text-accent h-8 w-full justify-start gap-2 border-dashed text-xs transition-colors"
              onClick={() => handleNavigation("/k8s/clusters/new")}
            >
              <Plus className="h-3.5 w-3.5" />
              Create Cluster
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-8 w-full justify-start gap-2 text-xs"
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
          className="text-muted-foreground hover:text-foreground h-8 w-full justify-start gap-2 text-xs"
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
        <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-accent/15 to-transparent" />
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
          className="bg-background/80 fixed inset-0 z-40 backdrop-blur-sm"
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
            className="text-muted-foreground hover:text-foreground h-8 w-8"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Separator className="bg-sidebar-border" />
        <SidebarContent isMobileOrTablet={true} />
      </aside>
    </>
  );
}
