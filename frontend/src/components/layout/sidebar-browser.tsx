"use client";

import React, { useEffect, useReducer } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, Folder, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { useUIStore } from "@/stores/ui-store";
import type { NamespaceInfo } from "@/lib/api/types";

interface SidebarBrowserProps {
  connId: string;
  isMobileOrTablet: boolean;
}

export function SidebarBrowser({ connId, isMobileOrTablet }: SidebarBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
  const treeExpanded = useUIStore((s) => s.sidebarTreeExpanded);
  const toggleTree = useUIStore((s) => s.toggleSidebarTree);
  const [state, setState] = useReducer(
    (
      prev: { namespaces: NamespaceInfo[]; loading: boolean; error: string | null },
      action: Partial<typeof prev>,
    ) => ({
      ...prev,
      ...action,
    }),
    { namespaces: [], loading: true, error: null },
  );
  const [retryCount, retry] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    let cancelled = false;

    api
      .getCluster(connId)
      .then((data) => {
        if (!cancelled) setState({ namespaces: data.namespaces, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          // eslint-disable-next-line no-console -- intentional: surface namespace fetch failures
          console.error(`Failed to load namespaces for ${connId}:`, err);
          setState({ loading: false, error: "Failed to load" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connId, retryCount]);

  const { namespaces, loading, error } = state;

  const handleNavigate = (path: string) => {
    router.push(path);
    if (isMobileOrTablet) setMobileNavOpen(false);
  };

  return (
    <div className="flex flex-col px-2 pb-2">
      <span className="text-muted-foreground/70 px-2.5 pt-3 pb-1.5 text-[10px] font-semibold tracking-wider">
        BROWSER
      </span>

      {loading && (
        <div className="text-muted-foreground flex items-center gap-2 px-2.5 py-2 text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading...
        </div>
      )}

      {error && (
        <button
          onClick={retry}
          className="text-error hover:bg-base-200/40 flex items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors"
        >
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>{error}</span>
          <span className="text-muted-foreground ml-auto text-[10px]">Retry</span>
        </button>
      )}

      {!loading &&
        !error &&
        namespaces.map((ns) => {
          const isExpanded = treeExpanded[ns.name] ?? false;
          return (
            <div key={ns.name}>
              <button
                onClick={() => toggleTree(ns.name)}
                className="text-base-content/80 hover:bg-base-200/60 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
                ) : (
                  <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
                )}
                <Folder
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isExpanded ? "text-primary" : "text-accent",
                  )}
                />
                <span className="truncate">{ns.name}</span>
              </button>
              {isExpanded && ns.sets.length > 0 && (
                <div className="ml-3 flex flex-col gap-0.5 py-0.5">
                  {ns.sets.map((set) => {
                    const setPath = `/browser/${connId}/${ns.name}/${set.name}`;
                    const isActive = pathname === setPath;
                    return (
                      <button
                        key={set.name}
                        onClick={() => handleNavigate(setPath)}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-1 text-xs transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                            : "text-muted-foreground hover:text-base-content hover:bg-base-200/40",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-sm",
                            isActive ? "bg-primary" : "bg-muted-foreground/30",
                          )}
                        />
                        <span className="truncate">{set.name}</span>
                        <span className="text-muted-foreground/50 ml-auto font-mono text-[10px]">
                          {set.objects.toLocaleString()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
