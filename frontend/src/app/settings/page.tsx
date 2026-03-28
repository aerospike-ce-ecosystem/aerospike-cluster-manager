"use client";

import { useSyncExternalStore } from "react";
import {
  Sun,
  Moon,
  Monitor,
  Info,
  Database,
  AlertTriangle,
  Server,
  HardDrive,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { useUIStore, type Theme } from "@/stores/ui-store";
import { CE_LIMITS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/page-header";

const themeOptions: {
  value: Theme;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  { value: "light", label: "Light", icon: Sun, description: "Clean, bright interface" },
  { value: "dark", label: "Dark", icon: Moon, description: "Easy on the eyes" },
  { value: "system", label: "System", icon: Monitor, description: "Follow OS preference" },
];

const emptySubscribe = () => () => {};

export default function SettingsPage() {
  const { theme, setTheme } = useUIStore();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) return null;

  return (
    <div className="animate-fade-in mx-auto max-w-2xl space-y-6 p-6 lg:p-8">
      <PageHeader title="Settings" description="Application preferences and information" />

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Customize the look and feel of the application</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-200",
                  theme === opt.value
                    ? "border-accent bg-accent/5 shadow-sm"
                    : "border-base-300/60 hover:border-accent/40 hover:bg-base-200/30",
                )}
              >
                <opt.icon
                  className={cn(
                    "h-6 w-6 transition-colors",
                    theme === opt.value ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <div className="text-center">
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      theme === opt.value ? "text-primary" : "text-base-content",
                    )}
                  >
                    {opt.label}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-[10px]">
                    {opt.description}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* CE Limitations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="text-warning h-4 w-4" />
            Aerospike CE Limitations
          </CardTitle>
          <CardDescription>Community Edition restrictions to be aware of</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="border-base-300/60 hover:bg-base-200/20 flex items-center justify-between rounded-lg border px-4 py-3 transition-colors">
              <div className="flex items-center gap-3">
                <Server className="text-muted-foreground h-4 w-4" />
                <div>
                  <p className="text-sm font-medium">Max Nodes per Cluster</p>
                  <p className="text-muted-foreground text-xs">
                    Cluster cannot exceed this node count
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="font-mono">
                {CE_LIMITS.MAX_NODES}
              </Badge>
            </div>

            <div className="border-base-300/60 hover:bg-base-200/20 flex items-center justify-between rounded-lg border px-4 py-3 transition-colors">
              <div className="flex items-center gap-3">
                <Database className="text-muted-foreground h-4 w-4" />
                <div>
                  <p className="text-sm font-medium">Max Namespaces</p>
                  <p className="text-muted-foreground text-xs">
                    Maximum number of namespaces per cluster
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="font-mono">
                {CE_LIMITS.MAX_NAMESPACES}
              </Badge>
            </div>

            <div className="border-base-300/60 hover:bg-base-200/20 flex items-center justify-between rounded-lg border px-4 py-3 transition-colors">
              <div className="flex items-center gap-3">
                <HardDrive className="text-muted-foreground h-4 w-4" />
                <div>
                  <p className="text-sm font-medium">Max Data Capacity</p>
                  <p className="text-muted-foreground text-xs">
                    Approximately 5TB total (2.5TB unique data)
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="font-mono">
                ~{CE_LIMITS.MAX_DATA_TB} TB
              </Badge>
            </div>

            <div className="border-base-300/60 hover:bg-base-200/20 flex items-center justify-between rounded-lg border px-4 py-3 transition-colors">
              <div className="flex items-center gap-3">
                <Trash2 className="text-muted-foreground h-4 w-4" />
                <div>
                  <p className="text-sm font-medium">Durable Deletes</p>
                  <p className="text-muted-foreground text-xs">
                    Deletes not persistent across cold restarts
                  </p>
                </div>
              </div>
              <Badge variant="destructive" className="text-[11px]">
                Not Supported
              </Badge>
            </div>

            <div className="border-base-300/60 hover:bg-base-200/20 flex items-center justify-between rounded-lg border px-4 py-3 transition-colors">
              <div className="flex items-center gap-3">
                <Server className="text-muted-foreground h-4 w-4" />
                <div>
                  <p className="text-sm font-medium">XDR (Cross Datacenter Replication)</p>
                  <p className="text-muted-foreground text-xs">Enterprise-only feature</p>
                </div>
              </div>
              <Badge variant="destructive" className="text-[11px]">
                Not Supported
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="text-primary h-4 w-4" />
            About
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Application</span>
              <span className="font-medium">Aerospike Cluster Manager</span>
            </div>
            <div className="bg-base-300/50 my-0 h-px" />
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono text-xs">0.1.0</span>
            </div>
            <div className="bg-base-300/50 my-0 h-px" />
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Framework</span>
              <span className="font-mono text-xs">Next.js 16</span>
            </div>
            <div className="bg-base-300/50 my-0 h-px" />
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">UI Library</span>
              <span className="font-mono text-xs">Tailwind CSS 4</span>
            </div>
            <div className="bg-base-300/50 my-0 h-px" />
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Backend Client</span>
              <span className="font-mono text-xs">aerospike-py</span>
            </div>
            <div className="bg-base-300/50 my-0 h-px" />
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Observability</span>
              <span className="font-mono text-xs">OpenTelemetry / Prometheus</span>
            </div>
            <div className="bg-base-300/50 my-0 h-px" />
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Desktop</span>
              <span className="font-mono text-xs">Tauri 2 (planned)</span>
            </div>
          </div>

          <div className="bg-base-200/40 text-muted-foreground dark:bg-base-200/20 rounded-lg p-3.5 text-xs leading-relaxed">
            This application is designed for managing Aerospike Community Edition clusters. It
            provides data browsing, query building, index management, user/role administration, UDF
            management, and OTel-based observability through a modern web interface.
          </div>
        </CardContent>
      </Card>

      {/* Keyboard Shortcuts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keyboard Shortcuts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-muted-foreground">Toggle Sidebar</span>
              <div className="flex gap-1">
                <kbd className="bg-base-200/50 rounded-md border px-2 py-0.5 font-mono text-[11px] shadow-sm">
                  Cmd
                </kbd>
                <kbd className="bg-base-200/50 rounded-md border px-2 py-0.5 font-mono text-[11px] shadow-sm">
                  B
                </kbd>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
