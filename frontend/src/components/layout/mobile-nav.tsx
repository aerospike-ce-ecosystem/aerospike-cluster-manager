"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Table2, Server, MoreHorizontal, Database, Shield, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";

const primaryTabs = [
  { label: "Namespaces", icon: Table2, path: "browser" },
  { label: "Overview", icon: Server, path: "cluster" },
];

const moreTabs = [
  { label: "Indexes", icon: Database, path: "indexes" },
  { label: "Admin", icon: Shield, path: "admin" },
  { label: "UDFs", icon: Code2, path: "udfs" },
];

interface MobileNavProps {
  connId: string;
}

export function MobileNav({ connId }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleClick = (path: string) => {
    router.push(`/${path}/${connId}`);
    setMoreOpen(false);
  };

  return (
    <>
      {/* More menu overlay */}
      {moreOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)}>
          <div
            className="bg-base-100 border-base-300 safe-bottom absolute right-2 bottom-16 z-50 rounded-lg border shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {moreTabs.map((tab) => {
              const isActive = pathname?.startsWith(`/${tab.path}/`);
              return (
                <button
                  key={tab.path}
                  onClick={() => handleClick(tab.path)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-base-content",
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="bg-base-100/95 border-base-300 fixed right-0 bottom-0 left-0 z-30 flex h-16 items-center justify-around border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
        {primaryTabs.map((tab) => {
          const isActive = pathname?.startsWith(`/${tab.path}/`);
          return (
            <button
              key={tab.path}
              onClick={() => handleClick(tab.path)}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <tab.icon className={cn("h-5 w-5", isActive && "text-primary")} />
              {tab.label}
            </button>
          );
        })}
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className={cn(
            "flex flex-col items-center gap-1 px-3 py-2 text-[10px] font-medium transition-colors",
            moreOpen || moreTabs.some((t) => pathname?.startsWith(`/${t.path}/`))
              ? "text-primary"
              : "text-muted-foreground",
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>
    </>
  );
}
