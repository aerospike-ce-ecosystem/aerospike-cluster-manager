import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { FileText, Database } from "lucide-react";
import { K8sPodLogsDialog } from "@/components/k8s/k8s-pod-logs-dialog";
import { EmptyState } from "@/components/common/empty-state";
import type { K8sPodStatus } from "@/lib/api/types";

interface K8sPodTableProps {
  pods: K8sPodStatus[];
  selectable?: boolean;
  selectedPods?: string[];
  onSelectionChange?: (selected: string[]) => void;
  namespace?: string;
  clusterName?: string;
}

export function K8sPodTable({
  pods,
  selectable = false,
  selectedPods = [],
  onSelectionChange,
  namespace,
  clusterName,
}: K8sPodTableProps) {
  const [logsPodName, setLogsPodName] = useState<string | null>(null);
  if (pods.length === 0) {
    return (
      <EmptyState
        icon={Database}
        title="No pods found"
        description="There are no pods running for this cluster yet."
      />
    );
  }

  const allSelected = pods.length > 0 && selectedPods.length === pods.length;
  const someSelected = selectedPods.length > 0 && selectedPods.length < pods.length;

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    onSelectionChange(checked ? pods.map((p) => p.name) : []);
  };

  const handleTogglePod = (podName: string, checked: boolean) => {
    if (!onSelectionChange) return;
    onSelectionChange(
      checked ? [...selectedPods, podName] : selectedPods.filter((n) => n !== podName),
    );
  };

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              {selectable && (
                <th scope="col" className="w-10 px-4 py-2 text-center">
                  <Checkbox
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all pods"
                  />
                </th>
              )}
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Name
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Node ID
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Rack
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Pod IP
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Host IP
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Image
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Config Status
              </th>
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Last Restart
              </th>
              {namespace && clusterName && (
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {pods.map((pod) => {
              const isSelected = selectedPods.includes(pod.name);
              return (
                <tr
                  key={pod.name}
                  className={cn(
                    "border-b last:border-0",
                    selectable && isSelected && "bg-accent/5",
                  )}
                >
                  {selectable && (
                    <td className="w-10 px-4 py-2 text-center">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => handleTogglePod(pod.name, checked)}
                        aria-label={`Select ${pod.name}`}
                      />
                    </td>
                  )}
                  <td className="px-4 py-2 font-mono text-xs">{pod.name}</td>
                  <td className="px-4 py-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        pod.isReady
                          ? "bg-success/10 text-success border-success/20"
                          : "bg-warning/10 text-warning border-warning/20",
                      )}
                    >
                      {pod.isReady ? "Ready" : pod.phase}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {pod.nodeId ? (
                      <span title={pod.nodeId} className="cursor-default">
                        {pod.nodeId.slice(0, 8)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {pod.rackId != null ? (
                      <Badge variant="outline" className="text-[11px]">
                        {pod.rackId}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{pod.podIP || "-"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{pod.hostIP || "-"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{pod.image || "-"}</td>
                  <td className="px-4 py-2">
                    {pod.dynamicConfigStatus ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[11px]",
                          pod.dynamicConfigStatus === "Applied" &&
                            "bg-success/10 text-success border-success/20",
                          pod.dynamicConfigStatus === "Failed" &&
                            "bg-destructive/10 text-destructive border-destructive/20",
                          pod.dynamicConfigStatus === "Pending" &&
                            "bg-warning/10 text-warning border-warning/20",
                        )}
                      >
                        {pod.dynamicConfigStatus}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {pod.lastRestartReason ? (
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium">{pod.lastRestartReason}</p>
                        {pod.lastRestartTime && (
                          <p className="text-muted-foreground text-[10px]">{pod.lastRestartTime}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </td>
                  {namespace && clusterName && (
                    <td className="px-4 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setLogsPodName(pod.name)}
                        title="View logs"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {namespace && clusterName && logsPodName && (
        <K8sPodLogsDialog
          open={!!logsPodName}
          onOpenChange={(open) => {
            if (!open) setLogsPodName(null);
          }}
          namespace={namespace}
          clusterName={clusterName}
          podName={logsPodName}
        />
      )}
    </>
  );
}
