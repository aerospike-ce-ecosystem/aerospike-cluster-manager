import { Clock, Database, Network, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { formatNumber, formatUptime } from "@/lib/formatters";
import type { ClusterInfo } from "@/lib/api/types";

interface ClusterOverviewTabProps {
  cluster: ClusterInfo;
}

export function ClusterOverviewTab({ cluster }: ClusterOverviewTabProps) {
  const firstNode = cluster.nodes[0];
  const edition = firstNode?.edition ?? "Unknown";
  const build = firstNode?.build ?? "Unknown";

  return (
    <>
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs font-medium tracking-wider uppercase">
              <Server className="text-primary h-3.5 w-3.5" />
              Nodes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="metric-value text-3xl font-bold">{cluster.nodes.length}</div>
            <p className="text-base-content/60 mt-1 font-mono text-xs">
              {edition} {build}
            </p>
          </CardContent>
        </Card>

        <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs font-medium tracking-wider uppercase">
              <Database className="text-primary h-3.5 w-3.5" />
              Namespaces
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="metric-value text-3xl font-bold">{cluster.namespaces.length}</div>
            <p className="text-base-content/60 mt-1 text-xs">
              {cluster.namespaces.map((n) => n.name).join(", ")}
            </p>
          </CardContent>
        </Card>

        <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs font-medium tracking-wider uppercase">
              <Network className="text-primary h-3.5 w-3.5" />
              Node Names
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {cluster.nodes.map((node) => (
                <Badge key={node.name} variant="outline" className="font-mono text-[11px]">
                  {node.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Nodes Section */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Server className="text-base-content/60 h-4 w-4" />
          Nodes ({cluster.nodes.length})
        </h2>
        {cluster.nodes.length === 0 ? (
          <EmptyState
            icon={Server}
            title="No nodes"
            description="No nodes found in this cluster."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {cluster.nodes.map((node, idx) => (
              <Card
                key={node.name}
                className="animate-fade-in-up"
                style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: "backwards" }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-mono text-base">{node.name}</CardTitle>
                    <StatusBadge status="connected" label="Active" />
                  </div>
                  <CardDescription className="font-mono text-xs">
                    {node.address}:{node.port}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-base-content/60 text-xs tracking-wider uppercase">
                        Build
                      </span>
                      <p className="mt-0.5 font-medium">{node.build}</p>
                    </div>
                    <div>
                      <span className="text-base-content/60 text-xs tracking-wider uppercase">
                        Edition
                      </span>
                      <p className="mt-0.5 font-medium">{node.edition}</p>
                    </div>
                    <div>
                      <span className="text-base-content/60 text-xs tracking-wider uppercase">
                        Uptime
                      </span>
                      <p className="mt-0.5 flex items-center gap-1 font-medium">
                        <Clock className="text-base-content/60 h-3 w-3" />
                        {formatUptime(node.uptime)}
                      </p>
                    </div>
                    <div>
                      <span className="text-base-content/60 text-xs tracking-wider uppercase">
                        Connections
                      </span>
                      <p className="metric-value mt-0.5 font-medium">
                        {formatNumber(node.clientConnections)}
                      </p>
                    </div>
                    <div>
                      <span className="text-base-content/60 text-xs tracking-wider uppercase">
                        Cluster Size
                      </span>
                      <p className="metric-value mt-0.5 font-medium">{node.clusterSize}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
