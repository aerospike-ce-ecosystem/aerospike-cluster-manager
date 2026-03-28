"use client";

import { usePathname, useRouter } from "next/navigation";
import { Table2, Server, Database, Shield, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Overview", icon: Server, path: "cluster" },
  { label: "Namespaces", icon: Table2, path: "browser" },
  { label: "Indexes", icon: Database, path: "indexes" },
  { label: "Admin", icon: Shield, path: "admin" },
  { label: "UDFs", icon: Code2, path: "udfs" },
];

interface TabBarProps {
  connId: string;
}

export function TabBar({ connId }: TabBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleClick = (path: string) => {
    router.push(`/${path}/${connId}`);
  };

  return (
    <div className="bg-base-100/80 border-base-300 relative border-b backdrop-blur-md">
      <div className="w-full overflow-x-auto">
        <div className="flex h-10 items-center gap-0 px-1">
          {tabs.map((tab) => {
            const isActive = pathname?.startsWith(`/${tab.path}/`);
            return (
              <button
                key={tab.path}
                onClick={() => handleClick(tab.path)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative mx-0.5 flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-base-content hover:bg-base-200/50",
                )}
              >
                <tab.icon
                  className={cn("h-3.5 w-3.5 transition-colors", isActive ? "text-primary" : "")}
                />
                {tab.label}
                {isActive && (
                  <span className="bg-primary shadow-primary/30 absolute right-2 bottom-0 left-2 h-0.5 rounded-full shadow-[0_0_6px_1px]" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
